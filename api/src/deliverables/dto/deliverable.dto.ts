import { DeliverableDocument, DeliverableVersion } from '../schemas/deliverable.schema';
import { WorkflowDocument } from '../../workflows/schemas/workflow.schema';
import { WorkflowPhaseDto, toPhaseDto } from '../../workflows/dto/workflow.dto';
import { Actor } from '../../common/actor';

/**
 * 이 사람이 그 버전의 **주는 쪽(giver)**인가 (Hub 설계서 §6.2).
 *
 * 판정은 산출물 단위다 - 워크플로우 전체 Edit/View 플래그 하나로 캔버스 전체를 열고
 * 닫지 않는다. 같은 캔버스 안에서 노드 A는 전체 버전이 보이고 노드 B는 릴리스만 보이는
 * 상태가 동시에 존재할 수 있다.
 *
 * 두 경로를 인정한다.
 *  - 그 버전을 만든 사람 본인(giverKnoxId)
 *  - 이 workflow의 owner - 이 workflow가 만들어 내보내는 산출물이므로 주는 쪽이다
 *
 * 부서 단위 giver(giverDept)는 여기서 쓰지 않는다 - api에는 users 컬렉션이 없어
 * 소속을 조회할 수 없기 때문이다(common/actor.ts). 부서 기반 판정이 필요해지면
 * Project.members를 가진 쪽에서 계산해 넘겨야 한다.
 */
function isGiver(v: DeliverableVersion, workflow: WorkflowDocument, me: Actor): boolean {
  if (v.giverKnoxId && v.giverKnoxId === me.knoxId) return true;
  return workflow.owners.includes(me.knoxId);
}

/** 그 산출물에 대해 이 사람이 하나라도 giver인 버전을 갖고 있는가 (편집 UI 노출 판단용). */
function canEditArtifact(d: DeliverableDocument, workflow: WorkflowDocument, me: Actor): boolean {
  return workflow.owners.includes(me.knoxId);
}

function toVersionDto(v: DeliverableVersion) {
  return {
    versionLabel: v.versionLabel,
    isReleased: v.isReleased === true,
    versionRef: v.versionRef ?? null,
    tier: v.tier,
    giverKnoxId: v.giverKnoxId ?? null,
    giverDept: v.giverDept ?? null,
    viewUrl: v.viewUrl ?? null,
    hpcPath: v.hpcPath ?? null,
    note: v.note ?? '',
    sourceRefs: (v.sourceRefs ?? []).map((s) => ({
      artifactKey: s.artifactKey,
      serviceKey: s.serviceKey,
      versionRef: s.versionRef,
      versionLabel: s.versionLabel ?? '',
      capturedAt: s.capturedAt ? new Date(s.capturedAt).toISOString() : null,
    })),
    /** C/D 티어는 "검증된 사실"이 아니라 담당자의 주장이다 (§6.3, §9.2) — 화면이 이걸로 구분한다. */
    confidence: v.tier === 'A' || v.tier === 'B' ? 'verified' : 'asserted',
    assertedBy: v.assertedBy ?? null,
    assertedAt: v.assertedAt ? new Date(v.assertedAt).toISOString() : null,
    observedAt: v.observedAt ? new Date(v.observedAt).toISOString() : null,
    at: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
  };
}

/**
 * 산출물 응답의 단일 통로 (Hub 설계서 §6.2). 컨트롤러는 이 함수를 거치지 않은
 * 엔티티를 절대 직접 반환하지 않는다.
 *
 * versions 배열 자체를 권한에 맞게 필터링해서 내려준다 - giver는 전체, 그 외 전원(받는
 * 부서 포함)은 isReleased인 것만. FE가 숨기는 게 아니라 응답에 애초에 담기지 않는다.
 */
export function toDeliverableDto(d: DeliverableDocument, workflow: WorkflowDocument, me: Actor) {
  const all = d.versions ?? [];
  const visible = all.filter((v) => v.isReleased === true || isGiver(v, workflow, me));
  const latest = visible[0] ?? null;
  const released = visible.find((v) => v.isReleased === true) ?? null;

  return {
    id: d._id.toString(),
    projectId: d.projectId.toString(),
    workflowId: d.workflowId.toString(),
    phaseId: d.phaseId,
    name: d.name,
    serviceKey: d.serviceKey ?? null,
    externalArtifactId: d.externalArtifactId ?? null,
    network: d.network,
    series: d.series ? d.series.toString() : null,
    seriesIdx: d.seriesIdx,
    seriesTotal: d.seriesTotal,
    layout: { x: d.layout.x, y: d.layout.y, w: d.layout.w, h: d.layout.h },
    intent: d.intent ?? 'own',
    recvDept: d.recvDept ?? null,
    recvContact: d.recvContact ?? null,
    recvWorkflowId: d.recvWorkflowId ? d.recvWorkflowId.toString() : null,
    sourceDept: d.sourceDept ?? null,
    sourceContact: d.sourceContact ?? null,
    versions: visible.map(toVersionDto),
    releasedVersion: released ? toVersionDto(released) : null,
    workingVersion: latest && !latest.isReleased ? toVersionDto(latest) : null,
    canEdit: canEditArtifact(d, workflow, me),
    sourceWorkflow: null,
    sourcePhase: null,
  };
}

/** 이 산출물이 주는 쪽 workflow에서 어느 phase에 걸려 있었는지 (없으면 그쪽에서도 유실된 것). */
function sourcePhaseOf(d: DeliverableDocument, sourceWorkflow: WorkflowDocument): WorkflowPhaseDto | null {
  const p = (sourceWorkflow.phases ?? []).find((x) => x.id === d.phaseId);
  return p ? toPhaseDto(p) : null;
}

/** GET /deliverables/:id/versions - 가시성 규칙 적용된 버전 이력 (Hub 설계서 §6.2). */
export function toVisibleVersions(d: DeliverableDocument, workflow: WorkflowDocument, me: Actor) {
  const versions = (d.versions ?? []).filter(
    (v) => v.isReleased === true || isGiver(v, workflow, me),
  );
  return versions.map(toVersionDto);
}

/**
 * 다른 workflow의 보드에 "Incoming from other workflows"로 노출되는 산출물 응답.
 * 주는 쪽(sourceWorkflow)에서의 권한과 무관하게 항상 Release된 버전만 보이고, 작업중
 * 버전은 절대 노출하지 않는다 — 받는 쪽은 Release 버전만 볼 수 있다는 규칙은 조회자가
 * 우연히 sourceWorkflow의 owner여도 예외 없이 적용된다.
 *
 * ★ phaseId는 "주는 쪽 workflow의 phase" id다 — phase는 workflow마다 다르므로 받는 쪽
 *   캔버스에서는 그 id로 아무것도 찾을 수 없다. 그래서 그 phase의 날짜 구간(sourcePhase)을
 *   함께 내려보내, 받는 쪽이 자기 phase 중 날짜가 맞는 칸에 놓을 수 있게 한다
 *   (web/src/lib/canvasModel.ts의 placeIncomingNodes).
 */
export function toIncomingDeliverableDto(d: DeliverableDocument, sourceWorkflow: WorkflowDocument) {
  const released = (d.versions ?? []).find((v) => v.isReleased === true) ?? null;

  return {
    id: d._id.toString(),
    projectId: d.projectId.toString(),
    workflowId: d.workflowId.toString(),
    phaseId: d.phaseId,
    name: d.name,
    serviceKey: d.serviceKey ?? null,
    externalArtifactId: d.externalArtifactId ?? null,
    network: d.network,
    series: d.series ? d.series.toString() : null,
    seriesIdx: d.seriesIdx,
    seriesTotal: d.seriesTotal,
    layout: { x: d.layout.x, y: d.layout.y, w: d.layout.w, h: d.layout.h },
    intent: d.intent ?? 'own',
    recvDept: d.recvDept ?? null,
    recvContact: d.recvContact ?? null,
    recvWorkflowId: d.recvWorkflowId ? d.recvWorkflowId.toString() : null,
    sourceDept: null,
    sourceContact: null,
    versions: released ? [toVersionDto(released)] : [],
    releasedVersion: released ? toVersionDto(released) : null,
    workingVersion: null,
    canEdit: false,
    sourceWorkflow: {
      id: sourceWorkflow._id.toString(),
      name: sourceWorkflow.name,
      color: sourceWorkflow.color,
    },
    sourcePhase: sourcePhaseOf(d, sourceWorkflow),
  };
}
