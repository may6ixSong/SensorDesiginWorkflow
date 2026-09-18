import { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { Badge } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { NetworkTag } from '@/components/artifact/ArtifactChips';
import { useMyArtifacts } from '@/api/hooks/useAssignments';
import { fmtAt } from '@/lib/canvasModel';
import { canonicalDepartmentLabel } from '@/shared/constants/departments';
import { MyArtifactRowDto } from '@/types/domain';
import { FONT_MONO, T, TIER_COLOR, TIER_LABEL } from '@/theme/tokens';

/**
 * 내가/내 부서가 관리하는 산출물 자리(block) 목록 — 모든 과제·모든 workflow를 가로지른다
 * (설계서 09장 §3).
 *
 * ★ 행의 정체성은 artifact가 아니라 **block**이다. 같은 산출물이 여러 workflow에 놓이면
 *   그만큼 행이 나온다 — 그 자리마다 phase도 recipient 구성도 다르기 때문이다(04장 §4.4).
 * ★ 판정 기준은 **workflow 소속 부서 + `intent: 'own'`**이다. Tier A/C는 실제 편집 권한을
 *   그 서비스가 들고 있어 SIREN이 알 수 없고, 산출물마다 물어보면 목록 하나에 수십 번의
 *   외부 호출이 나간다 — 그래서 A/B/C를 가리지 않고 이 기준 하나로 통일했다(사용자 확정).
 * ★ **최근 1년** 안에 움직인 것만 온다. 그보다 오래된 것은 서버가 아예 싣지 않는다.
 */
export function MyArtifactsPanel({ sx }: { sx?: object }) {
  const { data = [], isLoading, isError } = useMyArtifacts();
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data;
    return data.filter((r) =>
      `${r.artifactName} ${r.blockName} ${r.workflowName} ${r.projectCode} ${r.projectName}`
        .toLowerCase()
        .includes(term),
    );
  }, [data, q]);

  return (
    <Box
      sx={{
        border: `1px solid ${T.ln}`, borderRadius: '14px', background: T.sf,
        display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
        ...sx,
      }}
    >
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap',
          padding: '13px 15px', borderBottom: `1px solid ${T.ln}`, background: T.sf2,
        }}
      >
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: T.ok, flex: '0 0 auto' }} />
        <Box sx={{ fontSize: 13, fontWeight: 700 }}>Artifacts</Box>
        <Box sx={{ flex: 1 }} />
        <Box
          sx={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: T.sf, border: `1px solid ${T.ln2}`, borderRadius: '8px',
            padding: '0 9px', height: 28, minWidth: 190,
            '&:focus-within': { borderColor: T.prLine, boxShadow: `0 0 0 3px ${T.prSoft}` },
          }}
        >
          <Box component="span" sx={{ color: T.dm2, display: 'flex' }}>
            <Icon name="search" />
          </Box>
          <Box
            component="input"
            value={q}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
            placeholder="Filter"
            sx={{
              border: 'none', outline: 'none', background: 'transparent',
              fontFamily: 'inherit', fontSize: 12, flex: 1, color: T.tx, minWidth: 0,
              '&::placeholder': { color: T.dm2 },
            }}
          />
        </Box>
        <Box sx={{ fontSize: 11, color: T.dm2, fontFamily: FONT_MONO }}>{rows.length}</Box>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', padding: '9px', minHeight: 200 }}>
        {isError ? (
          <Box sx={{ fontSize: 12, color: T.danger, padding: '22px 8px', textAlign: 'center' }}>
            Could not load your artifacts.
          </Box>
        ) : isLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[0, 1, 2, 3].map((i) => (
              <Box
                key={i}
                sx={{
                  height: 52, borderRadius: '10px', border: `1px solid ${T.ln}`, background: T.sf2,
                  animation: 'sirenPulse 1.4s ease-in-out infinite', animationDelay: `${i * 0.16}s`,
                }}
              />
            ))}
          </Box>
        ) : !rows.length ? (
          <Box
            sx={{
              border: `1px dashed ${T.ln2}`, borderRadius: '10px',
              padding: '30px 16px', textAlign: 'center', fontSize: 12, color: T.dm2,
            }}
          >
            {data.length
              ? 'No artifact matches that filter.'
              : 'None of your departments’ workflows has a mapped artifact updated in the past year.'}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {rows.map((row) => (
              <ArtifactRow key={row.blockId} row={row} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * 클릭 이벤트가 없는 것은 **의도된 상태**다 — 무엇을 열지 아직 정하지 않았다(사용자 요청).
 * 그래서 button이 아니라 그냥 행이고, hover도 주지 않는다.
 */
function ArtifactRow({ row }: { row: MyArtifactRowDto }) {
  const tier = TIER_COLOR[row.tier];
  const latest = row.latestVersion;

  return (
    <Box
      sx={{
        border: `1px solid ${T.ln}`, borderRadius: '10px', background: T.sf,
        padding: '9px 12px',
        display: 'grid',
        gridTemplateColumns: 'minmax(200px, 1.6fr) minmax(150px, 1fr) minmax(120px, .9fr) minmax(130px, 1fr)',
        gap: '12px', alignItems: 'center',
        '@media (max-width: 1000px)': { gridTemplateColumns: '1fr 1fr' },
        '@media (max-width: 620px)': { gridTemplateColumns: '1fr' },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <Box sx={{ fontSize: 12.5, fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>
            {row.blockName}
          </Box>
          <NetworkTag network={row.network} />
          <Box
            sx={{
              fontSize: 10, fontWeight: 700, color: tier.fg, background: tier.bg,
              padding: '1px 5px', borderRadius: '5px', whiteSpace: 'nowrap',
            }}
          >
            {TIER_LABEL[row.tier]}
          </Box>
        </Box>
        {/* block 이름과 artifact 자신의 이름은 다를 수 있다 — 캔버스는 block 이름을 쓴다. */}
        {row.artifactName !== row.blockName && (
          <Box sx={{ fontSize: 10.5, color: T.dm2, mt: '2px', overflowWrap: 'anywhere' }}>
            {row.artifactName}
          </Box>
        )}
      </Box>

      <Box sx={{ minWidth: 0, fontSize: 11.5 }}>
        <Box sx={{ color: T.tx2, overflowWrap: 'anywhere' }}>{row.workflowName}</Box>
        <Box sx={{ color: T.dm2, fontSize: 10.5 }}>
          {row.projectCode} · {canonicalDepartmentLabel(row.workflowDepartment)}
        </Box>
      </Box>

      <Box sx={{ minWidth: 0 }}>
        {latest ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 700 }}>
                {latest.versionLabel}
              </Box>
              {!latest.isPublished && (
                <Badge color={T.dm} bg={T.sf3} borderColor={T.ln2}>WORKING</Badge>
              )}
            </Box>
            <Box sx={{ fontSize: 10, color: T.dm2, fontFamily: FONT_MONO }}>
              {fmtAt(latest.occurredAt)}
            </Box>
          </>
        ) : (
          <Box sx={{ fontSize: 11.5, color: T.dm2 }}>Not published</Box>
        )}
      </Box>

      <Box sx={{ minWidth: 0, display: 'flex', gap: '3px', flexWrap: 'wrap', alignItems: 'center' }}>
        {row.recipientDepartments.map((d) => (
          <Badge key={d} color={T.recv} bg={T.recvSoft} borderColor={T.recv}>
            {canonicalDepartmentLabel(d)}
          </Badge>
        ))}
        {row.recipientUserCount > 0 && (
          <Badge color={T.dm} bg={T.sf3} borderColor={T.ln}>+{row.recipientUserCount}</Badge>
        )}
        {!row.recipientDepartments.length && !row.recipientUserCount && (
          <Box sx={{ fontSize: 11, color: T.dm2 }}>No recipients yet</Box>
        )}
      </Box>
    </Box>
  );
}
