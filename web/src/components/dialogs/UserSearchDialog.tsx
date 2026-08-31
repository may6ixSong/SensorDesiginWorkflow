import { useState } from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton, Chip } from '@/components/common/SirenButton';
import { Card, Ey, Field, Row, SelectInput, TextInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { DEPARTMENTS } from '@/shared/constants/departments';
import { Employee, getEmployeesByIDs, getEmployeesByName } from '@/service/user-service';
import { colorForKnoxId } from '@/app/providers/DirectoryProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import { T } from '@/theme/tokens';

type SearchType = 'id' | 'name';

interface Props {
  title: string;
  /** 이미 추가된 knoxId — 검색 결과에서 "Already added"로 표시하고 선택을 막는다. */
  excludeKnoxIds?: Set<string>;
  /** 지정하면 부서 선택 단계 없이 이 값으로 바로 확정한다 (예: workflow owner는 항상 'analog'). */
  fixedDepartment?: string;
  /** true면(그리고 fixedDepartment가 없으면) 검색→선택 뒤 부서를 고르는 단계를 하나 더 보여준다. */
  requireDepartment?: boolean;
  onClose: () => void;
  onConfirm: (knoxId: string, department?: string) => void;
}

function displayName(e: Employee, ko: boolean): string {
  return ko ? (e.fullName || e.enFullName || e.userId) : (e.enFullName || e.fullName || e.userId);
}

function displayDept(e: Employee, ko: boolean): string {
  return ko ? (e.departmentName || e.enDepartmentName || '-') : (e.enDepartmentName || e.departmentName || '-');
}

/**
 * SDP_COMMON_API로 Knox ID/이름을 검색해 사용자를 고르는 공용 dialog.
 * SSM_WEB의 ProjectMembersPage "Add member" 흐름과 동일한 계약(검색 → 결과에서 Select).
 */
export function UserSearchDialog({
  title, excludeKnoxIds, fixedDepartment, requireDepartment, onClose, onConfirm,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const ko = user?.Language === 'ko';

  const [searchType, setSearchType] = useState<SearchType>('id');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Employee[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Employee | null>(null);
  const [dept, setDept] = useState<string>(DEPARTMENTS[0].id);

  const search = async () => {
    const kw = keyword.trim();
    if (!kw || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = searchType === 'id' ? await getEmployeesByIDs(kw) : await getEmployeesByName(kw);
      setResults(res.employees ?? []);
    } catch {
      setError(t('members.searchFailed'));
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const choose = (e: Employee) => {
    if (fixedDepartment !== undefined) {
      onConfirm(e.userId, fixedDepartment);
      return;
    }
    if (requireDepartment) {
      setPicked(e);
      return;
    }
    onConfirm(e.userId);
  };

  if (picked) {
    return (
      <ModalShell open onClose={onClose} width={480} header={<Box sx={{ fontSize: 16, fontWeight: 700 }}>{title}</Box>}>
        <Card>
          <Ey sx={{ mb: '9px' }}>{t('members.selectedUser')}</Ey>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '16px' }}>
            <UserAvatar
              user={{ knoxId: picked.userId, name: displayName(picked, ko), department: '', color: colorForKnoxId(picked.userId) }}
              size={32}
            />
            <Box>
              <Box sx={{ fontSize: 14, fontWeight: 600 }}>{displayName(picked, ko)}</Box>
              <Box sx={{ fontSize: 11, color: T.dm2 }}>{picked.userId} · {displayDept(picked, ko)}</Box>
            </Box>
          </Box>
          <Field label={t('members.department')}>
            <SelectInput value={dept} onChange={setDept} options={DEPARTMENTS.map((d) => ({ value: d.id, label: d.name }))} />
          </Field>
          <Row sx={{ justifyContent: 'flex-end', mt: '4px' }}>
            <SirenButton variant="ghost" onClick={() => setPicked(null)}>{t('members.back')}</SirenButton>
            <SirenButton variant="primary" onClick={() => onConfirm(picked.userId, dept)}>
              <Icon name="check" /> {t('members.confirmAdd')}
            </SirenButton>
          </Row>
        </Card>
      </ModalShell>
    );
  }

  return (
    <ModalShell open onClose={onClose} width={560} header={<Box sx={{ fontSize: 16, fontWeight: 700 }}>{title}</Box>}>
      <Row sx={{ mb: '12px', alignItems: 'flex-end' }}>
        <Field label={t('members.searchBy')} sx={{ width: 130, mb: 0 }}>
          <SelectInput
            value={searchType}
            onChange={(v) => setSearchType(v as SearchType)}
            options={[
              { value: 'id', label: t('members.knoxId') },
              { value: 'name', label: t('members.name') },
            ]}
          />
        </Field>
        <Field label={searchType === 'id' ? t('members.knoxId') : t('members.name')} sx={{ flex: 1, mb: 0 }}>
          <TextInput
            value={keyword}
            onChange={setKeyword}
            autoFocus
            placeholder={searchType === 'id' ? t('members.searchPlaceholderId') : t('members.searchPlaceholderName')}
            onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          />
        </Field>
        <SirenButton variant="primary" onClick={search} disabled={loading || !keyword.trim()}>
          <Icon name="search" /> {t('members.search')}
        </SirenButton>
      </Row>

      {error && <Box sx={{ fontSize: 12, color: T.rd, mb: '10px' }}>{error}</Box>}

      <Card sx={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ padding: '16px', fontSize: 12.5, color: T.dm2 }}>{t('members.searching')}</Box>
        ) : results === null ? (
          <Box sx={{ padding: '16px', fontSize: 12.5, color: T.dm2 }}>{t('members.searchHint')}</Box>
        ) : results.length === 0 ? (
          <Box sx={{ padding: '16px', fontSize: 12.5, color: T.dm2 }}>{t('members.noResults')}</Box>
        ) : (
          results.map((e, i) => {
            const already = !!excludeKnoxIds?.has(e.userId);
            return (
              <Box
                key={e.userId}
                sx={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 13px',
                  borderTop: i > 0 ? `1px solid ${T.ln}` : 'none',
                }}
              >
                <UserAvatar user={{ knoxId: e.userId, name: displayName(e, ko), department: '', color: colorForKnoxId(e.userId) }} size={28} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ fontSize: 13, fontWeight: 600 }}>{displayName(e, ko)}</Box>
                  <Box sx={{ fontSize: 11, color: T.dm2 }}>{e.userId} · {displayDept(e, ko)}</Box>
                </Box>
                {already ? (
                  <Chip>{t('members.alreadyAdded')}</Chip>
                ) : (
                  <SirenButton onClick={() => choose(e)}>{t('members.select')}</SirenButton>
                )}
              </Box>
            );
          })
        )}
      </Card>
    </ModalShell>
  );
}
