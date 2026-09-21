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

// ★ 예전에 여기 있던 canonicalDepartmentLabel()은 project별 자유 부서(Project.departments)의
// 표시 이름을 이 전사 고정 6종에서 찾으려 했다 — 그 프로젝트 부서는 이 목록과 무관한 별개
// 축이었으므로 애초에 잘못된 조회였다. 이제 project 부서는 `{id, name}`으로 저장되고
// (설계서 02장 §9), 표시는 `web/src/hooks/useDepartmentLabel.ts`가 그 project의
// departments 배열에서 직접 id→name을 찾는다 — 이 파일의 몫이 아니다.
