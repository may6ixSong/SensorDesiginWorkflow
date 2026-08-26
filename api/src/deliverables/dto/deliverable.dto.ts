import { DeliverableDocument, DeliverableVersion } from '../schemas/deliverable.schema';
import { WorkflowDocument } from '../../workflows/schemas/workflow.schema';
import { WorkflowPhaseDto, toPhaseDto } from '../../workflows/dto/workflow.dto';
import { Actor } from '../../common/actor';

function isEditor(workflow: WorkflowDocument, me: Actor): boolean {
  return workflow.owners.includes(me.knoxId);
}

/** 목업의 MV(major,minor,kind,by,at,note,file) 형태로 내려준다. by는 KnoxID다. */
function toVersionDto(v: DeliverableVersion) {
  return {
    major: v.major,
    minor: v.minor,
    kind: v.kind,
    file: v.hpcPath ?? v.fileName ?? '',
    note: v.note ?? '',
    by: v.createdBy ?? '',
    at: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
  };
}

/**
 * 산출물 응답의 단일 통로 (설계서 6.1). 컨트롤러는 이 함수를 거치지 않은
 * 엔티티를 절대 직접 반환하지 않는다.
 *
 * versions 배열 자체를 권한에 맞게 필터링해서 내려준다 - Edit 권한자는 전체,
 * 그 외에는 Released(major)만. FE는 이 배열로 목업의 latA()/latR()/hasW()를
 * 그대로 계산하므로, 권한 없는 사용자에게는 작업중 버전이 존재조차 하지 않는다.
 */
export function toDeliverableDto(d: DeliverableDocument, workflow: WorkflowDocument, me: Actor) {
  const isEdit = isEditor(workflow, me);
  const all = d.versions ?? [];
  const visible = isEdit ? all : all.filter((v) => v.kind === 'major');
  const latest = visible[0] ?? null;
  const released = visible.find((v) => v.kind === 'major') ?? null;

  return {
    id: d._id.toString(),
    projectId: d.projectId.toString(),
    workflowId: d.workflowId.toString(),
    phaseId: d.phaseId,
    name: d.name,
    docType: d.docType,
    network: d.network,
    series: d.series ? d.series.toString() : null,
    seriesIdx: d.seriesIdx,
    seriesTotal: d.seriesTotal,
    layout: { x: d.layout.x, y: d.layout.y, w: d.layout.w, h: d.layout.h },
    recvDept: d.recvDept ?? null,
    recvContact: d.recvContact ?? null,
    recvWorkflowId: d.recvWorkflowId ? d.recvWorkflowId.toString() : null,
    sourceDept: d.sourceDept ?? null,
    versions: visible.map(toVersionDto),
    releasedVersion: released ? toVersionDto(released) : null,
    workingVersion: isEdit && latest?.kind === 'minor' ? toVersionDto(latest) : null,
    canEdit: isEdit,
    sourceWorkflow: null,
    sourcePhase: null,
  };
}

/** 이 산출물이 주는 쪽 workflow에서 어느 phase에 걸려 있었는지 (없으면 그쪽에서도 유실된 것). */
function sourcePhaseOf(d: DeliverableDocument, sourceWorkflow: WorkflowDocument): WorkflowPhaseDto | null {
  const p = (sourceWorkflow.phases ?? []).find((x) => x.id === d.phaseId);
  return p ? toPhaseDto(p) : null;
}

/** GET /deliverables/:id/versions - 가시성 규칙 적용된 버전 이력 (설계서 5.1, 3.5). */
export function toVisibleVersions(d: DeliverableDocument, workflow: WorkflowDocument, me: Actor) {
  const isEdit = isEditor(workflow, me);
  const versions = isEdit ? d.versions : d.versions.filter((v) => v.kind === 'major');
  return versions.map(toVersionDto);
}

/**
 * 다른 workflow의 보드에 "Incoming from other workflows"로 노출되는 산출물 응답.
 * 주는 쪽(sourceWorkflow)에서의 Edit 권한과 무관하게 항상 Release(major) 버전만 보이고,
 * Working copy는 절대 노출하지 않는다 — 받는 쪽은 Release 버전만 볼 수 있다는
 * 규칙은 조회자가 우연히 sourceWorkflow의 owner여도 예외 없이 적용된다.
 *
 * ★ phaseId는 "주는 쪽 workflow의 phase" id다 — 이제 phase가 workflow마다 다르므로
 *   받는 쪽 캔버스에서는 그 id로 아무것도 찾을 수 없다. 그래서 그 phase의 날짜
 *   구간(sourcePhase)을 함께 내려보내, 받는 쪽이 자기 phase 중 날짜가 맞는 칸에
 *   놓을 수 있게 한다 (web/src/lib/canvasModel.ts의 placeIncomingNodes).
 */
export function toIncomingDeliverableDto(d: DeliverableDocument, sourceWorkflow: WorkflowDocument) {
  const released = (d.versions ?? []).find((v) => v.kind === 'major') ?? null;

  return {
    id: d._id.toString(),
    projectId: d.projectId.toString(),
    workflowId: d.workflowId.toString(),
    phaseId: d.phaseId,
    name: d.name,
    docType: d.docType,
    network: d.network,
    series: d.series ? d.series.toString() : null,
    seriesIdx: d.seriesIdx,
    seriesTotal: d.seriesTotal,
    layout: { x: d.layout.x, y: d.layout.y, w: d.layout.w, h: d.layout.h },
    recvDept: d.recvDept ?? null,
    recvContact: d.recvContact ?? null,
    recvWorkflowId: d.recvWorkflowId ? d.recvWorkflowId.toString() : null,
    sourceDept: null,
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
