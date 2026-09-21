import { toWorkflowDto } from './workflow.dto';
import { WorkflowDocument } from '../schemas/workflow.schema';

/**
 * Project Information page의 일정표(ProjectTimeline)가 권한 없는 workflow도 실제 phase를
 * 그려야 한다는 사용자 요청(01장 §3.7 갱신)에 대한 회귀 테스트다.
 *
 * 지키려는 두 가지:
 *   1) myAccess가 null이어도 phases/phaseWidths는 실제 값이 나온다(유일한 예외).
 *   2) 그 예외가 다른 필드로 번지지 않는다 — description/ownerKnoxId/editAccess/viewAccess/
 *      canvasLock/releaseSeq는 여전히 완전히 가려진다.
 */

const workflow = {
  _id: { toString: () => 'wf1' },
  projectId: { toString: () => 'proj1' },
  name: 'PLL_MAIN',
  description: 'Main clock generation PLL',
  department: 'Analog',
  color: '#0c9a83',
  ownerKnoxId: 'owner.kim',
  editAccess: { departments: ['Analog'], users: ['u1'] },
  viewAccess: { departments: ['Digital'], users: [] },
  phases: [
    { id: 'ph1', name: 'KO', start: '2026-01-05', end: '2026-02-16' },
    { id: 'ph2', name: 'ML1', start: '2026-02-16', end: '2026-03-16' },
  ],
  phaseWidths: { ph1: 200, ph2: 180 },
  releaseSeq: 3,
  canvasLock: { holderKnoxId: 'u1', acquiredAt: new Date(), expiresAt: new Date(Date.now() + 60_000) },
} as unknown as WorkflowDocument;

describe('toWorkflowDto', () => {
  it('권한이 있으면 전 필드가 그대로 나온다', () => {
    const dto = toWorkflowDto(workflow, 'edit');
    expect(dto.myAccess).toBe('edit');
    expect(dto.phases).toHaveLength(2);
    expect(dto.description).toBe('Main clock generation PLL');
    expect(dto.ownerKnoxId).toBe('owner.kim');
    expect(dto.editAccess).toEqual({ departments: ['Analog'], users: ['u1'] });
    expect(dto.canvasLock).not.toBeNull();
  });

  it('권한이 없어도 phases/phaseWidths는 그대로 나온다 — Information page의 일정표용 예외', () => {
    const dto = toWorkflowDto(workflow, null);
    expect(dto.myAccess).toBeNull();
    expect(dto.phases).toEqual([
      { id: 'ph1', name: 'KO', start: '2026-01-05', end: '2026-02-16' },
      { id: 'ph2', name: 'ML1', start: '2026-02-16', end: '2026-03-16' },
    ]);
    expect(dto.phaseWidths).toEqual({ ph1: 200, ph2: 180 });
  });

  it('권한이 없으면 phase 외의 모든 값은 여전히 가려진다', () => {
    const dto = toWorkflowDto(workflow, null);
    expect(dto.description).toBe('');
    expect(dto.ownerKnoxId).toBeNull();
    expect(dto.editAccess).toBeNull();
    expect(dto.viewAccess).toBeNull();
    expect(dto.releaseSeq).toBe(0);
    expect(dto.canvasLock).toBeNull();
  });
});
