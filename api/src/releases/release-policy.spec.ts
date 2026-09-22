import {
  baselineByArtifact,
  resolveTargetDepartments,
  selectReleasableNodes,
  spilloverDepartments,
} from './release-policy';

const A = 'dept-a';
const B = 'dept-b';
const C = 'dept-c';

const node = (id: string, departments: string[], users: string[] = []) => ({
  id,
  recipients: { departments, users },
});

/** 설계서 §1.1 의 확정 예시 그대로. A → n01,n03,n09 / B → n01,n04,n05 */
const CANVAS = [
  node('n01', [A, B]),
  node('n03', [A]),
  node('n04', [B]),
  node('n05', [B]),
  node('n09', [A]),
];

describe('selectReleasableNodes', () => {
  it('단일 부서 타겟 — 그 부서가 recipient인 node만 고른다', () => {
    const { selected } = selectReleasableNodes(CANVAS, [A]);
    expect(selected.map((n) => n.id)).toEqual(['n01', 'n03', 'n09']);
  });

  it('선택된 item은 타겟 아닌 부서를 recipients에 그대로 유지한다 — spillover의 근거', () => {
    const { selected } = selectReleasableNodes(CANVAS, [A]);
    expect(selected.find((n) => n.id === 'n01')!.recipients.departments).toEqual([A, B]);
  });

  it('다수 부서 타겟 — 합집합이고 중복이 없다', () => {
    const { selected } = selectReleasableNodes(CANVAS, [A, B]);
    expect(selected.map((n) => n.id)).toEqual(['n01', 'n03', 'n04', 'n05', 'n09']);
  });

  it('빈 배열(All) — recipient 부서가 있는 후보 전체', () => {
    const { selected } = selectReleasableNodes(CANVAS, []);
    expect(selected.map((n) => n.id)).toEqual(['n01', 'n03', 'n04', 'n05', 'n09']);
  });

  it('recipient 부서가 없는 node는 제외하고 계수한다', () => {
    const withOrphan = [...CANVAS, node('n99', [])];
    const { selected, excludedNoRecipient } = selectReleasableNodes(withOrphan, []);
    expect(selected.map((n) => n.id)).not.toContain('n99');
    expect(excludedNoRecipient).toBe(1);
  });

  it('users만 있고 부서가 없는 node도 같이 제외한다', () => {
    const usersOnly = [...CANVAS, node('n98', [], ['sdp.op'])];
    const { selected, excludedNoRecipient } = selectReleasableNodes(usersOnly, [A]);
    expect(selected.map((n) => n.id)).not.toContain('n98');
    expect(excludedNoRecipient).toBe(1);
  });

  it('recipients 자체가 없거나 null이어도 터지지 않고 제외된다', () => {
    const broken = [...CANVAS, { id: 'n97' }, { id: 'n96', recipients: null }];
    const { selected, excludedNoRecipient } = selectReleasableNodes(broken, []);
    expect(selected.map((n) => n.id)).toEqual(['n01', 'n03', 'n04', 'n05', 'n09']);
    expect(excludedNoRecipient).toBe(2);
  });

  it('타겟에 아무 node도 걸리지 않으면 빈 선택을 돌려준다', () => {
    const { selected } = selectReleasableNodes(CANVAS, [C]);
    expect(selected).toEqual([]);
  });
});

describe('resolveTargetDepartments', () => {
  it('타겟이 주어지면 그대로 쓰되 실제로 받은 부서만 남긴다', () => {
    const { selected } = selectReleasableNodes(CANVAS, [A]);
    expect(resolveTargetDepartments(selected, [A])).toEqual([A]);
  });

  it('타겟에 있지만 아무것도 받지 않는 부서는 떨어진다', () => {
    const { selected } = selectReleasableNodes(CANVAS, [A, C]);
    expect(resolveTargetDepartments(selected, [A, C])).toEqual([A]);
  });

  it('All(빈 배열)이면 실제로 받은 부서 전체가 된다', () => {
    const { selected } = selectReleasableNodes(CANVAS, []);
    expect(resolveTargetDepartments(selected, []).sort()).toEqual([A, B]);
  });
});

describe('spilloverDepartments', () => {
  it('타겟이 아닌데 겹치는 산출물로 받게 되는 부서', () => {
    const { selected } = selectReleasableNodes(CANVAS, [A]);
    expect(spilloverDepartments(selected, [A])).toEqual([B]);
  });

  it('All이면 spillover가 없다', () => {
    const { selected } = selectReleasableNodes(CANVAS, []);
    expect(spilloverDepartments(selected, [])).toEqual([]);
  });
});

describe('baselineByArtifact', () => {
  const rel = (...artifactIds: string[]) => ({
    items: artifactIds.map((artifactId) => ({ artifactId, tag: artifactId })),
  });

  it('연속 release — 직전 release의 item이 기준점', () => {
    const map = baselineByArtifact([rel('a1'), rel('a1')]);
    expect(map.get('a1')).toBeDefined();
  });

  it('중간에 빠진 뒤 재등장 — 마지막으로 담겼던 release의 item이 기준점', () => {
    // 최신순: v3(a2만) · v2(a2만) · v1(a1, a2)
    const v3 = { items: [{ artifactId: 'a2', tag: 'v3-a2' }] };
    const v2 = { items: [{ artifactId: 'a2', tag: 'v2-a2' }] };
    const v1 = { items: [{ artifactId: 'a1', tag: 'v1-a1' }, { artifactId: 'a2', tag: 'v1-a2' }] };
    const map = baselineByArtifact([v3, v2, v1]);
    expect(map.get('a1')!.tag).toBe('v1-a1');
    expect(map.get('a2')!.tag).toBe('v3-a2');
  });

  it('한 번도 담긴 적 없는 산출물은 없다 — firstTime의 근거', () => {
    const map = baselineByArtifact([rel('a1')]);
    expect(map.has('a2')).toBe(false);
  });

  it('release가 없으면 빈 맵', () => {
    expect(baselineByArtifact([]).size).toBe(0);
  });

  it('items가 없는 release 문서가 섞여 있어도 터지지 않는다', () => {
    const map = baselineByArtifact([{}, rel('a1')]);
    expect(map.get('a1')).toBeDefined();
  });
});
