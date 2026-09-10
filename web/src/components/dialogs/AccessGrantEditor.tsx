import { useState } from 'react';
import { Box, Menu, MenuItem } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AccessGrant } from '@/types/domain';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { UserSearchDialog } from '@/components/dialogs/UserSearchDialog';
import { CURSOR_POINTER, R, T } from '@/theme/tokens';

interface Props {
  value: AccessGrant;
  onChange: (next: AccessGrant) => void;
  /** 고를 수 있는 부서 — 그 과제에 등록된 부서 목록(Project.departments). */
  departmentOptions: string[];
  /**
   * 삭제할 수 없는 부서. workflow 소속 부서가 여기 들어온다 — **Admin도 못 지운다**.
   * 교체는 오직 Department 변경으로만 일어난다(설계서 01장 §3.4).
   */
  pinnedDepartment?: string | null;
  readOnly?: boolean;
}

/**
 * 권한 한 벌(부서 다중 + 개별 사용자 다중) 편집기.
 *
 * workflow의 Edit/View Access, artifact(B/C/D)의 Edit/View Access, A Tier block의
 * recipient가 전부 같은 모양이라 하나로 만들어 재사용한다(설계서 01장 §3.3, §4.3).
 *
 * ★ **부서는 어디서든 여러 개** 넣을 수 있다.
 * ★ 개별 사용자는 **전사 검색**이다 — 그 과제의 member가 아니어도 넣을 수 있고, 실제로
 *   열리는지는 Project 계층이 최종 판정한다(설계서 01장 §2.2).
 */
export function AccessGrantEditor({
  value, onChange, departmentOptions, pinnedDepartment = null, readOnly = false,
}: Props) {
  const { t } = useTranslation();
  const { resolveUser } = useDirectory();
  const [deptAnchor, setDeptAnchor] = useState<HTMLElement | null>(null);
  const [userOpen, setUserOpen] = useState(false);

  const addableDepts = departmentOptions.filter((d) => !value.departments.includes(d));

  const removeDept = (d: string) => onChange({ ...value, departments: value.departments.filter((x) => x !== d) });
  const addDept = (d: string) => {
    setDeptAnchor(null);
    if (!value.departments.includes(d)) onChange({ ...value, departments: [...value.departments, d] });
  };
  const removeUser = (k: string) => onChange({ ...value, users: value.users.filter((x) => x !== k) });
  const addUser = (k: string) => {
    setUserOpen(false);
    if (!value.users.includes(k)) onChange({ ...value, users: [...value.users, k] });
  };

  const empty = !value.departments.length && !value.users.length;

  return (
    <Box>
      {/* ── 부서 ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', mb: '9px' }}>
        <Box sx={{ fontSize: 11, fontWeight: 700, color: T.dm2, letterSpacing: '0.04em', mr: '2px' }}>
          {t('workflow.departments')}
        </Box>

        {value.departments.map((d) => {
          const pinned = d === pinnedDepartment;
          return (
            <Box
              key={d}
              title={pinned ? t('workflow.pinnedDepartment') : undefined}
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                background: pinned ? T.prSoft : T.sf3,
                color: pinned ? T.pr : T.tx2,
                border: `1px solid ${pinned ? T.prLine : 'transparent'}`,
                fontSize: 12, fontWeight: 600, padding: '3px 4px 3px 9px', borderRadius: `${R.pill}px`,
              }}
            >
              {pinned && <Icon name="lock" />}
              {d}
              {/* 소속 부서 항목에는 삭제 버튼을 아예 그리지 않는다 — 서버도 거부한다. */}
              {!readOnly && !pinned ? (
                <Box
                  component="button"
                  onClick={() => removeDept(d)}
                  sx={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 17, height: 17, borderRadius: '50%', border: 'none', padding: 0,
                    background: 'transparent', color: T.dm2, cursor: CURSOR_POINTER,
                    '&:hover': { background: T.dangerSoft, color: T.danger },
                  }}
                >
                  <Icon name="x" />
                </Box>
              ) : (
                <Box sx={{ width: 5 }} />
              )}
            </Box>
          );
        })}

        {!readOnly && addableDepts.length > 0 && (
          <Box
            component="button"
            onClick={(e) => setDeptAnchor(e.currentTarget)}
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              background: 'transparent', border: `1px dashed ${T.ln2}`, color: T.dm,
              fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: `${R.pill}px`,
              cursor: CURSOR_POINTER, fontFamily: 'inherit',
              '&:hover': { borderColor: T.pr, color: T.pr },
            }}
          >
            <Icon name="plus" /> {t('workflow.addDepartment')}
          </Box>
        )}
      </Box>

      {/* ── 개별 사용자 ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <Box sx={{ fontSize: 11, fontWeight: 700, color: T.dm2, letterSpacing: '0.04em', mr: '2px' }}>
          {t('workflow.users')}
        </Box>

        {value.users.map((k) => {
          const u = resolveUser(k);
          return (
            <Box
              key={k}
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: T.sf3, fontSize: 12, fontWeight: 500,
                padding: '2px 4px 2px 3px', borderRadius: `${R.pill}px`,
              }}
            >
              <UserAvatar user={u} size={20} />
              <Box sx={{ color: T.tx2 }}>{u?.name ?? k}</Box>
              {!readOnly ? (
                <Box
                  component="button"
                  onClick={() => removeUser(k)}
                  sx={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 17, height: 17, borderRadius: '50%', border: 'none', padding: 0,
                    background: 'transparent', color: T.dm2, cursor: CURSOR_POINTER,
                    '&:hover': { background: T.dangerSoft, color: T.danger },
                  }}
                >
                  <Icon name="x" />
                </Box>
              ) : (
                <Box sx={{ width: 5 }} />
              )}
            </Box>
          );
        })}

        {!readOnly && (
          <Box
            component="button"
            onClick={() => setUserOpen(true)}
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              background: 'transparent', border: `1px dashed ${T.ln2}`, color: T.dm,
              fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: `${R.pill}px`,
              cursor: CURSOR_POINTER, fontFamily: 'inherit',
              '&:hover': { borderColor: T.pr, color: T.pr },
            }}
          >
            <Icon name="plus" /> {t('workflow.addUser')}
          </Box>
        )}
      </Box>

      {empty && readOnly && (
        <Box sx={{ fontSize: 12, color: T.dm2, mt: '8px' }}>{t('workflow.noneYet')}</Box>
      )}

      <Menu
        anchorEl={deptAnchor}
        open={Boolean(deptAnchor)}
        onClose={() => setDeptAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        {addableDepts.map((d) => (
          <MenuItem key={d} onClick={() => addDept(d)} sx={{ fontSize: 13 }}>
            {d}
          </MenuItem>
        ))}
      </Menu>

      {userOpen && (
        <UserSearchDialog
          title={t('workflow.addUser')}
          excludeKnoxIds={new Set(value.users)}
          onClose={() => setUserOpen(false)}
          // 부서를 함께 고르게 하지 않는다 — 개별 사용자는 knoxId만 저장하고, 표시용
          // 부서는 SDPCommonAPI 조회로 해결한다(설계서 01장 §6, §3.3).
          onConfirm={(knoxId) => addUser(knoxId)}
        />
      )}
    </Box>
  );
}
