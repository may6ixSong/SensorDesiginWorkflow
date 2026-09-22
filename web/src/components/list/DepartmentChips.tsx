import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { CURSOR_POINTER, R, T } from '@/theme/tokens';

interface Props {
  /** 부서 id 목록. 표시 순서는 호출부가 정한다(과제 부서 순서). */
  departments: string[];
  /** 지금 활성인 부서 id. `null`이면 All 탭. */
  value: string | null;
  onChange: (next: string | null) => void;
  deptLabel: (deptId: string) => string;
  /**
   * All 탭을 그릴지. Current는 그린다(전체를 보며 recipient 미지정 node도 고칠 수 있어야
   * 한다). 과거 release는 그리지 않는다 — 실제로 받은 부서만 둔다(스펙 §6.3).
   */
  includeAll?: boolean;
}

/**
 * 부서 chip 탭 행(스펙 §6.2·§6.3) — **단일 선택**이다. 예전의 다중 선택 부서 필터를
 * 대체하며, 활성 chip 하나가 표·release·새 node의 기본 recipient까지 전부의 스코프가 된다.
 */
export function DepartmentChips({ departments, value, onChange, deptLabel, includeAll = false }: Props) {
  const { t } = useTranslation();
  if (departments.length === 0) return null;

  const chip = (key: string, label: string, on: boolean, next: string | null) => (
    <Box
      key={key}
      component="button"
      type="button"
      onClick={() => onChange(next)}
      // 활성 chip을 일부러 solid T.pr로 채우지 않는다 — 같은 행의 Release 버튼이 이미
      // solid T.pr을 "액션"으로 쓰고 있어서, 탭도 같은 채움이면 둘이 구분이 안 된다는
      // 피드백이 있었다(사용자 요청). 그래서 채움은 soft, 선택 표시는 굵기로 준다.
      sx={{
        fontSize: 11.5, padding: '5px 11px', borderRadius: `${R.pill}px`,
        cursor: CURSOR_POINTER, transition: '.14s', fontFamily: 'inherit',
        background: on ? T.prSoft : T.sf,
        color: on ? T.pr : T.dm,
        border: `1px solid ${on ? T.prLine : T.ln2}`,
        fontWeight: on ? 700 : 600,
        '&:hover': { borderColor: on ? T.pr : T.prLine },
      }}
    >
      {label}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px', mb: '12px' }}>
      {includeAll && chip('__all__', t('list.allDepartments'), value === null, null)}
      {departments.map((d) => chip(d, deptLabel(d), value === d, d))}
    </Box>
  );
}
