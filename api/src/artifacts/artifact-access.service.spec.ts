import { ForbiddenException } from '@nestjs/common';
import { ArtifactAccessService } from './artifact-access.service';
import { CALYPSO_SERVICE_KEY } from '../hub/calypso-client.service';
import { Actor } from '../common/actor';

/**
 * slide 열람 정책 회귀 테스트 (설계서 01장 §4.2 갱신, 사용자 결정).
 *
 * 지키려는 규칙 — **slide를 열 수 있는지는 오직 그 서비스의 canView/canEdit로만
 * 정해진다.** node.recipients(누가 이 workflow의 이 자리에서 받기로 돼 있는가)는 더
 * 이상 이 판정에 관여하지 않는다.
 *
 * 이전 정책(2단 게이트: recipient 먼저, 그다음 서비스 권한)에서는 같은 부서가 만든
 * workflow이고 artifact 자체는 view 제한이 없어도, 그 node의 recipient가 다른 부서로
 * 지정돼 있으면 "You do not have access to this artifact"로 막혔다(사용자 보고) — 이제는
 * 그 경우에도 서비스가 canView:true를 주면 열린다.
 */

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  knoxId: 'user.k',
  realKnoxId: 'user.k',
  isImpersonating: false,
  isAdmin: false,
  callerIsAdmin: false,
  ...overrides,
});

function makeService(calypsoAccess: { canView: boolean; canEdit: boolean }) {
  const calypso = { access: jest.fn().mockResolvedValue(calypsoAccess) } as any;
  const hub = { findByKeyOrThrow: jest.fn() } as any;
  const observer = { access: jest.fn() } as any;
  return new ArtifactAccessService(hub, observer, calypso);
}

const artifact = { serviceKey: CALYPSO_SERVICE_KEY, externalArtifactId: 'ext-1' };
// 부서는 {id, name} 쌍이다(02장 §9) — id로 이름을 그대로 재사용한다.
const project = {
  members: [{ knoxId: 'user.k', departments: ['A'] }],
  departments: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }],
};

describe('ArtifactAccessService.levelFor', () => {
  it('Admin은 서비스 응답과 무관하게 항상 edit', async () => {
    const svc = makeService({ canView: false, canEdit: false });
    const level = await svc.levelFor(actor({ isAdmin: true }), artifact, project);
    expect(level).toBe('edit');
  });

  it('canView:true면 node/recipient 구성과 무관하게 열린다 — 사용자가 보고한 시나리오', async () => {
    const svc = makeService({ canView: true, canEdit: false });
    // node를 아예 넘기지 않는다 — 시그니처 자체에서 빠졌다. 그래도 view가 나와야 한다.
    const level = await svc.levelFor(actor(), artifact, project);
    expect(level).toBe('view');
  });

  it('canEdit:true면 edit', async () => {
    const svc = makeService({ canView: true, canEdit: true });
    const level = await svc.levelFor(actor(), artifact, project);
    expect(level).toBe('edit');
  });

  it('canView:false, canEdit:false면 막힌다', async () => {
    const svc = makeService({ canView: false, canEdit: false });
    const level = await svc.levelFor(actor(), artifact, project);
    expect(level).toBeNull();
  });

  it('assertCanOpen은 null일 때 403을 던진다', async () => {
    const svc = makeService({ canView: false, canEdit: false });
    await expect(svc.assertCanOpen(actor(), artifact as any, project)).rejects.toThrow(ForbiddenException);
  });
});
