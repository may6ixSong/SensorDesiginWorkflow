import { Controller, Get, Param, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Artifact, ArtifactDocument } from '../../artifacts/schemas/artifact.schema';

/**
 * ★ 개발 전용 ★ — Observer 계약을 구현한 **가짜 A Tier 서비스**다.
 *
 * A Tier의 slide 열람은 2단 게이트인데(설계서 04장 §4.1), 게이트 2는 그 서비스에 실제로
 * HTTP로 물어본다. 그런데 개발 환경에는 SimHub/RPM 같은 실서비스가 없어서 그 호출이 항상
 * 실패하고, fail-closed 규칙에 따라 **A Tier 산출물이 아무에게도 안 보이게 된다.**
 * 그러면 A Tier UI를 만들 수도 확인할 수도 없다.
 *
 * 그래서 SIREN이 스스로 이 엔드포인트를 띄우고, 시드가 mock 서비스의 baseUrl을 여기로
 * 향하게 한다. 덕분에 **실제 코드 경로가 그대로 실행된다** — ObserverClientService가
 * fetch를 하고, 응답을 파싱하고, 게이트 2를 판정한다. 권한 로직을 우회하지 않는다.
 *
 * ★ MOCKUP_ENABLED=true 일 때만 등록된다(HubModule). 운영에서는 아예 존재하지 않는다.
 *
 * 가짜 권한 규칙(진짜 서비스라면 자기 권한 체계로 판정할 자리):
 *   - 그 산출물의 giver(= createdBy)  → canEdit: true  (작업중 버전까지 보인다)
 *   - 그 외 전원                       → canView: true  (published만 보인다)
 *   - 'noaccess.' 로 시작하는 KnoxID   → 둘 다 false     (차단 화면 확인용)
 */
@Controller('__mock-observer')
export class MockObserverController {
  constructor(
    @InjectModel(Artifact.name) private readonly artifacts: Model<ArtifactDocument>,
  ) {}

  private async find(externalArtifactId: string) {
    return this.artifacts.findOne({ externalArtifactId }).exec();
  }

  /** 외부 계약 모양으로 되돌린다 — 계약의 필드명은 `isReleased`다(설계서 04장 §8). */
  private toRecord(v: {
    versionLabel: string;
    isPublished: boolean;
    giverKnoxId: string | null;
    giverDept: string | null;
    viewUrl: string | null;
    observedAt: Date | null;
  }) {
    return {
      versionLabel: v.versionLabel,
      isReleased: v.isPublished,
      giverKnoxId: v.giverKnoxId,
      giverDept: v.giverDept,
      viewUrl: v.viewUrl,
      sourceRefs: [],
      observedAt: v.observedAt ? new Date(v.observedAt).toISOString() : null,
    };
  }

  @Get('artifacts/:id/access')
  async access(@Param('id') id: string, @Query('knoxId') knoxId: string) {
    const artifact = await this.find(id);
    if (!artifact) return { canView: false, canEdit: false };
    // 권한이 없는 사용자에게도 403이 아니라 200 + false를 준다 — 연동 계약의 요구사항이다
    // (docs/prompts/a-tier-recipient-integration.md §1).
    if ((knoxId ?? '').startsWith('noaccess.')) return { canView: false, canEdit: false };
    return { canView: true, canEdit: artifact.createdBy === knoxId };
  }

  @Get('artifacts/:id/current-version')
  async currentVersion(@Param('id') id: string, @Query('knoxId') knoxId: string) {
    const artifact = await this.find(id);
    if (!artifact) return null;
    const canEdit = artifact.createdBy === knoxId;
    // 편집 권한자에게만 작업중(미발행) 버전을 준다 — 진짜 서비스도 이렇게 필터링한다.
    const visible = (artifact.versions ?? []).filter((v) => canEdit || v.isPublished);
    return visible.length ? this.toRecord(visible[0]) : null;
  }

  @Get('artifacts/:id/versions')
  async versions(@Param('id') id: string, @Query('knoxId') knoxId: string) {
    const artifact = await this.find(id);
    if (!artifact) return [];
    const canEdit = artifact.createdBy === knoxId;
    return (artifact.versions ?? [])
      .filter((v) => canEdit || v.isPublished)
      .map((v) => this.toRecord(v));
  }
}
