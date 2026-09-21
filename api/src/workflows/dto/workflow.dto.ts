import { WorkflowDocument } from '../schemas/workflow.schema';
import { AccessLevel } from '../../common/access';
import { isLockExpired } from '../../common/constants/lock';

/**
 * workflow 응답 조립의 **단일 통로**(설계서 01장 §5).
 *
 * ★ 권한이 없는(myAccess === null) workflow도 목록에는 실린다 — Information page가
 *   "존재는 보여주되 disabled로 잠근다"를 그려야 하기 때문이다(설계서 01장 §3.7).
 *   대신 그 경우 **캔버스도, 권한 목록도** 담지 않는다.
 * ★ **일정(phases/phaseWidths)만은 예외로 그대로 내려간다**(사용자 결정) — Project
 *   Information page의 일정표(`ProjectTimeline`)가 권한 없는 workflow도 실제 phase
 *   막대를 그리고 그 위에 잠금 표시만 얹어야 하기 때문이다. phase는 이름·날짜뿐이고
 *   그 안의 산출물·버전·권한 목록은 여전히 완전히 가려지므로(canvas는 여기 없다), 이
 *   예외로 새어나가는 정보는 "이 workflow가 어떤 일정으로 도는가"뿐이다 — 그 정도는
 *   Schedule dashboard/Design workflow 전체 보기에서도 이미 구조만은 보여주기로 한
 *   기존 규칙과 같은 무게다. app bar의 select는 myAccess가 null인 항목을 option에서 뺀다.
 */
export interface WorkflowDto {
  id: string;
  projectId: string;
  name: string;
  description: string;
  department: string;
  color: string;
  myAccess: AccessLevel;
  ownerKnoxId: string | null;
  editAccess: { departments: string[]; users: string[] } | null;
  viewAccess: { departments: string[]; users: string[] } | null;
  phases: { id: string; name: string; start: string; end: string }[];
  phaseWidths: Record<string, number>;
  releaseSeq: number;
  /** 지금 누가 캔버스를 편집 중인지. 만료된 lock은 없는 것으로 내려준다. */
  canvasLock: { holderKnoxId: string; acquiredAt: Date; expiresAt: Date } | null;
}

export function toWorkflowDto(workflow: WorkflowDocument, level: AccessLevel): WorkflowDto {
  const base = {
    id: workflow._id.toString(),
    projectId: workflow.projectId.toString(),
    name: workflow.name,
    department: workflow.department,
    color: workflow.color,
    myAccess: level,
  };

  if (level === null) {
    // 권한 없음 — 존재와 일정만 알린다(위 클래스 docblock 참고). 캔버스·권한 목록은 여전히 가린다.
    return {
      ...base,
      description: '',
      ownerKnoxId: null,
      editAccess: null,
      viewAccess: null,
      phases: (workflow.phases ?? []).map((p) => ({ id: p.id, name: p.name, start: p.start, end: p.end })),
      phaseWidths: workflow.phaseWidths ?? {},
      releaseSeq: 0,
      canvasLock: null,
    };
  }

  const lock = workflow.canvasLock;
  return {
    ...base,
    description: workflow.description ?? '',
    ownerKnoxId: workflow.ownerKnoxId,
    editAccess: {
      departments: [...(workflow.editAccess?.departments ?? [])],
      users: [...(workflow.editAccess?.users ?? [])],
    },
    viewAccess: {
      departments: [...(workflow.viewAccess?.departments ?? [])],
      users: [...(workflow.viewAccess?.users ?? [])],
    },
    phases: (workflow.phases ?? []).map((p) => ({ id: p.id, name: p.name, start: p.start, end: p.end })),
    phaseWidths: workflow.phaseWidths ?? {},
    releaseSeq: workflow.releaseSeq ?? 0,
    canvasLock:
      lock && !isLockExpired(lock.expiresAt)
        ? { holderKnoxId: lock.holderKnoxId, acquiredAt: lock.acquiredAt, expiresAt: lock.expiresAt }
        : null,
  };
}
