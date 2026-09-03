import { Box } from '@mui/material';
import { CanvasNode, VersionView, fmtAt, versionBy } from '@/lib/canvasModel';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { UserAvatar } from '@/components/common/Avatar';
import { SirenButton, Badge } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { toast } from '@/store/toastStore';
import { FONT_DISPLAY, FONT_MONO, T } from '@/theme/tokens';

interface Props {
  d: CanvasNode;
  version: VersionView | null;
}

/** 문서면 가운데 출처 표의 한 줄. */
function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'baseline', gap: '10px',
        padding: '7px 0', borderBottom: `1px solid ${T.ln}`, minWidth: 0,
      }}
    >
      <Box sx={{ fontSize: 11, color: T.dm2, flex: '0 0 92px' }}>{label}</Box>
      <Box
        sx={{
          flex: 1, minWidth: 0, fontSize: 11.5, color: value === '—' ? T.dm2 : T.tx,
          fontFamily: mono ? FONT_MONO : undefined, wordBreak: 'break-all',
        }}
      >
        {value}
      </Box>
    </Box>
  );
}

/** 문서면 아래 띠의 한 칸. */
function FootMeta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box
        sx={{
          fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.14em',
          textTransform: 'uppercase', color: T.dm2,
        }}
      >
        {label}
      </Box>
      <Box
        sx={{
          fontSize: 12, fontWeight: 600, color: T.tx, mt: '3px',
          fontFamily: mono ? FONT_MONO : undefined, wordBreak: 'break-all',
        }}
      >
        {value}
      </Box>
    </Box>
  );
}

/**
 * 상세 패널 왼쪽 — 지금 고른 버전의 "내용" 면.
 *
 * SIREN은 실물 파일을 갖고 있지 않으므로(Hub 설계서 §1.2) 여기서 파일을 렌더하지
 * 않는다. 대신 그 버전이 무엇인지(표지), 어디에 있는지(링크/경로), 무엇으로부터
 * 만들어졌는지(lineage)를 한 장의 문서면처럼 보여주고, 실물은 소유 서비스로
 * 링크-아웃한다. 나중에 임베드가 붙으면 이 자리에 그 서비스 화면이 들어온다.
 */
export function VersionContents({ d, version: v }: Props) {
  const { resolveUser } = useDirectory();

  if (!v) {
    return (
      <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', padding: '30px', background: T.sf3 }}>
        <Box sx={{ textAlign: 'center', color: T.dm2 }}>
          <Icon name="word" size={26} />
          <Box sx={{ fontSize: 12.5, mt: '10px' }}>No version to show yet.</Box>
        </Box>
      </Box>
    );
  }

  const by = resolveUser(versionBy(v));
  const accent = v.isReleased ? T.tl : T.am;

  return (
    <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', background: T.sf3, padding: '22px', display: 'flex' }}>
      <Box
        sx={{
          width: '100%', maxWidth: 660, mx: 'auto', minHeight: '100%',
          background: T.sf,
          border: `1px solid ${T.ln}`, borderRadius: '12px',
          boxShadow: T.sl, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* 문서 표지 상단 룰 — 릴리스/작업본을 색으로 먼저 구분해 준다 */}
        <Box sx={{ height: 4, background: accent, flex: '0 0 auto' }} />

        <Box sx={{ padding: '24px 28px 26px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.18em',
              textTransform: 'uppercase', color: T.dm2,
            }}
          >
            {d.serviceKey ?? 'Manual record'}
          </Box>

          <Box
            sx={{
              fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 800,
              letterSpacing: '-.02em', lineHeight: 1.25, mt: '8px', color: T.tx,
            }}
          >
            {d.name}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', mt: '14px', flexWrap: 'wrap' }}>
            <Box sx={{ fontFamily: FONT_MONO, fontSize: 26, fontWeight: 600, color: accent, lineHeight: 1 }}>
              {v.versionLabel}
            </Box>
            <Badge
              color={accent}
              bg={v.isReleased ? T.tl2 : T.am2}
              borderColor={v.isReleased ? T.tl3 : T.am3}
            >
              {v.isReleased ? 'RELEASE' : 'WORKING'}
            </Badge>
            <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>
              TIER {v.tier} · {v.confidence}
            </Badge>
          </Box>

          <Box
            sx={{
              display: 'flex', alignItems: 'center', gap: '9px', mt: '16px',
              paddingTop: '15px', borderTop: `1px solid ${T.ln}`,
            }}
          >
            <UserAvatar user={by} size={30} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ fontSize: 13, fontWeight: 600 }}>{by.name}</Box>
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.dm2, mt: '2px' }}>
                {fmtAt(v.at)}
                {v.giverDept ? ` · ${v.giverDept}` : ''}
              </Box>
            </Box>
          </Box>

          {v.note && (
            <Box
              sx={{
                mt: '18px', padding: '13px 15px', borderRadius: '9px',
                background: T.sf2, border: `1px solid ${T.ln}`,
                borderLeft: `3px solid ${accent}`,
                fontSize: 13, lineHeight: 1.75, color: T.tx, whiteSpace: 'pre-wrap',
              }}
            >
              {v.note}
            </Box>
          )}

          {/* 출처 — 이 값을 SIREN이 어떻게 알게 됐는지(§9.2). C/D는 담당자의 주장,
              A/B는 관측이라 서로 다른 칸이 채워진다. */}
          <Box
            sx={{
              mt: '18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: '2px 20px',
            }}
          >
            <MetaRow label="Version ref" value={v.versionRef ?? '—'} mono />
            <MetaRow label="Recorded by" value={v.assertedBy ?? '—'} mono />
            <MetaRow label="Recorded at" value={v.assertedAt ? fmtAt(v.assertedAt) : '—'} mono />
            <MetaRow label="Observed at" value={v.observedAt ? fmtAt(v.observedAt) : '—'} mono />
          </Box>

          {/* lineage — 이 버전이 무엇으로부터 만들어졌는지(§4.1) */}
          {(v.sourceRefs?.length ?? 0) > 0 && (
            <Box sx={{ mt: '18px' }}>
              <Box
                sx={{
                  fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.15em',
                  textTransform: 'uppercase', color: T.dm2, mb: '8px',
                }}
              >
                Built from
              </Box>
              {v.sourceRefs.map((s) => (
                <Box
                  key={`${s.serviceKey}:${s.versionRef}`}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 0', borderTop: `1px solid ${T.ln}`,
                  }}
                >
                  <Box component="span" sx={{ color: T.dm2 }}><Icon name="link" size={12} /></Box>
                  <Box sx={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>{s.artifactKey}</Box>
                  <Box sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.dm2 }}>
                    {s.serviceKey} · {s.versionLabel || s.versionRef}
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          {/* 실물 위치 — 문서면 아래쪽에 붙여 한 장처럼 보이게 한다 */}
          <Box sx={{ mt: 'auto', paddingTop: '20px', borderTop: `1px solid ${T.ln}` }}>
            <Box
              sx={{
                fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.15em',
                textTransform: 'uppercase', color: T.dm2, mb: '9px',
              }}
            >
              {v.hpcPath ? 'HPC vwp path' : 'Location'}
            </Box>

            {v.hpcPath || v.viewUrl ? (
              <>
                <Box
                  sx={{
                    fontFamily: FONT_MONO, fontSize: 11.5, color: T.tx,
                    background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '7px',
                    padding: '9px 11px', wordBreak: 'break-all', lineHeight: 1.6,
                  }}
                >
                  {v.hpcPath ?? v.viewUrl}
                </Box>
                <Box sx={{ mt: '11px' }}>
                  {v.hpcPath ? (
                    <SirenButton
                      onClick={() => {
                        navigator.clipboard?.writeText(v.hpcPath as string);
                        toast('Path copied');
                      }}
                    >
                      <Icon name="copy" /> Copy path
                    </SirenButton>
                  ) : (
                    <SirenButton
                      onClick={() => window.open(v.viewUrl as string, '_blank', 'noopener')}
                    >
                      <Icon name="link" /> Open in {d.serviceKey ?? 'source'}
                    </SirenButton>
                  )}
                </Box>
              </>
            ) : (
              <Box sx={{ fontSize: 12.5, color: T.dm2 }}>No link recorded for this version.</Box>
            )}
          </Box>
        </Box>

        {/* 문서면 아래 띠 — 이 산출물 자체의 맥락(버전이 아니라 산출물에 붙는 값들) */}
        <Box
          sx={{
            flex: '0 0 auto', display: 'flex', gap: '22px', flexWrap: 'wrap',
            padding: '13px 28px', background: T.sf2, borderTop: `1px solid ${T.ln}`,
          }}
        >
          <FootMeta label="Versions" value={String(d.versions.length)} />
          {d.artifactKey && <FootMeta label="Artifact key" value={d.artifactKey} mono />}
          {d.externalArtifactId && <FootMeta label="External id" value={d.externalArtifactId} mono />}
          {d.recvDept && <FootMeta label="Recipient" value={d.recvDept} />}
          {d.seriesTotal > 1 && <FootMeta label="Round" value={`${d.seriesIdx}/${d.seriesTotal}`} mono />}
        </Box>
      </Box>
    </Box>
  );
}
