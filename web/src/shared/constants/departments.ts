/**
 * 전사 공통 부서 6종 고정값 (설계서 4.2절).
 *
 * SOURCE OF TRUTH: docs/siren-design-v2.md §4.2
 * FE/BE 완전 분리 레포 구조([A] 응답 기준)이므로 api/src/common/constants/departments.ts
 * 에도 동일하게 중복 정의되어 있다. 값을 바꿀 때는 반드시 두 파일을 함께 수정할 것.
 */
export const DEPARTMENTS = [
  { id: 'analog', name: 'Analog' },
  { id: 'digital', name: 'Digital' },
  { id: 'aps', name: 'APS' },
  { id: 'pipd', name: 'PI/PD' },
  { id: 'solution', name: 'Solution' },
  { id: 'pte', name: 'PTE' },
] as const;

export type DepartmentId = (typeof DEPARTMENTS)[number]['id'];

export const DEPARTMENT_IDS = DEPARTMENTS.map((d) => d.id) as DepartmentId[];

/** Analog을 제외한 산출물 "전달 받을 부서" 후보 (설계서 3.1, 3.4). FE 셀렉트 박스 필터링용 - 실제 방어는 BE. */
export const RECEIVABLE_DEPARTMENTS = DEPARTMENTS.filter((d) => d.id !== 'analog');

export function departmentName(id: string | null | undefined): string {
  return DEPARTMENTS.find((d) => d.id === id)?.name ?? '-';
}

/**
 * recipient 부서 문자열을 정식 표기로 맞춘다 — 데이터가 (대소문자가 섞인) id로
 * 저장돼 있든 이름으로 저장돼 있든, 6개 고정 부서 중 하나로 알아볼 수 있으면 항상 그
 * 정식 이름(`DEPARTMENTS[].name`)으로 보여준다(사용자 지적 — "digital"처럼 소문자로
 * 저장된 옛 데이터가 그대로 소문자로 보이면 안 된다). 그 6개에 없는 project 자유 입력
 * 부서명은 **원래 설정된 문자열 그대로** 둔다 — 대소문자를 일부러 바꾸지 않는다.
 */
export function canonicalDepartmentLabel(raw: string): string {
  const key = raw.trim().toLowerCase();
  const hit = DEPARTMENTS.find((d) => d.id === key || d.name.toLowerCase() === key);
  return hit?.name ?? raw;
}
