import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  ACTING_AS_GROUP_HEADER,
  ACTING_AS_HEADER,
  Actor,
  KNOX_ID_HEADER,
  USER_GROUP_HEADER,
  assertAdmin,
  resolveActor,
} from './actor';
import {
  canAccessProject,
  canEditMilestones,
  myDepartments,
  workflowLevel,
} from './access';

/**
 * 사용자 시뮬레이터(§13) 회귀 테스트.
 *
 * 지키려는 규칙은 하나다 — **시뮬레이션 중에는 Admin의 super 권한이 전부 사라지고,
 * 대상 사용자로 새로 접속한 것과 똑같이 동작한다.** 이 규칙이 한 번 깨졌을 때
 * (`X-Acting-As-Group`이 없어 `Actor.isAdmin`이 실제 호출자 기준으로 남았을 때)
 * My Assignment의 모든 release·artifact, 모든 workflow 편집, Calypso artifact 전체 목록과
 * editor 지정까지 전부 열렸다. `access.ts`의 판정이 전부 `actor.isAdmin` 한 값에 걸려
 * 있으므로, 그 값을 세우는 `resolveActor()`와 그 값을 쓰는 대표 판정들을 함께 고정한다.
 */

const req = (headers: Record<string, string>) => ({ headers });

const ADMIN = { [KNOX_ID_HEADER]: 'admin.kim', [USER_GROUP_HEADER]: 'Admin' };

/** 그 과제의 member도 아니고 아무 권한도 없는 사람. */
const OUTSIDER = 'nobody.lee';

// 부서는 {id, name} 쌍이다(02장 §9) — 이 테스트에서는 id로 이름을 그대로 재사용해
// 판정 로직(전부 id 기준)을 그대로 검증한다.
const project = {
  members: [
    { knoxId: 'member.park', departments: ['Design'] },
    { knoxId: 'admin.kim', departments: ['Design'] },
  ],
  departments: [
    { id: 'Design', name: 'Design' },
    { id: 'Layout', name: 'Layout' },
    { id: 'Verification', name: 'Verification' },
  ],
  managers: ['member.park'],
};

const workflow = {
  ownerKnoxId: 'member.park',
  department: 'Design',
  editAccess: { departments: ['Design'], users: [] },
  viewAccess: { departments: ['Layout'], users: [] },
};

describe('resolveActor', () => {
  it('X-Knox-Id가 없으면 401', () => {
    expect(() => resolveActor(req({}))).toThrow(UnauthorizedException);
  });

  it('시뮬레이션이 아니면 isAdmin은 호출자 자신 기준', () => {
    const actor = resolveActor(req(ADMIN));
    expect(actor).toMatchObject({
      knoxId: 'admin.kim',
      realKnoxId: 'admin.kim',
      isImpersonating: false,
      isAdmin: true,
      callerIsAdmin: true,
    });
  });

  it('non-admin은 시뮬레이션을 켤 수 없다', () => {
    expect(() =>
      resolveActor(req({ [KNOX_ID_HEADER]: 'member.park', [ACTING_AS_HEADER]: OUTSIDER })),
    ).toThrow(ForbiddenException);
  });

  it('non-admin을 시뮬레이션하면 Admin 권한을 전부 잃는다', () => {
    const actor = resolveActor(
      req({ ...ADMIN, [ACTING_AS_HEADER]: OUTSIDER, [ACTING_AS_GROUP_HEADER]: 'Developer' }),
    );
    expect(actor).toMatchObject({
      knoxId: OUTSIDER,
      realKnoxId: 'admin.kim',
      isImpersonating: true,
      isAdmin: false,
      callerIsAdmin: true,
    });
  });

  it('대상 Group 헤더가 아예 없으면 non-admin으로 본다 (fail-closed)', () => {
    const actor = resolveActor(req({ ...ADMIN, [ACTING_AS_HEADER]: OUTSIDER }));
    expect(actor.isAdmin).toBe(false);
    expect(actor.callerIsAdmin).toBe(true);
  });

  it('Admin을 시뮬레이션하면 그 대상 본인의 Admin 권한은 그대로 산다', () => {
    const actor = resolveActor(
      req({ ...ADMIN, [ACTING_AS_HEADER]: 'admin.other', [ACTING_AS_GROUP_HEADER]: 'Admin' }),
    );
    expect(actor).toMatchObject({ knoxId: 'admin.other', isImpersonating: true, isAdmin: true });
  });

  it('자기 자신을 대상으로 하면 시뮬레이션이 아니다', () => {
    const actor = resolveActor(req({ ...ADMIN, [ACTING_AS_HEADER]: 'admin.kim' }));
    expect(actor.isImpersonating).toBe(false);
    expect(actor.isAdmin).toBe(true);
  });
});

describe('시뮬레이션 중의 권한 판정 (access.ts)', () => {
  const simulated: Actor = resolveActor(
    req({ ...ADMIN, [ACTING_AS_HEADER]: OUTSIDER, [ACTING_AS_GROUP_HEADER]: 'Developer' }),
  );
  const realAdmin: Actor = resolveActor(req(ADMIN));

  it('member가 아닌 대상은 과제 자체가 안 보인다', () => {
    expect(canAccessProject(realAdmin, project)).toBe(true);
    expect(canAccessProject(simulated, project)).toBe(false);
  });

  it('부서는 과제 전체가 아니라 대상 본인 것만 잡힌다', () => {
    expect(myDepartments(realAdmin, project)).toEqual(['Design', 'Layout', 'Verification']);
    expect(myDepartments(simulated, project)).toEqual([]);
  });

  it('workflow 편집 권한이 생기지 않는다', () => {
    expect(workflowLevel(realAdmin, workflow, project)).toBe('edit');
    expect(workflowLevel(simulated, workflow, project)).toBeNull();
  });

  it('마일스톤 편집 권한도 사라진다', () => {
    expect(canEditMilestones(realAdmin, project)).toBe(true);
    expect(canEditMilestones(simulated, project)).toBe(false);
  });

  it('Admin 전용 라우트는 시뮬레이션 중에 막힌다 — 쓰려면 시뮬레이터를 꺼야 한다', () => {
    expect(() => assertAdmin(realAdmin)).not.toThrow();
    expect(() => assertAdmin(simulated)).toThrow(ForbiddenException);
  });
});
