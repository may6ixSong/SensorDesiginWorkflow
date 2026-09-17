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
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ZipArchive } from 'archiver';
import { CurrentActor } from '../common/current-actor.decorator';
import { Actor } from '../common/actor';
import { SirenCallerGuard } from '../common/siren-caller.guard';
import { ArtifactsService } from './artifacts.service';
import { StorageService } from '../storage/storage.service';
import {
  AddVersionDto,
  CreateArtifactDto,
  GrantDto,
  ListArtifactsQuery,
  ReleaseDto,
  SetNetworkDto,
  SetRestrictViewDto,
  parseLinksJson,
  parsePathsJson,
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
 *
 * ★ 지금은 이 컨트롤러의 라우트 전부를 SIREN BE만 부른다 — Calypso 자체 프론트엔드를
 *   당분간 안 쓰기로 했다(§11.5). 그래서 `SirenCallerGuard`(공유 비밀 토큰 검증)를 클래스
 *   전체에 건다. **Calypso가 나중에 자기 프론트엔드를 새로 가지면 이 가드 적용 범위를
 *   다시 나눠야 한다** — 사람이 직접 로그인해서 쓰는 라우트(목록·업로드·릴리스 등)와
 *   SIREN만 불러야 하는 라우트(observer 계약)를 갈라야 하기 때문이다.
 */
@Controller('artifacts')
@UseGuards(SirenCallerGuard)
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

  /** view 기본 개방(false, 프로젝트 멤버 누구나) ↔ viewGrants로만 제한(true) 전환. edit 권한자만. */
  @Patch(':id/restrict-view')
  async setRestrictView(@Param('id') id: string, @Body() dto: SetRestrictViewDto, @CurrentActor() me: Actor) {
    const a = await this.artifacts.setRestrictView(id, dto.restrictView, me);
    return { data: toArtifactDto(a, 'edit') };
  }

  /** network를 언제든 바꿀 수 있게 한다(사용자 요청) — edit 권한자만. */
  @Patch(':id/network')
  async setNetwork(@Param('id') id: string, @Body() dto: SetNetworkDto, @CurrentActor() me: Actor) {
    const a = await this.artifacts.setNetwork(id, dto.network, me);
    return { data: toArtifactDto(a, 'edit') };
  }

  /**
   * 업로드 = minor +1. 파일은 network와 무관하게 항상 올릴 수 있고(오브젝트 스토리지,
   * SIREN 본체와 다른 S3_FOLDER — Hub 설계서 §3.7), 그 위에 network에 맞는 위치
   * 정보(OA면 링크, HPC면 경로)도 몇 개든 같이 붙일 수 있다(사용자 요청, §3.9).
   */
  @Post(':id/versions')
  @UseInterceptors(FilesInterceptor('files'))
  async addVersion(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body() dto: AddVersionDto,
    @CurrentActor() me: Actor,
  ) {
    const a = await this.artifacts.findOrThrow(id);
    // 스토리지에 올리기 전에 권한부터 본다 — 권한 없는 업로드가 먼저 파일을 써버리는 걸 막는다.
    if (this.artifacts.computeAccess(a, me) !== 'edit') {
      throw new ForbiddenException('You do not have edit access to this artifact.');
    }

    const nextLabel = this.artifacts.nextVersionLabel(a);
    const uploaded = await Promise.all(
      (files ?? []).map(async (file) => {
        const storageKey = this.storage.buildStorageKey(a.projectId, a._id.toString(), nextLabel, file.originalname);
        await this.storage.upload(storageKey, file.buffer, { originalname: file.originalname, uploader: me.knoxId });
        return { fileName: file.originalname, storageKey };
      }),
    );

    const saved = await this.artifacts.addVersion(
      id,
      {
        files: uploaded,
        links: parseLinksJson(dto.linksJson),
        paths: parsePathsJson(dto.pathsJson),
        versionNote: dto.versionNote,
        description: dto.description,
        dept: dto.dept ?? null,
      },
      me,
    );
    return { data: toArtifactDto(saved, 'edit') };
  }

  @Post(':id/release')
  async release(@Param('id') id: string, @Body() dto: ReleaseDto, @CurrentActor() me: Actor) {
    const a = await this.artifacts.release(id, dto.versionNote, dto.description, me, dto.sourceVersionRef);
    return { data: toArtifactDto(a, 'edit') };
  }

  /**
   * 다운로드. **실물 파일에 대한 접근 판정은 여기서 한다** - SIREN이 아니라 이 서비스가
   * 자기 데이터의 문지기다(Hub 설계서 §7.1). view 등급은 released 버전만 받을 수 있다 —
   * 목록/상세와 같은 마스킹 규칙(사용자 요청).
   *
   * ★ 한 버전이 여러 파일을 가질 수 있다(§3.9, 사용자 결정) — **파일이 하나면 그대로
   *   내려주고, 여러 개면 zip으로 묶어서 하나로 내려준다.** 호출부는 파일 개수를
   *   미리 몰라도 되고, 이 라우트 하나만 부르면 된다.
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
    const files = version.files ?? [];
    if (!files.length) throw new BadRequestException('This version has no stored file.');

    if (files.length === 1) {
      const body = await this.storage.download(files[0].storageKey);
      if (!body) throw new NotFoundException('The stored file could not be found.');
      return new StreamableFile(body, {
        type: 'application/octet-stream',
        disposition: `attachment; filename="${encodeURIComponent(files[0].fileName)}"`,
      });
    }

    const buffers = await Promise.all(files.map((f) => this.storage.download(f.storageKey)));
    const archive = new ZipArchive({ zlib: { level: 9 } });
    files.forEach((f, i) => {
      const buf = buffers[i];
      if (buf) archive.append(buf, { name: f.fileName });
    });
    void archive.finalize();
    return new StreamableFile(archive, {
      type: 'application/zip',
      disposition: `attachment; filename="${encodeURIComponent(a.name)}-${version.major}.${version.minor}.zip"`,
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
