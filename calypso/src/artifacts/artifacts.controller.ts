import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { CurrentActor } from '../common/current-actor.decorator';
import { Actor } from '../common/actor';
import { ArtifactsService } from './artifacts.service';
import { StorageService } from '../storage/storage.service';
import {
  AddVersionDto,
  CreateArtifactDto,
  GrantDto,
  ListArtifactsQuery,
  ReleaseDto,
  toArtifactDto,
  toVersionView,
} from './dto/artifact-crud.dto';
import { CONTRACT_VERSION, toArtifactSummary, toVersionRecord } from './observer.dto';

function toGrantInput(dto: GrantDto): { type: 'user'; knoxId: string } | { type: 'department'; department: string } {
  if (dto.type === 'user') return { type: 'user', knoxId: dto.knoxId as string };
  return { type: 'department', department: dto.department as string };
}

/**
 * Calypso - 파일형 산출물 등록 창구이자 Observer 계약의 레퍼런스 구현.
 *
 * 라우트가 두 부류다.
 *  - 사람이 쓰는 것: 목록·등록·업로드·릴리스·다운로드
 *  - SIREN이 호출하는 것: /artifacts/:id/current-version, /artifacts/:id/versions, /artifacts
 *    (docs/observer-contract-v1.yaml)
 */
@Controller('artifacts')
export class ArtifactsController {
  constructor(
    private readonly artifacts: ArtifactsService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  private get publicBaseUrl(): string {
    return this.config.get<string>('publicBaseUrl') ?? 'http://localhost:5174';
  }

  // ── 사람이 쓰는 화면용 ─────────────────────────────────────────────

  /**
   * `mine=true`면 내가 등록한 것만 - My Task 필터 (Hub 설계서 §14.3). 접근 등급이
   * none인 산출물은 이미 service.list()에서 걸러졌으므로 여기 남은 건 전부 edit
   * 아니면 view다.
   */
  @Get()
  async list(@Query() query: ListArtifactsQuery, @CurrentActor() me: Actor) {
    const list = await this.artifacts.list(query, me);
    return {
      data: list.map((a) => toArtifactDto(a, this.artifacts.computeAccess(a, me) as 'edit' | 'view')),
    };
  }

  @Post()
  async create(@Body() dto: CreateArtifactDto, @CurrentActor() me: Actor) {
    const a = await this.artifacts.create(dto, me);
    return { data: toArtifactDto(a, 'edit') };
  }

  /** none이면 존재 자체를 흘리지 않고 404 — findVisibleOrThrow가 막는다. */
  @Get(':id')
  async detail(@Param('id') id: string, @CurrentActor() me: Actor) {
    const a = await this.artifacts.findVisibleOrThrow(id, me);
    const access = this.artifacts.computeAccess(a, me) as 'edit' | 'view';
    const versions = access === 'edit' ? a.versions : a.versions.filter((v) => v.isReleased);
    return {
      data: {
        ...toArtifactDto(a, access),
        versions: versions.map(toVersionView),
      },
    };
  }

  /** editors/viewGrants에 부여 추가 — 부여자 본인이 edit 권한을 갖고 있어야 한다. */
  @Post(':id/editors')
  async addEditor(@Param('id') id: string, @Body() dto: GrantDto, @CurrentActor() me: Actor) {
    const a = await this.artifacts.addGrant(id, 'editors', toGrantInput(dto), me);
    return { data: toArtifactDto(a, 'edit') };
  }

  @Delete(':id/editors')
  async removeEditor(@Param('id') id: string, @Body() dto: GrantDto, @CurrentActor() me: Actor) {
    const a = await this.artifacts.removeGrant(id, 'editors', toGrantInput(dto), me);
    return { data: toArtifactDto(a, 'edit') };
  }

  @Post(':id/view-grants')
  async addViewGrant(@Param('id') id: string, @Body() dto: GrantDto, @CurrentActor() me: Actor) {
    const a = await this.artifacts.addGrant(id, 'viewGrants', toGrantInput(dto), me);
    return { data: toArtifactDto(a, 'edit') };
  }

  @Delete(':id/view-grants')
  async removeViewGrant(@Param('id') id: string, @Body() dto: GrantDto, @CurrentActor() me: Actor) {
    const a = await this.artifacts.removeGrant(id, 'viewGrants', toGrantInput(dto), me);
    return { data: toArtifactDto(a, 'edit') };
  }

  /**
   * 업로드 = minor +1. 바이트를 받아 Calypso 몫의 오브젝트 스토리지에 올린다 -
   * SIREN 본체와 다른 S3_FOLDER를 쓰므로 네임스페이스가 분리된다(Hub 설계서 §3.7).
   */
  @Post(':id/versions')
  @UseInterceptors(FileInterceptor('file'))
  async addVersion(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: AddVersionDto,
    @CurrentActor() me: Actor,
  ) {
    if (!file) throw new BadRequestException('A file is required (multipart form field "file").');
    const a = await this.artifacts.findOrThrow(id);
    // 스토리지에 올리기 전에 권한부터 본다 — 권한 없는 업로드가 먼저 파일을 써버리는 걸 막는다.
    if (this.artifacts.computeAccess(a, me) !== 'edit') {
      throw new ForbiddenException('You do not have edit access to this artifact.');
    }
    const storageKey = this.storage.buildStorageKey(
      a.projectId,
      a._id.toString(),
      this.artifacts.nextVersionLabel(a),
      file.originalname,
    );
    await this.storage.upload(storageKey, file.buffer, {
      originalname: file.originalname,
      uploader: me.knoxId,
    });
    const saved = await this.artifacts.addVersion(
      id,
      { fileName: file.originalname, storageKey, note: dto.note, dept: dto.dept ?? null },
      me,
    );
    return { data: toArtifactDto(saved, 'edit') };
  }

  @Post(':id/release')
  async release(@Param('id') id: string, @Body() dto: ReleaseDto, @CurrentActor() me: Actor) {
    const a = await this.artifacts.release(id, dto.note, me);
    return { data: toArtifactDto(a, 'edit') };
  }

  /**
   * 다운로드. **실물 파일에 대한 접근 판정은 여기서 한다** - SIREN이 아니라 이 서비스가
   * 자기 데이터의 문지기다(Hub 설계서 §7.1). view 등급은 released 버전만 받을 수 있다 —
   * 목록/상세와 같은 마스킹 규칙(사용자 요청).
   */
  @Get(':id/download/:versionRef')
  async download(
    @Param('id') id: string,
    @Param('versionRef') versionRef: string,
    @CurrentActor() me: Actor,
  ): Promise<StreamableFile> {
    const a = await this.artifacts.findVisibleOrThrow(id, me);
    const access = this.artifacts.computeAccess(a, me);
    const version = a.versions.find((v) => v.versionRef === decodeURIComponent(versionRef));
    if (!version) throw new NotFoundException('Version not found.');
    if (access !== 'edit' && !version.isReleased) {
      throw new ForbiddenException('Only released versions are available at your access level.');
    }
    if (!version.storageKey) throw new BadRequestException('This version has no stored file.');

    const body = await this.storage.download(version.storageKey);
    if (!body) throw new NotFoundException('The stored file could not be found.');
    return new StreamableFile(body, {
      type: 'application/octet-stream',
      disposition: `attachment; filename="${encodeURIComponent(version.fileName)}"`,
    });
  }

  // ── SIREN이 호출하는 Observer 계약 ────────────────────────────────

  /** 계약 §/artifacts - project/department로 스코프해서 고를 수 있어야 한다. */
  @Get('observer/list')
  @Header('X-Observer-Contract', CONTRACT_VERSION)
  async observerList(@Query() query: ListArtifactsQuery, @CurrentActor() me: Actor) {
    const list = await this.artifacts.list({ ...query, mine: undefined }, me);
    return list.map((a) => toArtifactSummary(a, this.publicBaseUrl));
  }

  /** 계약 §/artifacts/{id}/current-version */
  @Get(':id/current-version')
  @Header('X-Observer-Contract', CONTRACT_VERSION)
  async currentVersion(@Param('id') id: string) {
    const a = await this.artifacts.findOrThrow(id);
    const latest = a.versions[0];
    if (!latest) throw new NotFoundException('This artifact has no version yet.');
    return toVersionRecord(a, latest, this.publicBaseUrl);
  }

  /**
   * 계약 §/artifacts/{id}/versions - 최신순 전부.
   * 마스킹은 SIREN이 giver 여부로 한다(§6.2). 여기서는 아는 대로 다 준다.
   */
  @Get(':id/versions')
  @Header('X-Observer-Contract', CONTRACT_VERSION)
  async versions(@Param('id') id: string) {
    const a = await this.artifacts.findOrThrow(id);
    return a.versions.map((v) => toVersionRecord(a, v, this.publicBaseUrl));
  }
}
