import { useMemo, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { listCalypsoArtifacts, setCalypsoUserDepartments } from '@/api/calypsoClient';
import { queryKeys } from '@/api/queryKeys';
import { Field, TextInput } from '@/components/common/Panel';
import { Badge } from '@/components/common/SirenButton';
import { departmentName } from '@/shared/constants/departments';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

interface Props {
  projectId: string | undefined;
  /** Calypso ACL의 부서 단위 부여 판정에 쓰는 값 — 목록 자체엔 영향 없지만 항상 실어 보낸다. */
  myDepartments: string[];
  value: string;
  onChange: (id: string) => void;
}

/**
 * Calypso는 Hub 레지스트리에 없어(설계서 §19.1 — SIREN 내장 기능) 연동된 서비스와
 * 같은 code+revision 후보 검색을 쓸 수 없다. 대신 Calypso가 **이미 본인 view 권한 기준으로
 * 필터링해서 돌려주는** 이 project의 artifact 목록에서 직접 고르게 한다
 * (calypso/src/artifacts/artifacts.service.ts#list — computeAccess !== 'none'만 남긴다).
 * 후보가 하나뿐이어도 자동 선택하지 않는다 — ExternalArtifactPicker와 같은 원칙이다.
 */
export function CalypsoArtifactPicker({ projectId, myDepartments, value, onChange }: Props) {
  const [q, setQ] = useState('');
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.calypsoArtifacts(projectId ?? ''),
    enabled: !!projectId,
    queryFn: () => {
      setCalypsoUserDepartments(myDepartments);
      return listCalypsoArtifacts({ projectId });
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter((a) => `${a.name} ${a.department}`.toLowerCase().includes(term));
  }, [data, q]);

  return (
    <Field label="Calypso artifact — only ones you have view access to">
      <TextInput value={q} onChange={setQ} placeholder="Search by name or department" />
      <Box sx={{ mt: '8px', maxHeight: 230, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {isError ? (
          <Box sx={{ fontSize: 11.5, color: T.dm, background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '8px', padding: '8px 10px', lineHeight: 1.6 }}>
            Could not reach Calypso — check that it's running.
          </Box>
        ) : isLoading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0', fontSize: 12, color: T.dm2 }}>
            <CircularProgress size={13} /> Loading Calypso artifacts…
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ fontSize: 11.5, color: T.dm, background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '8px', padding: '8px 10px', lineHeight: 1.6 }}>
            {data?.length
              ? 'No match for that search.'
              : "No Calypso artifacts you can access in this project yet — register one on the project's Artifacts page first."}
          </Box>
        ) : (
          filtered.map((a) => {
            const sel = value === a.id;
            return (
              <Box
                key={a.id}
                onClick={() => onChange(a.id)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: '8px', cursor: CURSOR_POINTER,
                  padding: '8px 10px', borderRadius: '8px',
                  background: sel ? T.tl2 : T.sf,
                  border: `1px solid ${sel ? T.tl3 : T.ln}`,
                  '&:hover': { borderColor: sel ? T.tl3 : T.ln2 },
                }}
              >
                <Box
                  sx={{
                    width: 14, height: 14, borderRadius: '50%', flex: '0 0 auto',
                    border: `2px solid ${sel ? T.tl : T.ln3}`,
                    background: sel ? T.tl : 'transparent',
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.name}
                  </Box>
                  <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, color: T.dm2, mt: '2px' }}>
                    {departmentName(a.department)}
                  </Box>
                </Box>
                <Badge
                  color={a.myAccess === 'edit' ? T.tl : T.dm}
                  bg={a.myAccess === 'edit' ? T.tl2 : T.sf2}
                  borderColor={a.myAccess === 'edit' ? T.tl3 : T.ln}
                >
                  {a.myAccess === 'edit' ? 'EDIT' : 'VIEW'}
                </Badge>
              </Box>
            );
          })
        )}
      </Box>
    </Field>
  );
}
