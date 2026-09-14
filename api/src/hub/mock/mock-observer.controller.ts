import { Controller, Get, Param, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Artifact, ArtifactDocument } from '../../artifacts/schemas/artifact.schema';

/** id가 이 접두어로 시작하면 아직 SIREN에 등록되지 않은 §*.*(fake) 후보다. */
const MOCK_PREFIX = 'mock-proj-';

/**
 * project 검색 결과를 code+revision으로부터 결정적으로 만들어낸다 — code+revision이
 * 그 서비스 안에서 항상 유일하지는 않다는 걸 보여주기 위해 **일부러 후보 2개**를
 * 돌려준다(RPM 연동 프롬프트의 "production run / internal test" 예시 그대로,
 * docs/rpm-integration-prompt.md).
 */
function fakeProjectCandidates(code: string, revision: string) {
  const base = `${MOCK_PREFIX}${code}-${revision}`;
  return [
    { externalProjectId: `${base}-prod`, displayName: `${code} rev.${revision} (production run)`, code, revision },
    { externalProjectId: `${base}-test`, displayName: `${code} rev.${revision} (internal test)`, code, revision },
  ];
}

/**
 * 그 project 안의 fake Readout Pattern 3개 — 일부러 서로 다른 접근 등급을 섞어 둔다.
 * pickability UI(edit만 되는 것/view만 되는 것/아예 안 되는 것)를 실제로 확인할 수 있게.
 */
function fakeArtifactsInProject(externalProjectId: string) {
  return [
    { id: `${externalProjectId}::pat-startup`, name: 'Startup Sequence Pattern', access: 'edit' as const },
    { id: `${externalProjectId}::pat-sleep`, name: 'Sleep Mode Pattern', access: 'view' as const },
    { id: `${externalProjectId}::pat-test`, name: 'Test Mode Pattern', access: 'none' as const },
  ];
}

function fakeVersionRecord() {
  return {
    versionLabel: '2026-08-14T09:00:00Z',
    isReleased: true,
    giverKnoxId: null,
    giverDept: null,
    viewUrl: null,
    sourceRefs: [] as unknown[],
    observedAt: '2026-08-14T09:00:00Z',
  };
}

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
 *   - 이미 SIREN에 등록된 산출물(=Artifact.externalArtifactId로 찾아짐)은 기존 규칙대로:
 *     giver(=createdBy) → canEdit, 그 외 → canView, 'noaccess.'로 시작하는 KnoxID → 둘 다 false.
 *   - **아직 등록되지 않은 fake 후보**(`mock-proj-` 접두어)는 §후보 목록을 그대로 판정에 쓴다
 *     (`fakeArtifactsInProject`) — "새 Artifact 추가" 다이얼로그에서 project를 검색하고
 *     그 안의 artifact를 고르는 흐름을 실제 서비스처럼 끝까지 눌러볼 수 있게 하기 위함이다.
 */
@Controller('__mock-observer')
export class MockObserverController {
  constructor(
    @InjectModel(Artifact.name) private readonly artifacts: Model<ArtifactDocument>,
  ) {}

  private async find(externalArtifactId: string) {
    return this.artifacts.findOne({ externalArtifactId }).exec();
  }

  private isFakeId(id: string): boolean {
    return id.startsWith(MOCK_PREFIX);
  }

  private fakeAccess(id: string, knoxId: string): { canView: boolean; canEdit: boolean } {
    if ((knoxId ?? '').startsWith('noaccess.')) return { canView: false, canEdit: false };
    const projectId = id.split('::')[0];
    const entry = fakeArtifactsInProject(projectId).find((a) => a.id === id);
    if (!entry) return { canView: false, canEdit: false };
    return { canView: entry.access !== 'none', canEdit: entry.access === 'edit' };
  }

  /** 계약 §/projects/search — code+revision으로 찾을 수 있는 project 후보(선택 구현). */
  @Get('projects/search')
  async searchProjects(@Query('code') code: string, @Query('revision') revision: string) {
    if (!code) return [];
    return fakeProjectCandidates(code, revision ?? '');
  }

  /** 계약 §/artifacts — 이 project 안의 산출물 목록(선택 구현, 04장 §6.3). */
  @Get('artifacts')
  async listArtifacts(@Query('projectId') projectId: string) {
    if (!projectId || !this.isFakeId(projectId)) return [];
    return fakeArtifactsInProject(projectId).map((a) => ({
      artifactId: a.id,
      name: a.name,
      department: null,
      currentVersion: fakeVersionRecord(),
    }));
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
    // 아직 SIREN에 등록되지 않은 fake 후보(project 검색 → 후보 목록에서 방금 고른 것)면
    // fakeArtifactsInProject의 권한을 그대로 쓴다 — 실제로 매핑을 눌러 보기 전까지도
    // pickability 화면을 끝까지 확인할 수 있게 하기 위함이다(04장 §6.2).
    if (!artifact) return this.isFakeId(id) ? this.fakeAccess(id, knoxId) : { canView: false, canEdit: false };
    // 권한이 없는 사용자에게도 403이 아니라 200 + false를 준다 — 연동 계약의 요구사항이다
    // (docs/prompts/a-tier-recipient-integration.md §1).
    if ((knoxId ?? '').startsWith('noaccess.')) return { canView: false, canEdit: false };
    return { canView: true, canEdit: artifact.createdBy === knoxId };
  }

  @Get('artifacts/:id/current-version')
  async currentVersion(@Param('id') id: string, @Query('knoxId') knoxId: string) {
    const artifact = await this.find(id);
    if (!artifact) {
      if (!this.isFakeId(id)) return null;
      return this.fakeAccess(id, knoxId).canView ? fakeVersionRecord() : null;
    }
    const canEdit = artifact.createdBy === knoxId;
    // 편집 권한자에게만 작업중(미발행) 버전을 준다 — 진짜 서비스도 이렇게 필터링한다.
    const visible = (artifact.versions ?? []).filter((v) => canEdit || v.isPublished);
    return visible.length ? this.toRecord(visible[0]) : null;
  }

  @Get('artifacts/:id/versions')
  async versions(@Param('id') id: string, @Query('knoxId') knoxId: string) {
    const artifact = await this.find(id);
    if (!artifact) {
      if (!this.isFakeId(id)) return [];
      return this.fakeAccess(id, knoxId).canView ? [fakeVersionRecord()] : [];
    }
    const canEdit = artifact.createdBy === knoxId;
    return (artifact.versions ?? [])
      .filter((v) => canEdit || v.isPublished)
      .map((v) => this.toRecord(v));
  }
}
