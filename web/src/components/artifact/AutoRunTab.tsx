import { Box, CircularProgress } from '@mui/material';
import { useAutoRun, useRunAutoRunNow, useSetAutoRun } from '@/api/hooks/useAutoRun';
import { AutoRunRunDto, AutoRunStatus, NodeDto } from '@/types/domain';
import { Card, Ey } from '@/components/common/Panel';
import { Badge, SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { fmtAt } from '@/lib/canvasModel';
import { toast } from '@/store/toastStore';
import { FONT_MONO, R, T, TNUM } from '@/theme/tokens';

const BADGE_SX = { fontSize: 10.5, padding: '2px 7px', fontWeight: 700 };

const STATUS_LABEL: Record<AutoRunStatus, string> = {
  queued: 'Queued',
  dispatched: 'Sent',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
};

function statusColors(s: AutoRunStatus) {
  switch (s) {
    case 'succeeded': return { color: T.ok, bg: T.okSoft, borderColor: T.okLine };
    case 'failed': return { color: T.danger, bg: T.dangerSoft, borderColor: T.dangerLine };
    case 'running': return { color: T.pr, bg: T.prSoft, borderColor: T.prLine };
    case 'dispatched': return { color: T.info, bg: T.infoSoft, borderColor: T.infoLine };
    default: return { color: T.dm2, bg: T.sf2, borderColor: T.ln };
  }
}

const isActive = (s: AutoRunStatus) => s === 'queued' || s === 'dispatched' || s === 'running';

function StatusBadge({ status }: { status: AutoRunStatus }) {
  return (
    <Badge {...statusColors(status)} sx={{ ...BADGE_SX, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
      {isActive(status) && <CircularProgress size={9} thickness={6} sx={{ color: 'inherit' }} />}
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function Notice({ tone, children }: { tone: 'info' | 'warn'; children: React.ReactNode }) {
  const c = tone === 'warn'
    ? { color: T.warn, bg: T.warnSoft, line: T.warnLine }
    : { color: T.info, bg: T.infoSoft, line: T.infoLine };
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'flex-start', gap: '8px',
        background: c.bg, border: `1px solid ${c.line}`, color: c.color,
        borderRadius: `${R.sm}px`, padding: '9px 12px', fontSize: 12, lineHeight: 1.55, mb: '12px',
      }}
    >
      <Box sx={{ mt: '1px', flexShrink: 0 }}><Icon name={tone === 'warn' ? 'warn' : 'info'} /></Box>
      <Box>{children}</Box>
    </Box>
  );
}

/**
 * Auto Run 탭(설계서 10장 §8.2) — workflow Edit Access에게만 보인다.
 *
 * SIREN이 하는 일은 trigger 전달과 결과 수신까지다(사용자 결정 F4). 무엇이 어떻게 만들어지는지,
 * 버전을 바로 발행할지 temporary로 둘지는 그 서비스가 정한다 — 그래서 이 탭은 "무엇을 어떤
 * 버전으로 보냈고 서비스가 뭐라고 답했는가"만 보여준다.
 */
export function AutoRunTab({ node }: { node: NodeDto }) {
  const { resolveUser } = useDirectory();
  const state = useAutoRun(node.workflowId, node.id, true);
  const setEnabled = useSetAutoRun(node.workflowId, node.id);
  const runNow = useRunAutoRunNow(node.workflowId, node.id);

  if (state.isLoading || !state.data) {
    return (
      <Box sx={{ padding: '32px 8px', textAlign: 'center', color: T.dm2, fontSize: 12.5 }}>
        {state.isError ? 'Could not load Auto Run.' : 'Loading Auto Run…'}
      </Box>
    );
  }

  const s = state.data;
  const eligible = s.eligibility.eligible;
  const anyActive = s.runs.some((r) => isActive(r.status));
  const allSourcesPublished = s.sources.length > 0 && s.sources.every((x) => !!x.versionLabel);
  const updatedBy = s.updatedBy ? resolveUser(s.updatedBy) : null;

  const toggle = () => {
    setEnabled.mutate(!s.enabled, {
      onSuccess: (d) => toast(d.enabled ? 'Auto Run is on' : 'Auto Run is off'),
      onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not change Auto Run'),
    });
  };
  const run = () => {
    runNow.mutate(undefined, {
      onSuccess: () => toast('Trigger queued'),
      onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not start the run'),
    });
  };

  return (
    <>
      <Notice tone="info">
        When every source connected into this node has a new published version — newer than this
        artifact&apos;s latest version — SIREN sends a trigger to the service behind this artifact. The
        service decides what to generate. Run now sends the current published sources right away.
      </Notice>

      {!s.serverEnabled && <Notice tone="warn">Auto Run is turned off on this SIREN server.</Notice>}

      <Card sx={{ mb: '12px' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <Box
            sx={{
              width: 32, height: 32, borderRadius: '9px', flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: s.enabled ? T.prSoft : T.sf3, color: s.enabled ? T.pr : T.dm2,
              border: `1px solid ${s.enabled ? T.prLine : T.ln}`,
            }}
          >
            <Icon name="bolt" size={16} />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Box sx={{ fontSize: 13.5, fontWeight: 700 }}>
              Auto Run {s.enabled ? 'is on' : 'is off'}
            </Box>
            <Box sx={{ fontSize: 11.5, color: T.dm2, mt: '2px' }}>
              {s.target
                ? <>Triggers go to <b>{s.target.serviceName}</b>{s.target.typeName ? ` · ${s.target.typeName}` : ''}</>
                : 'No service can receive triggers for this artifact.'}
              {s.updatedAt && (
                <> · changed {fmtAt(s.updatedAt)}{updatedBy ? ` by ${updatedBy.name}` : s.updatedBy ? ` by ${s.updatedBy}` : ''}</>
              )}
            </Box>
          </Box>
          <SirenButton
            variant={s.enabled ? 'ghost' : 'primary'}
            onClick={toggle}
            disabled={setEnabled.isPending || (!s.enabled && !eligible)}
          >
            {setEnabled.isPending ? 'Saving…' : s.enabled ? 'Turn off' : 'Turn on'}
          </SirenButton>
          <SirenButton
            onClick={run}
            disabled={runNow.isPending || !eligible || !allSourcesPublished}
            title={!allSourcesPublished ? 'Every source needs a published version first' : undefined}
          >
            <Icon name="play" size={11} /> {runNow.isPending ? 'Sending…' : 'Run now'}
          </SirenButton>
        </Box>

        {!eligible && (
          <Box
            component="ul"
            sx={{
              m: '12px 0 0', padding: '9px 12px 9px 28px', fontSize: 12, lineHeight: 1.6, color: T.warn,
              background: T.warnSoft, border: `1px solid ${T.warnLine}`, borderRadius: `${R.sm}px`,
            }}
          >
            {s.eligibility.reasons.map((r) => <li key={r}>{r}</li>)}
          </Box>
        )}
      </Card>

      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '8px' }}>Sources — flows into this node</Ey>
        {s.sources.length === 0 ? (
          <Box sx={{ fontSize: 12, color: T.dm2 }}>No mapped source is connected yet.</Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {s.sources.map((src) => {
              const newer = !!src.publishedAt && (!s.targetLatestAt || new Date(src.publishedAt) > new Date(s.targetLatestAt));
              return (
                <Box key={src.nodeId} sx={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 12 }}>
                  <Box sx={{ fontWeight: 600, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {src.nodeName}
                  </Box>
                  {src.versionLabel ? (
                    <>
                      <Box sx={{ fontFamily: FONT_MONO, fontSize: 11.5, ...TNUM }}>{src.versionLabel}</Box>
                      <Box sx={{ fontSize: 11, color: T.dm2, ...TNUM }}>{src.publishedAt ? fmtAt(src.publishedAt) : ''}</Box>
                      <Badge
                        color={newer ? T.ok : T.dm2}
                        bg={newer ? T.okSoft : T.sf2}
                        borderColor={newer ? T.okLine : T.ln}
                        sx={BADGE_SX}
                      >
                        {newer ? 'Newer' : 'Not newer'}
                      </Badge>
                    </>
                  ) : (
                    <Badge color={T.dm2} bg={T.sf2} borderColor={T.ln} sx={BADGE_SX}>Not published</Badge>
                  )}
                </Box>
              );
            })}
            <Box sx={{ fontSize: 11, color: T.dm2, mt: '4px' }}>
              This artifact&apos;s latest version: {s.targetLatestAt ? fmtAt(s.targetLatestAt) : 'none yet'}
            </Box>
          </Box>
        )}
      </Card>

      <Ey sx={{ mb: '8px' }}>Runs{anyActive ? ' — updating live' : ''}</Ey>
      {s.runs.length === 0 ? (
        <Box sx={{ padding: '20px 8px', textAlign: 'center', color: T.dm2, fontSize: 12.5 }}>No runs yet.</Box>
      ) : (
        s.runs.map((r) => <RunCard key={r.id} run={r} />)
      )}
    </>
  );
}

function RunCard({ run: r }: { run: AutoRunRunDto }) {
  const { resolveUser } = useDirectory();
  const by = r.requestedBy ? resolveUser(r.requestedBy) : null;
  return (
    <Card sx={{ padding: '11px 13px', mb: '8px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
        <StatusBadge status={r.status} />
        <Badge color={T.dm} bg={T.sf2} borderColor={T.ln} sx={BADGE_SX}>
          {r.trigger === 'auto' ? 'Auto' : 'Manual'}
        </Badge>
        {r.resultVersionLabel && (
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 11.5, color: T.pr, fontWeight: 600, ...TNUM }}>
            → {r.resultVersionLabel}
          </Box>
        )}
        <Box sx={{ flex: 1 }} />
        <Box sx={{ fontSize: 11, color: T.dm2, ...TNUM }}>{fmtAt(r.queuedAt)}</Box>
      </Box>

      <Box sx={{ fontSize: 11, color: T.dm2, mt: '6px' }}>
        {r.trigger === 'manual'
          ? `Run now by ${by?.name ?? r.requestedBy ?? 'someone'}`
          : r.causeVersionLabel
            ? `Fired by a new published source (${r.causeVersionLabel})`
            : 'Fired by a new published source'}
        {r.finishedAt ? ` · finished ${fmtAt(r.finishedAt)}` : r.startedAt ? ` · started ${fmtAt(r.startedAt)}` : ''}
        {r.attempts > 1 ? ` · ${r.attempts} attempts` : ''}
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px', mt: '7px' }}>
        {r.sources.map((src) => {
          const bad = r.sourceErrors.some((e) => e.nodeId === src.nodeId || e.artifactId === src.artifactId);
          return (
            <Box
              key={src.nodeId}
              title={src.versionRef ?? undefined}
              sx={{
                fontSize: 11, padding: '2px 7px', borderRadius: `${R.xs}px`,
                background: bad ? T.dangerSoft : T.sf2,
                border: `1px solid ${bad ? T.dangerLine : T.ln}`,
                color: bad ? T.danger : T.dm,
              }}
            >
              {bad && <Box component="span" sx={{ mr: '3px' }}>✕</Box>}
              {src.nodeName} <Box component="span" sx={{ fontFamily: FONT_MONO, ...TNUM }}>{src.versionLabel}</Box>
            </Box>
          );
        })}
      </Box>

      {r.status === 'failed' && r.failureKind && (
        <Box sx={{ fontSize: 11, fontWeight: 700, color: T.danger, mt: '8px' }}>
          {r.failureKind === 'source' ? 'Failed because of source data' : 'Failed inside the service'}
        </Box>
      )}
      {r.sourceErrors.length > 0 && (
        <Box
          sx={{
            mt: '6px', padding: '8px 10px', borderRadius: `${R.sm}px`,
            background: T.dangerSoft, border: `1px solid ${T.dangerLine}`,
            display: 'flex', flexDirection: 'column', gap: '5px',
          }}
        >
          {r.sourceErrors.map((e, i) => (
            <Box key={`${e.nodeId ?? e.externalArtifactId ?? ''}-${i}`} sx={{ fontSize: 12, lineHeight: 1.5, color: T.danger }}>
              <Box component="span" sx={{ fontWeight: 700 }}>
                {e.nodeName ?? e.artifactName ?? e.externalArtifactId ?? 'Unknown source'}
                {e.versionLabel ? ` ${e.versionLabel}` : ''}
              </Box>
              {' — '}{e.message}
            </Box>
          ))}
          <Box sx={{ fontSize: 11, color: T.dm2 }}>
            The workflow owner and whoever published these source versions were notified.
          </Box>
        </Box>
      )}

      {r.message && (
        <Box
          sx={{
            fontSize: 12, mt: '8px', lineHeight: 1.55, whiteSpace: 'pre-wrap',
            color: r.status === 'failed' ? T.danger : T.tx2,
          }}
        >
          {r.message}
        </Box>
      )}
    </Card>
  );
}
