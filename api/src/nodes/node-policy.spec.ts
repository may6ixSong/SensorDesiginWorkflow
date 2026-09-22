import { shouldResetRecipients } from './node-policy';

/**
 * `before !== null && before !== after`가 다시 `before !== after`로 합쳐지면
 * "Decide later"로 만든 뒤 첫 매핑에서 recipients가 예외도 로그도 없이 사라진다
 * (nodes.service.ts의 shouldResetRecipients 참고). 순수 함수로 떼어 둔 이유가 바로
 * 이 회귀를 CI가 막게 하려는 것이므로, 네 가지 전이를 전부 고정한다.
 */
describe('shouldResetRecipients', () => {
  it('null → X(첫 매핑)는 초기화하지 않는다 — 이 케이스를 고치는 것이 이 함수의 존재 이유다', () => {
    expect(shouldResetRecipients(null, 'X')).toBe(false);
  });

  it('X → Y(다른 산출물로 재매핑)는 초기화한다 — 이전 recipient가 새 산출물에도 유효하다는 보장이 없다', () => {
    expect(shouldResetRecipients('X', 'Y')).toBe(true);
  });

  it('X → null(매핑 해제)도 초기화한다 — 더 이상 유효한 산출물 자체가 없다', () => {
    expect(shouldResetRecipients('X', null)).toBe(true);
  });

  it('X → X(변화 없음)는 초기화하지 않는다', () => {
    expect(shouldResetRecipients('X', 'X')).toBe(false);
  });
});
