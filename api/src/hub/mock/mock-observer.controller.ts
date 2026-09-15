import { Controller, Get, Param, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Artifact, ArtifactDocument } from '../../artifacts/schemas/artifact.schema';

/** id가 이 접두어로 시작하면 아직 SIREN에 등록되지 않은 §*.*(fake) 후보다. */
const MOCK_PREFIX = 'mock-proj-';

/**
 * code+revision으로부터 결정적으로 fake artifact 후보를 만들어낸다 — project 사전 링크
 * 단계는 폐지됐으므로(설계서 04장 §6.3), code+revision을 바로 후보 목록 필터로 쓴다.
 * code+revision이 그 서비스 안에서 항상 유일하지는 않다는 걸 보여주기 위해 **일부러 두
 * 그룹(production run/internal test)**을 합쳐 돌려준다(RPM 연동 프롬프트의 예시 그대로,
 * docs/rpm-integration-prompt.md) — 실제 서비스라면 이 필터링을 자기가 알아서 한다.
 */
function fakeArtifactGroups(code: string, revision: string) {
  const base = `${MOCK_PREFIX}${code}-${revision}`;
  return [`${base}-prod`, `${base}-test`];
}

/**
 * 그 group(project) 안의 fake Readout Pattern 3개 — 일부러 서로 다른 접근 등급을 섞어 둔다.
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
    hasHtmlView: true,
  };
}

/** html-view 계약을 구현하는 가짜 서비스라면 이런 걸 돌려줄 거라는 자리표시자. */
function fakeHtmlView(artifactName: string, versionLabel: string) {
  return {
    html: `<!doctype html><html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0;font-family:-apple-system,Segoe UI,sans-serif;">
<div style="text-align:center;">
<div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.55;">${artifactName}</div>
<div style="font-size:30px;font-weight:700;margin-top:10px;">${versionLabel}</div>
<div style="font-size:12px;opacity:.45;margin-top:8px;">mock html preview — observer contract §19</div>
</div>
</body></html>`,
    width: 960,
    height: 540,
  };
}

/**
 * ★ 개발 전용 ★ — Observer 계약을 구현한 **가짜 OA Service**다(HPC Service가 이 mock을
 * 가리키도록 시드해도 그대로 동작한다 — 둘은 이제 같은 계약을 쓴다).
 *
 * OA/HPC Service의 slide 열람은 2단 게이트인데(설계서 04장 §4.1), 게이트 2는 그 서비스에
 * 실제로 HTTP로 물어본다. 그런데 개발 환경에는 SimHub/RPM 같은 실서비스가 없어서 그 호출이
 * 항상 실패하고, fail-closed 규칙에 따라 **그 산출물이 아무에게도 안 보이게 된다.** 그러면
 * 이 UI를 만들 수도 확인할 수도 없다.
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
 *     (`fakeArtifactsInProject`) — "새 Artifact 추가" 다이얼로그에서 code+revision으로 후보를
 *     받고 그 안의 artifact를 고르는 흐름을 실제 서비스처럼 끝까지 눌러볼 수 있게 하기
 *     위함이다.
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

  /**
   * 계약 §/artifacts?code=&revision= — code+revision으로 필터된 산출물 목록(선택 구현,
   * 04장 §6.3). project 사전 링크 단계는 없다 — 이 호출 하나로 후보가 곧장 나온다.
   */
  @Get('artifacts')
  async listArtifacts(@Query('code') code: string, @Query('revision') revision: string) {
    if (!code) return [];
    const groups = fakeArtifactGroups(code, revision ?? '');
    return groups.flatMap((projectId) =>
      fakeArtifactsInProject(projectId).map((a) => ({
        artifactId: a.id,
        name: a.name,
        department: null,
        currentVersion: fakeVersionRecord(),
      })),
    );
  }

  /**
   * 외부 계약 모양으로 되돌린다 — 계약의 필드명은 `isReleased`다(설계서 04장 §8).
   * hasHtmlView는 실제 서비스 판정 자리표시자로, publish된 버전에만 있다고 가정한다
   * (아직 작업중인 버전엔 official한 html이 없다는 게 자연스러운 규칙이라).
   */
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
      hasHtmlView: v.isPublished,
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

  /**
   * 계약 §/artifacts/:id/html-view — 선택 구현(설계서 04장 §19 확장). 실제 서비스라면
   * 자기 렌더러가 만든 html+canvas 크기를 주겠지만, 여기선 published 버전에 한해 자리표시자
   * 하나를 만들어 준다 — toRecord의 hasHtmlView 규칙과 반드시 같은 조건이어야 한다.
   */
  @Get('artifacts/:id/html-view')
  async htmlView(
    @Param('id') id: string,
    @Query('versionLabel') versionLabel: string,
    @Query('knoxId') knoxId: string,
  ) {
    const artifact = await this.find(id);
    if (!artifact) {
      if (!this.isFakeId(id)) return null;
      return this.fakeAccess(id, knoxId).canView && versionLabel === fakeVersionRecord().versionLabel
        ? fakeHtmlView('Fake candidate', versionLabel)
        : null;
    }
    const canEdit = artifact.createdBy === knoxId;
    const v = (artifact.versions ?? []).find((x) => x.versionLabel === versionLabel && (canEdit || x.isPublished));
    if (!v || !v.isPublished) return null;
    return fakeHtmlView(artifact.name, v.versionLabel);
  }
}
