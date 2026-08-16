/**
 * 전사 공통 부서 6종 고정값 (설계서 4.2절).
 *
 * SOURCE OF TRUTH: docs/acro-design-v2.md §4.2
 * 이 프로젝트는 FE/BE 완전 분리 레포 구조([A] 응답 기준)이므로 이 상수를
 * web/src/shared/constants/departments.ts 에도 동일하게 중복 정의한다.
 * 값을 바꿀 때는 반드시 두 파일을 함께 수정할 것.
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

/** Analog을 제외한 산출물 "전달 받을 부서" 후보 (설계서 3.1, 3.4, 4.6). */
export const RECEIVABLE_DEPARTMENT_IDS = DEPARTMENT_IDS.filter(
  (id) => id !== 'analog',
) as Exclude<DepartmentId, 'analog'>[];

export function isValidDepartment(value: unknown): value is DepartmentId {
  return typeof value === 'string' && (DEPARTMENT_IDS as string[]).includes(value);
}
