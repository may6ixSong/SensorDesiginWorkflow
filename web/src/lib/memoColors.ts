import { T } from '@/theme/tokens';

/**
 * 메모 배경색 — Windows 스티키 노트가 제공하는 색상으로 제한한다(사용자 요청).
 * yellow가 예전부터 쓰던 유일한 색이라 기본값이다: DB에 색이 저장돼 있지 않은 기존
 * 메모, 그리고 새로 만드는 메모 둘 다 yellow로 시작한다.
 */
export type MemoColor = 'yellow' | 'blue' | 'green' | 'pink' | 'gray' | 'purple';

export const DEFAULT_MEMO_COLOR: MemoColor = 'yellow';

export const MEMO_COLORS: MemoColor[] = ['yellow', 'blue', 'green', 'pink', 'gray', 'purple'];

const MEMO_COLOR_TOKENS: Record<MemoColor, { bg: string; line: string }> = {
  yellow: { bg: T.memoYellow, line: T.memoYellowLine },
  blue: { bg: T.memoBlue, line: T.memoBlueLine },
  green: { bg: T.memoGreen, line: T.memoGreenLine },
  pink: { bg: T.memoPink, line: T.memoPinkLine },
  gray: { bg: T.memoGray, line: T.memoGrayLine },
  purple: { bg: T.memoPurple, line: T.memoPurpleLine },
};

/** 저장된 값이 없거나(기존 DB 데이터) 알 수 없는 값이면 기본색(yellow)으로 취급한다. */
export function normalizeMemoColor(color: string | null | undefined): MemoColor {
  return (MEMO_COLORS as string[]).includes(color ?? '') ? (color as MemoColor) : DEFAULT_MEMO_COLOR;
}

export function memoColorTokens(color: string | null | undefined): { bg: string; line: string } {
  return MEMO_COLOR_TOKENS[normalizeMemoColor(color)];
}
