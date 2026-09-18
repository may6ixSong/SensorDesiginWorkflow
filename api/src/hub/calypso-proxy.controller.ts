import {
  BadGatewayException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpException,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { Actor } from '../common/actor';
import { canAccessProject, myDepartments } from '../common/access';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { Artifact, ArtifactDocument } from '../artifacts/schemas/artifact.schema';
import { CALYPSO_SERVICE_KEY, CalypsoClientService } from './calypso-client.service';
import { HubSyncService } from './hub-sync.service';
import {
  CalypsoAddVersionDto, CalypsoGrantDto, CalypsoReleaseDto, CreateCalypsoArtifactDto,
  SetCalypsoNetworkDto, SetCalypsoRestrictViewDto,
} from './dto/calypso-proxy.dto';

/**
 * SIREN BE가 대신 호출하는 File Artifacts(Calypso, Tier B) 프록시(설계서 07장 §2).
 *
 * ★ 원칙 — SIREN FE는 이제 Calypso backend를 절대 직접 호출하지 않는다. 목록·상세·
 *   업로드·다운로드·release·editors/view-grants 전부 여기를 거친다. 브라우저가
 *   knoxId/departments/actingAs를 직접 계산해서 싣던 것도 이제 여기서 (actor + SIREN
 *   project 멤버십으로) 대신 계산한다 — FE가 보낸 값은 신뢰하지 않는다.
 *
 * ★ 게이트는 두 겹이다.
 *   1) SIREN 쪽 — 호출자가 그 `projectId`의 project member인가(project 계층, 설계서
 *      01장 §2.2). 아니면 애초에 Calypso에 물어보지도 않는다.
 *   2) Calypso 쪽 — 그 project 안에서의 실제 department로 계산한 편집/열람 등급
 *      (editors/viewGrants). Calypso 자체 데이터가 유일한 진실이라(설계서 04장 §3.1),
 *      SIREN은 그 응답(상태 코드·본문)을 그대로 손님에게 되돌려줄 뿐 다시 판정하지
 *      않는다 — 없는 걸 502로 뭉개지 않고, Calypso가 준 403/404를 그대로 전달한다.
 *
 * ★ Calypso는 SIREN의 projectId를 그대로 쓰므로(§11.4 — workflow를 모른다) 모든 라우트가
 *   `projectId`를 받는다 — 그 project의 실제 member 로스터에서 department를 계산해야
 *   Calypso의 부서 단위 grant 판정이 정확해지기 때문이다(브라우저가 예전에 매 화면마다
 *   `setCalypsoUserDepartments()`로 실어보내던 값과 같은 계산을 여기서 대신 한다).
 *
 * ★ 업로드/다운로드는 진짜로 스트리밍한다 — 업로드는 Multer가 올린 버퍼 하나를 그대로
 *   한 번 더 포워딩할 뿐이고, 다운로드는 Calypso 응답 바디를 Node Readable로 그대로
 *   넘겨 StreamableFile로 흘려보낸다(메모리에 파일 전체를 다시 담지 않는다).
 */
@Controller('calypso-artifacts')
export class CalypsoProxyController {
  private readonly logger = new Logger(CalypsoProxyController.name);

  constructor(
    private readonly calypso: CalypsoClientService,
    private readonly hubSync: HubSyncService,
    @InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>,
    @InjectModel(Artifact.name) private readonly artifactModel: Model<ArtifactDocument>,
  ) {}

  /** 게이트 1 — project member 여부 확인 후, 그 project 안에서의 실제 department를 계산한다. */
  private async resolveContext(
    projectId: string | undefined,
    actor: Actor,
  ): Promise<{ departments: string[]; isAdmin: boolean }> {
    if (!projectId) throw new NotFoundException('projectId is required.');
    const project = await this.projectModel.findById(projectId).exec();
    if (!project) throw new NotFoundException('Project not found.');
    if (!canAccessProject(actor, project)) {
      throw new ForbiddenException('You do not have access to this project.');
    }
    const isAdmin = actor.isAdmin && !actor.isImpersonating;
    return { departments: myDepartments(actor, project), isAdmin };
  }

  /** Calypso가 준 상태 코드·본문을 그대로 돌려준다 — 게이트 2는 항상 Calypso가 최종 판정한다. */
  private relay(result: { status: number; body: any } | null): any {
    if (!result) {
      throw new BadGatewayException('Could not reach the file service (Calypso). Check that it is running.');
    }
    if (result.status >= 200 && result.status < 300) return result.body;
    throw new HttpException(result.body ?? { message: 'File service request failed.' }, result.status);
  }

  /**
   * SIREN이 직접 프록시한 publish/upload 직후, 이 artifact가 이미 어떤 workflow에
   * 매핑돼 있으면 그 자리에서 SIREN 캐시(artifact.versions)를 즉시 갱신한다(설계서 07장
   * §4.3, "문제 2" 수정).
   *
   * ★ 이게 없으면 Calypso 발행 이벤트 발신기(문제 1)나 야간 재동기화(문제 3, 아직 미스케줄)
   *   없이는 SIREN UI를 거쳐 publish해도 SIREN 자신의 캐시가 영원히 갱신되지 않는다 —
   *   그런데 SIREN BE는 이미 이 프록시 호출 경로 위에 있고 knoxId/isAdmin도 이미 갖고
   *   있으므로, 여기서 pullFullHistory를 한 번 더 부르는 것이 가장 싸게 해결하는 방법이다.
   * ★ 아직 매핑되지 않은 artifact(어느 workflow도 이 externalArtifactId를 참조하지 않음)는
   *   조용히 건너뛴다 — 매핑되는 순간 ArtifactSourceService가 전체 이력을 한 번에 pull한다.
   * ★ 실패해도 방금 끝난 publish/upload 자체는 이미 성공했으므로 에러를 던지지 않는다 —
   *   사용자에게 보여줄 결과는 이미 `relay()`가 반환한 뒤다. (리뷰 결함 2 — 이전 버전은
   *   이 약속을 주석으로만 적어 두고 실제로는 findOne/save가 던지는 예외를 그대로
   *   호출부까지 흘려보내, 이미 성공한 publish/upload가 500으로 보이는 경우가 있었다.)
   */
  private async syncCache(externalArtifactId: string, knoxId: string, isAdmin: boolean): Promise<void> {
    try {
      const artifact = await this.artifactModel
        .findOne({ serviceKey: CALYPSO_SERVICE_KEY, externalArtifactId })
        .exec();
      if (!artifact) return;
      await this.hubSync.pullFullHistory(artifact, knoxId, isAdmin);
      await artifact.save();
    } catch (e) {
      this.logger.warn(`cache sync after Calypso publish/upload failed for ${externalArtifactId} — ${(e as Error).message}`);
    }
  }

  /**
   * Access 패널의 부서/멤버 로스터. `resolveContext`(project 멤버십)로 게이트 1을 확인한
   * 뒤 Calypso로 넘긴다 — Calypso가 다시 SIREN 자신의 `/hub/common`을 불러 답한다
   * (`SirenCommonService` 참고, 사용자 결정으로 일부러 이 왕복을 거친다).
   */
  @Get('department-roster')
  async departmentRoster(@Query('projectId') projectId: string, @CurrentActor() me: Actor) {
    const { departments, isAdmin } = await this.resolveContext(projectId, me);
    const result = await this.calypso.getDepartmentRoster(projectId, me.knoxId, departments, isAdmin);
    return this.relay(result);
  }

  @Get()
  async list(
    @Query('projectId') projectId: string,
    @Query('department') department: string | undefined,
    @Query('mine') mine: string | undefined,
    @CurrentActor() me: Actor,
  ) {
    const { departments, isAdmin } = await this.resolveContext(projectId, me);
    // listArtifacts()(artifact-source.service.ts용)는 pickability 계산에 필요한 최소
    // 모양만 준다 — 이 화면(ArtifactListPage)은 원래 calypsoApi로 직접 받던 전체 몸통
    // (설명·등록자·버전 요약 등)이 필요하므로 별도의 "그대로 relay" 경로를 쓴다.
    const result = await this.calypso.listArtifactsFull(projectId, department, mine === 'true', me.knoxId, departments, isAdmin);
    return this.relay(result);
  }

  @Post()
  async create(@Body() dto: CreateCalypsoArtifactDto, @CurrentActor() me: Actor) {
    const { departments, isAdmin } = await this.resolveContext(dto.projectId, me);
    const result = await this.calypso.createArtifact(dto, me.knoxId, departments, isAdmin);
    return this.relay(result);
  }

  @Get(':id')
  async detail(
    @Param('id') id: string,
    @Query('projectId') projectId: string,
    @CurrentActor() me: Actor,
  ) {
    const { departments, isAdmin } = await this.resolveContext(projectId, me);
    const result = await this.calypso.getArtifact(id, me.knoxId, departments, isAdmin);
    return this.relay(result);
  }

  /**
   * 파일(multipart `files`)은 network와 무관하게 항상 올 수 있고, 그 위에
   * linksJson(OA)/pathsJson(HPC)도 같이 올 수 있다(사용자 요청, §3.9) — 검증은
   * Calypso가 한다.
   */
  @Post(':id/versions')
  @UseInterceptors(FilesInterceptor('files'))
  async addVersion(
    @Param('id') id: string,
    @Query('projectId') projectId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body() dto: CalypsoAddVersionDto,
    @CurrentActor() me: Actor,
  ) {
    const { departments, isAdmin } = await this.resolveContext(projectId, me);
    const result = await this.calypso.uploadVersion(
      id,
      { files, linksJson: dto.linksJson, pathsJson: dto.pathsJson, versionNote: dto.versionNote, description: dto.description },
      me.knoxId,
      departments,
      isAdmin,
    );
    const body = this.relay(result);
    await this.syncCache(id, me.knoxId, isAdmin);
    return body;
  }

  /** 파일이 하나면 그대로, 여러 개면 zip으로 묶여서 온다 — Calypso가 그 판정을 한다(§3.9). */
  @Get(':id/download/:versionRef')
  async download(
    @Param('id') id: string,
    @Param('versionRef') versionRef: string,
    @Query('projectId') projectId: string,
    @CurrentActor() me: Actor,
  ): Promise<StreamableFile> {
    const { departments, isAdmin } = await this.resolveContext(projectId, me);
    const result = await this.calypso.downloadVersion(id, versionRef, me.knoxId, departments, isAdmin);
    if (!result) {
      throw new BadGatewayException('Could not reach the file service (Calypso). Check that it is running.');
    }
    if (!result.stream) {
      throw new HttpException(result.body ?? { message: 'Download failed.' }, result.status);
    }
    return new StreamableFile(result.stream, {
      type: result.contentType ?? 'application/octet-stream',
      disposition: result.contentDisposition ?? undefined,
    });
  }

  @Post(':id/release')
  async release(
    @Param('id') id: string,
    @Query('projectId') projectId: string,
    @Body() dto: CalypsoReleaseDto,
    @CurrentActor() me: Actor,
  ) {
    const { departments, isAdmin } = await this.resolveContext(projectId, me);
    const result = await this.calypso.release(
      id, dto.versionNote, dto.description, me.knoxId, departments, isAdmin, dto.sourceVersionRef,
    );
    const body = this.relay(result);
    await this.syncCache(id, me.knoxId, isAdmin);
    return body;
  }

  @Post(':id/editors')
  async addEditor(
    @Param('id') id: string,
    @Query('projectId') projectId: string,
    @Body() dto: CalypsoGrantDto,
    @CurrentActor() me: Actor,
  ) {
    const { departments, isAdmin } = await this.resolveContext(projectId, me);
    const result = await this.calypso.addGrant(id, 'editors', toGrantInput(dto), me.knoxId, departments, isAdmin);
    return this.relay(result);
  }

  @Delete(':id/editors')
  async removeEditor(
    @Param('id') id: string,
    @Query('projectId') projectId: string,
    @Body() dto: CalypsoGrantDto,
    @CurrentActor() me: Actor,
  ) {
    const { departments, isAdmin } = await this.resolveContext(projectId, me);
    const result = await this.calypso.removeGrant(id, 'editors', toGrantInput(dto), me.knoxId, departments, isAdmin);
    return this.relay(result);
  }

  @Post(':id/view-grants')
  async addViewGrant(
    @Param('id') id: string,
    @Query('projectId') projectId: string,
    @Body() dto: CalypsoGrantDto,
    @CurrentActor() me: Actor,
  ) {
    const { departments, isAdmin } = await this.resolveContext(projectId, me);
    const result = await this.calypso.addGrant(id, 'view-grants', toGrantInput(dto), me.knoxId, departments, isAdmin);
    return this.relay(result);
  }

  @Delete(':id/view-grants')
  async removeViewGrant(
    @Param('id') id: string,
    @Query('projectId') projectId: string,
    @Body() dto: CalypsoGrantDto,
    @CurrentActor() me: Actor,
  ) {
    const { departments, isAdmin } = await this.resolveContext(projectId, me);
    const result = await this.calypso.removeGrant(id, 'view-grants', toGrantInput(dto), me.knoxId, departments, isAdmin);
    return this.relay(result);
  }

  @Patch(':id/restrict-view')
  async setRestrictView(
    @Param('id') id: string,
    @Query('projectId') projectId: string,
    @Body() dto: SetCalypsoRestrictViewDto,
    @CurrentActor() me: Actor,
  ) {
    const { departments, isAdmin } = await this.resolveContext(projectId, me);
    const result = await this.calypso.setRestrictView(id, dto.restrictView, me.knoxId, departments, isAdmin);
    return this.relay(result);
  }

  /** network를 언제든 바꿀 수 있게 한다(사용자 요청) — edit 권한자만. */
  @Patch(':id/network')
  async setNetwork(
    @Param('id') id: string,
    @Query('projectId') projectId: string,
    @Body() dto: SetCalypsoNetworkDto,
    @CurrentActor() me: Actor,
  ) {
    const { departments, isAdmin } = await this.resolveContext(projectId, me);
    const result = await this.calypso.setNetwork(id, dto.network, me.knoxId, departments, isAdmin);
    return this.relay(result);
  }
}

function toGrantInput(dto: CalypsoGrantDto): { type: 'user'; knoxId: string } | { type: 'department'; department: string } {
  if (dto.type === 'user') return { type: 'user', knoxId: dto.knoxId as string };
  return { type: 'department', department: dto.department as string };
}
