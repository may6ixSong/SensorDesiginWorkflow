import { useMemo } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import createDOMPurify from 'dompurify';
import { CalypsoArtifact, CalypsoVersionView, getCalypsoSheetVersion } from '@/api/calypsoClient';
import { HubService } from '@/hooks/useHubServices';
import { ArtifactCandidateDto } from '@/types/domain';
import { FONT_MONO, R, T } from '@/theme/tokens';
import { EditChip, NetworkChip, ServiceChip } from './ArtifactChips';

/** picker 왼쪽 목록에서 지금 오른쪽 칸에 보여주는 대상. */
export type PickerFocus =
  | { kind: 'type'; service: HubService; typeKey: string; typeName: string; source: 'live' | 'hpc' }
  | { kind: 'live'; service: HubService; typeKey: string; typeName: string; source: 'live' | 'hpc'; candidate: ArtifactCandidateDto }
  | { kind: 'file'; artifact: CalypsoArtifact; deptLabel: string };

/**
 * 서비스가 등록 때 넣은 preview html은 외부에서 온 값이다 — 전역 DOMPurify 설정(다른 곳의
 * sanitize)에 영향을 주지 않도록 **별도 인스턴스**를 만들어, script/이벤트 핸들러는 기본으로
 * 걷어내고 외부 요청이 생길 만한 것(외부 src, url() 스타일, link/style 태그)도 함께 제거한다.
 * iframe 없이 그대로 화면에 주입하므로 이 정리가 유일한 방어선이다.
 */
const purify = createDOMPurify(window);
purify.addHook('afterSanitizeAttributes', (node) => {
  const el = node as Element;
  const src = el.getAttribute?.('src');
  if (src && !src.startsWith('data:image/')) el.removeAttribute('src');
  const style = el.getAttribute?.('style');
  if (style && /url\(|@import|expression\(/i.test(style)) el.removeAttribute('style');
  if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
});
const PURIFY_CONFIG = {
  FORBID_TAGS: ['style', 'link', 'meta', 'iframe', 'object', 'embed', 'form', 'base'],
  FORBID_ATTR: ['srcset', 'action', 'formaction'],
};

function SanitizedHtml({ html }: { html: string }) {
  const clean = useMemo(() => purify.sanitize(html, PURIFY_CONFIG) as unknown as string, [html]);
  return (
    <Box
      sx={{ fontSize: 12.5, lineHeight: 1.6, overflow: 'auto', maxWidth: '100%', '& img': { maxWidth: '100%' } }}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

const initials = (n: string) => n.trim().slice(0, 2).toUpperCase() || '?';

function Icon36({ name, url }: { name: string; url: string }) {
  return (
    <Box
      sx={{
        width: 36, height: 36, borderRadius: '8px', flex: '0 0 auto', display: 'grid', placeItems: 'center',
        overflow: 'hidden', fontSize: 12, fontWeight: 700, color: '#fff', background: T.pr,
      }}
    >
      {url
        ? <Box component="img" src={url} alt="" sx={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff' }} />
        : initials(name)}
    </Box>
  );
}

const box = {
  border: `1px solid ${T.ln}`, borderRadius: `${R.sm}px`, background: T.sf, padding: '12px', minWidth: 0,
};

/** 서비스 종류 한 개의 대표 화면 — 등록된 previewHtml, 없으면 등록 정보로 만든 기본 카드. */
function TypePreview({ f }: { f: Extract<PickerFocus, { kind: 'type' | 'live' }> }) {
  const type = f.service.artifactTypes.find((t) => t.key === f.typeKey);
  const html = type?.previewHtml?.trim();
  const description = type?.description || f.service.description;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Icon36 name={f.service.name} url={f.service.icon} />
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ fontSize: 11, color: T.dm2 }}>{f.service.name}</Box>
          <Box sx={{ fontSize: 14, fontWeight: 700 }}>{f.typeName}</Box>
        </Box>
        <Box sx={{ flex: 1 }} />
        <NetworkChip network={f.source === 'hpc' ? 'HPC' : 'OA'} />
        <ServiceChip source={f.source} />
      </Box>
      {description && <Box sx={{ fontSize: 12, color: T.dm, lineHeight: 1.6 }}>{description}</Box>}
      {html ? (
        <Box sx={{ ...box, maxHeight: 280, overflow: 'auto' }}><SanitizedHtml html={html} /></Box>
      ) : (
        <Box sx={{ ...box, fontSize: 11.5, color: T.dm2, lineHeight: 1.6, borderStyle: 'dashed' }}>
          This service didn&apos;t provide a preview for this kind of artifact.
        </Box>
      )}
      {html && (
        <Box sx={{ fontSize: 10.5, color: T.dm2 }}>
          This is what this kind of artifact looks like, not the content of the one you pick.
        </Box>
      )}
    </Box>
  );
}

function Grid({ rows }: { rows: string[][] }) {
  const shown = rows.slice(0, 10).map((r) => r.slice(0, 8));
  return (
    <Box sx={{ overflow: 'auto', border: `1px solid ${T.ln}`, borderRadius: `${R.sm}px`, background: T.sf }}>
      <Box component="table" sx={{ borderCollapse: 'collapse', fontFamily: FONT_MONO, fontSize: 10.5, width: '100%' }}>
        <tbody>
          {shown.map((r, i) => (
            <Box component="tr" key={i} sx={{ background: i === 0 ? T.sf2 : undefined }}>
              {r.map((c, j) => (
                <Box
                  component="td"
                  key={j}
                  sx={{
                    padding: '3px 7px', borderBottom: `1px solid ${T.ln}`, whiteSpace: 'nowrap',
                    fontWeight: i === 0 ? 600 : 400, color: i === 0 ? T.tx : T.dm,
                  }}
                >
                  {c}
                </Box>
              ))}
            </Box>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

function CalypsoSheetPreview({ a, v }: { a: CalypsoArtifact; v: CalypsoVersionView }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['calypso', 'sheet-preview', a.id, v.versionRef],
    queryFn: () => getCalypsoSheetVersion(a.id, a.projectId, v.versionRef),
  });
  if (isLoading) {
    return <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 12, color: T.dm2 }}><CircularProgress size={13} /> Loading sheet…</Box>;
  }
  const sheet = data?.grid.sheets[0];
  if (isError || !sheet) return <Box sx={{ fontSize: 11.5, color: T.dm2 }}>Couldn&apos;t load this sheet&apos;s content.</Box>;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <Box sx={{ fontSize: 10.5, color: T.dm2 }}>
        {sheet.name} · first {Math.min(10, sheet.rows.length)} of {sheet.rows.length} rows
      </Box>
      <Grid rows={sheet.rows} />
    </Box>
  );
}

function CalypsoPreview({ f }: { f: Extract<PickerFocus, { kind: 'file' }> }) {
  const a = f.artifact;
  const v = a.releasedVersion ?? a.latestVersion;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <Box>
        <Box sx={{ fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>{a.name}</Box>
        <Box sx={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', mt: '6px' }}>
          <EditChip level={a.myAccess} />
          <NetworkChip network={a.network} />
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.dm2 }}>
            {a.contentKind} · {f.deptLabel} · {a.versionCount} version{a.versionCount === 1 ? '' : 's'}
          </Box>
        </Box>
      </Box>
      {!v ? (
        <Box sx={{ ...box, fontSize: 11.5, color: T.dm2, borderStyle: 'dashed' }}>
          No version yet. You can add the first one from the artifact detail after mapping.
        </Box>
      ) : (
        <>
          <Box sx={{ fontSize: 11.5, color: T.dm }}>
            Showing <b>{v.versionLabel}</b>{v.isReleased ? ' (released)' : ' (latest, not released)'}
            {v.versionNote ? ` — ${v.versionNote}` : ''}
          </Box>
          {a.contentKind === 'sheet' ? (
            <CalypsoSheetPreview a={a} v={v} />
          ) : (
            <Box sx={{ ...box, padding: 0 }}>
              {v.files.map((file) => (
                <Box key={file.storageKey} sx={{ padding: '6px 10px', borderBottom: `1px solid ${T.ln}`, fontSize: 12, overflowWrap: 'anywhere' }}>
                  {file.fileName}
                </Box>
              ))}
              {v.links.map((l) => (
                <Box key={l.url} sx={{ padding: '6px 10px', borderBottom: `1px solid ${T.ln}`, fontSize: 12, display: 'flex', gap: '8px', minWidth: 0 }}>
                  <b style={{ flex: 'none' }}>{l.label || 'Link'}</b>
                  <Box component="span" sx={{ fontFamily: FONT_MONO, color: T.dm2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url}</Box>
                </Box>
              ))}
              {v.paths.map((p) => (
                <Box key={p.path} sx={{ padding: '6px 10px', borderBottom: `1px solid ${T.ln}`, fontSize: 12, display: 'flex', gap: '8px', minWidth: 0 }}>
                  <b style={{ flex: 'none' }}>{p.label || 'Path'}</b>
                  <Box component="span" sx={{ fontFamily: FONT_MONO, color: T.dm2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</Box>
                </Box>
              ))}
              {!v.files.length && !v.links.length && !v.paths.length && (
                <Box sx={{ padding: '8px 10px', fontSize: 11.5, color: T.dm2 }}>This version has no content.</Box>
              )}
            </Box>
          )}
        </>
      )}
      {a.description && <Box sx={{ fontSize: 12, color: T.dm, lineHeight: 1.6 }}>{a.description}</Box>}
    </Box>
  );
}

export function ArtifactPreviewPane({ focus }: { focus: PickerFocus | null }) {
  if (!focus) {
    return (
      <Box sx={{ ...box, borderStyle: 'dashed', color: T.dm2, fontSize: 12, lineHeight: 1.7, display: 'grid', placeItems: 'center', minHeight: 160, textAlign: 'center' }}>
        Pick an artifact on the left to see what it is.
      </Box>
    );
  }
  if (focus.kind === 'file') return <CalypsoPreview f={focus} />;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {focus.kind === 'live' && (
        <Box>
          <Box sx={{ fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>{focus.candidate.name}</Box>
          <Box sx={{ display: 'flex', gap: '6px', alignItems: 'center', mt: '6px' }}>
            <EditChip level={focus.candidate.level} />
            {focus.candidate.currentVersionLabel && (
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.dm2 }}>{focus.candidate.currentVersionLabel}</Box>
            )}
          </Box>
          {!focus.candidate.pickable && (
            <Box sx={{ fontSize: 11, color: T.warn, mt: '6px' }}>
              {focus.candidate.level === 'view' ? 'View only — needs edit access to give this.' : 'No access.'}
            </Box>
          )}
        </Box>
      )}
      <TypePreview f={focus} />
    </Box>
  );
}
