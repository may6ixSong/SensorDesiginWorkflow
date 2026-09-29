import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Req,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArtifactsService } from '../artifacts/artifacts.service';
import { ArtifactDocument, ArtifactVersion } from '../artifacts/schemas/artifact.schema';
import { StorageService } from '../storage/storage.service';
import { streamVersionFiles } from '../artifacts/version-files';
import { verifySourceToken } from './source-token';

/**
 * Auto Run source 접근(SIREN 설계서 10장 §6.2) — SIREN이 trigger payload에 실어 보낸
 * **run별 읽기 전용 토큰**으로, trigger를 받은 서비스(HPC Service 등)가 Calypso source를
 * 직접 받아간다.
 *
 * ★ `SirenCallerGuard`(SIREN BE 전용 공유 비밀)를 걸지 않는 유일한 라우트 묶음이다 — 대신
 *   토큰 하나가 artifact 하나·버전 하나·만료 시각으로 묶여 있어 그 밖의 것은 읽을 수 없다.
 *   쓰기 경로는 하나도 없다.
 * ★ Calypso의 사람 권한(computeAccess)은 보지 않는다 — 이 버전을 이 서비스에 넘기기로 한 건
 *   SIREN이 workflow 편집 권한자의 Auto Run 설정에 따라 이미 판정했다.
 */
@Controller('auto-run/artifacts/:id/versions/:versionRef')
export class AutoRunSourceController {
  constructor(
    private readonly artifacts: ArtifactsService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  private async authorize(
    req: { headers?: Record<string, unknown> },
    id: string,
    versionRef: string,
  ): Promise<{ artifact: ArtifactDocument; version: ArtifactVersion }> {
    const header = req.headers?.authorization;
    const raw = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!raw) throw new UnauthorizedException('Missing Bearer token.');
    const claims = verifySourceToken(this.config.get<string>('autoRunSourceTokenSecret') ?? '', raw);
    if (!claims) throw new UnauthorizedException('Invalid or expired source token.');
    const ref = decodeURIComponent(versionRef);
    if (claims.a !== id || claims.r !== ref) {
      throw new ForbiddenException('This token was issued for a different artifact version.');
    }
    const artifact = await this.artifacts.findOrThrow(id);
    const version = artifact.versions.find((v) => v.versionRef === ref);
    if (!version) throw new NotFoundException('Version not found.');
    return { artifact, version };
  }

  /**
   * 그 버전이 담고 있는 것 — 파일 이름 목록·OA 링크·HPC 경로. 경로/링크형 source는 이것만으로
   * 충분하고, 파일이 있으면 `downloadUrl`로 받는다(여러 개면 zip 하나).
   */
  @Get('contents')
  async contents(@Param('id') id: string, @Param('versionRef') versionRef: string, @Req() req: any) {
    const { artifact, version } = await this.authorize(req, id, versionRef);
    const files = version.files ?? [];
    // sheet artifact면 격자를 그대로 싣는다 — HPC는 파일을 받지 않고 이 JSON만 읽으면 된다
    // (SIREN 설계서 11장 §5). 사용자가 저장한 그대로이고, 값 검사는 받는 쪽이 한다.
    const sheet = artifact.contentKind === 'sheet' ? await this.artifacts.readSheetGrid(version) : null;
    return {
      artifactId: artifact._id.toString(),
      name: artifact.name,
      network: artifact.network ?? null,
      contentKind: artifact.contentKind ?? 'file',
      versionLabel: `${version.major}.${version.minor}`,
      versionRef: version.versionRef,
      isReleased: version.isReleased === true,
      versionNote: version.versionNote ?? '',
      files: files.map((f) => ({ fileName: f.fileName })),
      links: (version.links ?? []).map((l) => ({ url: l.url, label: l.label ?? '' })),
      paths: (version.paths ?? []).map((p) => ({ path: p.path, label: p.label ?? '' })),
      // 같은 토큰으로 받는다 — 파일이 없으면 null.
      downloadPath: files.length ? 'download' : null,
      sheet: sheet ? { grid: sheet } : null,
      createdBy: version.createdBy,
      createdAt: version.createdAt instanceof Date ? version.createdAt.toISOString() : String(version.createdAt),
    };
  }

  @Get('download')
  async download(
    @Param('id') id: string,
    @Param('versionRef') versionRef: string,
    @Req() req: any,
  ): Promise<StreamableFile> {
    const { artifact, version } = await this.authorize(req, id, versionRef);
    return streamVersionFiles(this.storage, artifact, version);
  }
}
