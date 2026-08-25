import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Dialog } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { DeliverableDto, DeliverablesListResponse, IpDto, PhaseRef } from '@/types/domain';
import { DocIcon, Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';
import {
  buildDomainModel, statusOf, withAlpha,
  DomainFlow, DomainGroup, DomainWorkflowModel, UNASSIGNED_DOMAIN,
} from '@/lib/domainWorkflow';
import { SpaceBackdrop, SpacePalette, useSpacePalette } from './spaceBackdrop';

/* ──────────────────────────────────────────────────────────────────────────
 * Total workflow view — 과제의 모든 IP를 도메인별 영역으로 나눠 한 화면에서 보는
 * 대시보드. IP가 많아지면 한 판에 다 담기 어렵다는 문제를, 화면을 위→아래로
 * 스크롤되는 도메인 섹션(Analog / Digital / APS…)으로 쪼개는 방식으로 푼다.
 *
 *   Domain 섹션 = 구분선으로 나뉜 영역, 그 안에 도메인 소속 IP가 행(lane)으로.
 *   각 행은 Phase를 열로 두고 실제 산출물 블록을 그 Phase 칸에 쌓아 보여준다
 *   (Milestones 보드의 진행률 막대를 실제 블록으로 확장한 것).
 *   IP↔IP 산출물 흐름(recvIpId)은 같은 도메인 안에서만 오른쪽 거터에 곡선으로 잇는다.
 *   도메인이 다른 handoff는 이 화면의 관심사가 아니라서 아예 그리지 않는다(요청).
 *
 * 좌측 SECTORS 메뉴를 클릭하면 그 도메인 섹션으로 스크롤 이동한다.
 * ────────────────────────────────────────────────────────────────────────── */

const NAV_W = 220;
const LABEL_W = 210;
const GUTTER_W = 56;
const PHASE_W = 168;
const PHASE_HEAD_H = 52;
const CHIP_H = 28;
const CHIP_GAP = 5;
const ROW_PAD_V = 9;
const MAX_VISIBLE_CHIPS = 3;
const TOPBAR_H = 60;

const STATUS_COLOR = {
  released: T.tl,
  inProgress: T.am,
  notSubmitted: T.dm2,
} as const;

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  projectCode: string;
  phases: PhaseRef[];
  ips: IpDto[];
  /** 과제에 등록된 도메인 목록 — IP가 아직 배정되지 않은 도메인도 빈 섹션으로 그린다. */
  ipDomains: string[];
}

export function DomainWorkflowDialog(props: Props) {
  const pal = useSpacePalette();
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      fullScreen
      PaperProps={{ sx: { background: pal.wash, overflow: 'hidden' } }}
    >
      <style>{`
        @keyframes wf-twinkle { 0%,100% { opacity:.3 } 50% { opacity:1 } }
        @media (prefers-reduced-motion: reduce) { .wf-twinkle { animation: none !important; } }
      `}</style>
      {props.open && <WorkflowBoard {...props} />}
    </Dialog>
  );
}

/* ══════════════════════════════════════════════════════════════ Board ═══ */

/** easeInOutCubic — 시작·끝을 부드럽게 눌러주는 "카메라" 이징. */
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function WorkflowBoard({
  onClose, projectId, projectName, projectCode, phases, ips, ipDomains,
}: Props) {
  const navigate = useNavigate();
  const pal = useSpacePalette();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef(new Map<string, HTMLDivElement>());
  const scrollAnimRef = useRef<number | null>(null);
  const [activeDomain, setActiveDomain] = useState<string | null>(null);

  const sortedPhases = useMemo(() => [...phases].sort((a, b) => a.order - b.order), [phases]);

  /* 모든 IP의 산출물을 한 번에 — 캐시 키는 IP 보드와 같아 이미 열어본 IP는 즉시 뜬다. */
  const results = useQueries({
    queries: ips.map((ip) => ({
      queryKey: queryKeys.deliverables(ip.id),
      staleTime: 15_000,
      queryFn: async () => {
        const res = await apiClient.get<DeliverablesListResponse>(`/ips/${ip.id}/deliverables`);
        return res.data;
      },
    })),
  });
  const sig = results.map((r) => `${r.status}:${r.dataUpdatedAt}`).join('|');
  const { byIp, loading } = useMemo(() => {
    const m = new Map<string, DeliverableDto[]>();
    let anyLoading = false;
    ips.forEach((ip, i) => {
      const data = results[i]?.data;
      m.set(ip.id, data?.data ?? []);
      if (!data) anyLoading = true;
    });
    return { byIp: m, loading: anyLoading };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ips, sig]);

  // ipDomains는 배열 참조가 매 렌더 바뀔 수 있어 문자열로 눌러 의존성에 넣는다.
  const domainSig = ipDomains.join('|');
  const model: DomainWorkflowModel = useMemo(
    () => buildDomainModel(ips, byIp, ipDomains),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ips, byIp, domainSig],
  );
  const totalRoutes = useMemo(
    () => [...model.flowsByDomain.values()].reduce((n, arr) => n + arr.length, 0),
    [model],
  );

  /**
   * 도메인 전환 — 브라우저 기본 smooth-scroll 대신 직접 이징을 건다. 거리에 비례해
   * 지속시간을 늘려("멀수록 천천히 흘러가는") 카메라가 도메인 사이를 미끄러져
   * 이동하는 느낌을 준다. 수동 스크롤(트랙패드/휠)은 건드리지 않는다 — 그건 즉각
   * 반응해야 하니 네이티브 그대로 둔다.
   */
  const scrollToDomain = useCallback((key: string) => {
    const el = sectionRefs.current.get(key);
    const container = scrollRef.current;
    if (!el || !container) return;
    const targetTop = Math.max(
      0,
      el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 14,
    );
    const startTop = container.scrollTop;
    const delta = targetTop - startTop;
    if (Math.abs(delta) < 1) return;

    if (scrollAnimRef.current !== null) cancelAnimationFrame(scrollAnimRef.current);
    const duration = Math.min(1100, Math.max(480, Math.abs(delta) * 0.55));
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      container.scrollTop = startTop + delta * easeInOutCubic(p);
      scrollAnimRef.current = p < 1 ? requestAnimationFrame(tick) : null;
    };
    scrollAnimRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => () => {
    if (scrollAnimRef.current !== null) cancelAnimationFrame(scrollAnimRef.current);
  }, []);

  /* 스크롤스파이 — 지금 화면 상단 근처에 걸린 섹션을 좌측 메뉴에서 강조한다. */
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (!visible.length) return;
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const key = (visible[0].target as HTMLElement).dataset.domainKey;
        if (key) setActiveDomain(key);
      },
      { root: container, rootMargin: '-8% 0px -75% 0px', threshold: 0 },
    );
    sectionRefs.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [model.domains.length]);

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <SpaceBackdrop scrollRef={scrollRef} />

      <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TopBar
          projectName={projectName}
          projectCode={projectCode}
          model={model}
          totalRoutes={totalRoutes}
          loading={loading}
          pal={pal}
          onClose={onClose}
        />

        <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <DomainNav domains={model.domains} active={activeDomain} pal={pal} onPick={scrollToDomain} />

          <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            <Box sx={{ maxWidth: 1520, mx: 'auto', px: '28px', py: '26px' }}>
              {model.domains.map((d) => (
                <DomainSection
                  key={d.key}
                  domain={d}
                  phases={sortedPhases}
                  deliverablesByIp={byIp}
                  flows={model.flowsByDomain.get(d.key) ?? []}
                  registerRef={(el) => {
                    if (el) sectionRefs.current.set(d.key, el);
                    else sectionRefs.current.delete(d.key);
                  }}
                  onOpenIp={(ipId) => { onClose(); navigate(`/details/${projectId}/${ipId}`); }}
                />
              ))}

              {!model.domains.length && (
                <Box sx={{ padding: '60px 0', textAlign: 'center', color: T.dm2, fontSize: 13 }}>
                  이 과제에서 볼 수 있는 IP가 없습니다.
                </Box>
              )}

              {/* 마지막 도메인이 짧으면 컨테이너 바닥까지 채울 콘텐츠가 없어 그 섹션을
                  맨 위까지 스크롤할 수 없다 — 그러면 좌측 메뉴 클릭이 눈에 보이는
                  이동으로 이어지지 않는다. 뷰포트 높이만큼 여유 공간을 깔아 항상
                  끝까지 스크롤되게 한다. */}
              {model.domains.length > 0 && <Box sx={{ height: 'calc(100vh - 260px)' }} />}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/* ══════════════════════════════════════════════════════════════ Chrome ═══ */

function TopBar({
  projectName, projectCode, model, totalRoutes, loading, pal, onClose,
}: {
  projectName: string; projectCode: string; model: DomainWorkflowModel;
  totalRoutes: number; loading: boolean; pal: SpacePalette; onClose: () => void;
}) {
  return (
    <Box
      sx={{
        flex: `0 0 ${TOPBAR_H}px`, display: 'flex', alignItems: 'center', gap: '16px',
        padding: '0 18px', borderBottom: `1px solid ${pal.panelBorder}`,
        background: pal.panelBg, backdropFilter: 'blur(14px)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
        <Icon name="grid" size={17} />
        <Box>
          <Box sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em', lineHeight: 1.2 }}>
            Total Workflow
          </Box>
          <Box sx={{ fontSize: 10.5, color: T.dm2, fontFamily: FONT_MONO }}>{projectCode} · {projectName}</Box>
        </Box>
      </Box>

      <Box sx={{ flex: 1 }} />

      {loading && (
        <Box sx={{ fontSize: 11, color: T.dm2, fontFamily: FONT_MONO }}>loading…</Box>
      )}

      <Box sx={{ display: 'flex', gap: '20px', mr: '6px' }}>
        <Stat label="DOMAINS" value={model.domains.length} />
        <Stat label="IPS" value={model.domains.reduce((n, d) => n + d.ips.length, 0)} />
        <Stat label="ROUTES" value={totalRoutes} />
        <Stat label="RELEASED" value={`${model.counts.released}/${model.counts.total}`} tone={T.tl} />
      </Box>

      <Box
        component="button"
        onClick={onClose}
        title="Close"
        sx={{
          display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: '8px',
          border: `1px solid ${T.ln2}`, background: 'transparent', color: T.tx, cursor: CURSOR_POINTER,
          '&:hover': { background: T.sf3 },
        }}
      >
        <Icon name="x" size={14} />
      </Box>
    </Box>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <Box sx={{ textAlign: 'right' }}>
      <Box sx={{ fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: '.14em', color: T.dm2 }}>{label}</Box>
      <Box sx={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: tone ?? T.tx }}>{value}</Box>
    </Box>
  );
}

function DomainNav({
  domains, active, pal, onPick,
}: { domains: DomainGroup[]; active: string | null; pal: SpacePalette; onPick: (key: string) => void }) {
  return (
    <Box
      sx={{
        flex: `0 0 ${NAV_W}px`, borderRight: `1px solid ${pal.panelBorder}`,
        background: pal.panelBg, backdropFilter: 'blur(14px)',
        overflowY: 'auto', padding: '14px 10px',
      }}
    >
      <Box sx={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.16em', color: T.dm2, px: '4px', mb: '8px' }}>
        SECTORS · DOMAIN
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {domains.map((d) => {
          const pct = d.counts.total ? Math.round((d.counts.released / d.counts.total) * 100) : 0;
          const on = active === d.key;
          const label = d.key === UNASSIGNED_DOMAIN ? 'Unassigned' : d.key;
          return (
            <Box
              key={d.key}
              component="button"
              onClick={() => onPick(d.key)}
              sx={{
                textAlign: 'left', width: '100%', border: '1px solid', borderRadius: '9px',
                padding: '8px 10px', cursor: CURSOR_POINTER, fontFamily: 'inherit', transition: '.14s',
                borderColor: on ? withAlpha(d.color, 0.55) : 'transparent',
                background: on ? withAlpha(d.color, 0.12) : 'transparent',
                '&:hover': { background: on ? withAlpha(d.color, 0.16) : T.sf3 },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flex: '0 0 auto' }} />
                <Box
                  sx={{
                    fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 700, color: on ? T.tx : T.dm,
                    letterSpacing: '.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </Box>
              </Box>
              <Box sx={{ fontSize: 9.5, color: T.dm2, mt: '3px', ml: '16px' }}>
                {d.ips.length} IP · {d.counts.released}/{d.counts.total} released
              </Box>
              <Box sx={{ height: 3, borderRadius: 999, background: T.sf3, mt: '5px', ml: '16px', overflow: 'hidden' }}>
                <Box sx={{ width: `${pct}%`, height: '100%', background: d.color, transition: 'width .3s' }} />
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box sx={{ mt: '14px', pt: '10px', borderTop: `1px solid ${T.ln}`, display: 'flex', flexDirection: 'column', gap: '6px', px: '4px' }}>
        {(['released', 'inProgress', 'notSubmitted'] as const).map((k) => (
          <Box key={k} sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 10.5, color: T.dm }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '3px', background: STATUS_COLOR[k] }} />
            {k === 'released' ? 'Released' : k === 'inProgress' ? 'In progress' : 'Not submitted'}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════ Section ═══ */

function DomainSection({
  domain, phases, deliverablesByIp, flows, registerRef, onOpenIp,
}: {
  domain: DomainGroup; phases: PhaseRef[]; deliverablesByIp: Map<string, DeliverableDto[]>;
  flows: DomainFlow[]; registerRef: (el: HTMLDivElement | null) => void; onOpenIp: (ipId: string) => void;
}) {
  const label = domain.key === UNASSIGNED_DOMAIN ? 'Unassigned' : domain.label;

  /** ip.id → phaseKey → 그 칸의 산출물들. */
  const byIpPhase = useMemo(() => {
    const m = new Map<string, Map<string, DeliverableDto[]>>();
    domain.ips.forEach((ip) => {
      const perPhase = new Map<string, DeliverableDto[]>();
      (deliverablesByIp.get(ip.id) ?? []).forEach((d) => {
        const arr = perPhase.get(d.phaseKey) ?? [];
        arr.push(d);
        perPhase.set(d.phaseKey, arr);
      });
      m.set(ip.id, perPhase);
    });
    return m;
  }, [domain.ips, deliverablesByIp]);

  const maxStack = useMemo(() => {
    let m = 0;
    byIpPhase.forEach((perPhase) => perPhase.forEach((items) => { m = Math.max(m, items.length); }));
    return m;
  }, [byIpPhase]);

  const slots = Math.max(1, Math.min(maxStack, MAX_VISIBLE_CHIPS) + (maxStack > MAX_VISIBLE_CHIPS ? 1 : 0));
  const rowH = Math.max(58, ROW_PAD_V * 2 + slots * CHIP_H + (slots - 1) * CHIP_GAP);
  const rowIndex = useMemo(() => new Map(domain.ips.map((ip, i) => [ip.id, i])), [domain.ips]);
  const gridH = PHASE_HEAD_H + domain.ips.length * rowH;
  const now = Date.now();

  return (
    <Box ref={registerRef} data-domain-key={domain.key} sx={{ mb: '46px', scrollMarginTop: '8px' }}>
      {/* ── 구분선 헤더 — "─── Analog ───" 스케치 그대로 ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '14px', mb: '14px' }}>
        <Box sx={{ flex: 1, height: '1px', background: `linear-gradient(90deg, transparent, ${withAlpha(domain.color, 0.55)})` }} />
        <Box
          sx={{
            display: 'flex', alignItems: 'center', gap: '9px', padding: '6px 16px',
            borderRadius: '999px', border: `1.5px solid ${withAlpha(domain.color, 0.5)}`,
            background: withAlpha(domain.color, 0.09),
          }}
        >
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: domain.color }} />
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 15, fontWeight: 700, letterSpacing: '.1em', color: T.tx }}>
            {label}
          </Box>
          <Box sx={{ fontSize: 10.5, color: T.dm2, fontFamily: FONT_MONO }}>
            {domain.ips.length} IP · {domain.counts.released}/{domain.counts.total} released
          </Box>
        </Box>
        <Box sx={{ flex: 1, height: '1px', background: `linear-gradient(90deg, ${withAlpha(domain.color, 0.55)}, transparent)` }} />
      </Box>

      {/* ── IP가 아직 없는 도메인 ──
          그리드를 그리지 않는다. 행이 0개면 거터 셀의 gridRow가 'span 0'이 되는데
          그건 유효한 CSS가 아니라 그리드 배치가 깨진다. 애초에 보여줄 행도 없다. */}
      {domain.ips.length === 0 ? (
        <Box
          sx={{
            border: `1px dashed ${withAlpha(domain.color, 0.4)}`, borderRadius: '12px',
            background: withAlpha(domain.color, 0.04), padding: '22px 18px',
            fontSize: 12.5, color: T.dm2, textAlign: 'center',
          }}
        >
          No IPs assigned to this domain yet — set it on Project Information › Design domains.
        </Box>
      ) : (
      <Box
        sx={{
          border: `1px solid ${T.ln}`, borderRadius: '12px', background: T.sf, overflow: 'hidden', boxShadow: T.ss,
        }}
      >
        <Box sx={{ overflowX: 'auto' }}>
          <Box
            sx={{
              position: 'relative', display: 'grid', minWidth: 'max-content',
              gridTemplateColumns: `${LABEL_W}px ${GUTTER_W}px repeat(${phases.length}, ${PHASE_W}px)`,
            }}
          >
            {/* corner */}
            <Box
              sx={{
                position: 'sticky', left: 0, zIndex: 3, background: T.sf2, borderBottom: `1px solid ${T.ln}`,
                borderRight: `1px solid ${T.ln}`, display: 'flex', alignItems: 'center', padding: '0 14px',
                fontSize: 9.5, fontFamily: FONT_MONO, letterSpacing: '.07em', color: T.dm2,
                gridColumn: 1, gridRow: 1, height: PHASE_HEAD_H,
              }}
            >
              IP \ PHASE
            </Box>

            {/* gutter header (빈 칸 — 실제 거터는 아래 spanning cell) */}
            <Box
              sx={{
                position: 'sticky', left: LABEL_W, zIndex: 3, background: T.sf2, borderBottom: `1px solid ${T.ln}`,
                gridColumn: 2, gridRow: 1, height: PHASE_HEAD_H,
              }}
            />

            {/* phase headers */}
            {phases.map((p, i) => {
              const st = new Date(p.start).getTime();
              const en = new Date(p.end).getTime();
              const cur = now >= st && now <= en;
              const past = now > en;
              return (
                <Box
                  key={p.key}
                  sx={{
                    gridColumn: 3 + i, gridRow: 1, height: PHASE_HEAD_H,
                    borderBottom: `1px solid ${T.ln}`, borderLeft: `1px solid ${T.ln}`,
                    background: cur ? T.tl2 : T.sf2, padding: '6px 10px', display: 'flex',
                    flexDirection: 'column', justifyContent: 'center',
                    ...(cur ? { boxShadow: `inset 0 2px 0 ${T.tl}` } : {}),
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Box sx={{ fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 700, color: cur ? T.tl : past ? T.dm : T.tx }}>
                      {p.key}
                    </Box>
                    {cur && (
                      <Box
                        component="span"
                        sx={{
                          fontSize: 7.5, fontFamily: FONT_MONO, color: '#fff', background: T.tl,
                          borderRadius: '999px', padding: '1px 5px', fontWeight: 700, letterSpacing: '.04em',
                        }}
                      >
                        NOW
                      </Box>
                    )}
                  </Box>
                  <Box sx={{ fontSize: 9, color: T.dm2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.label}
                  </Box>
                </Box>
              );
            })}

            {/* IP 행 */}
            {domain.ips.map((ip, r) => (
              <IpLane
                key={ip.id}
                ip={ip}
                rowIdx={r}
                phases={phases}
                byPhase={byIpPhase.get(ip.id) ?? new Map()}
                onOpen={() => onOpenIp(ip.id)}
              />
            ))}

            {/* 거터 — IP↔IP 흐름 곡선. 라벨 열 바로 뒤에 고정(sticky)돼 있어 가로
                스크롤을 해도 항상 보인다. */}
            <Box
              sx={{
                position: 'sticky', left: LABEL_W, zIndex: 2, gridColumn: 2, gridRow: `2 / span ${domain.ips.length}`,
                background: T.sf, borderRight: `1px solid ${T.ln}`, borderBottom: `1px solid ${T.ln}`,
              }}
            >
              <FlowGutter flows={flows} rowIndex={rowIndex} ips={domain.ips} rowH={rowH} height={gridH - PHASE_HEAD_H} />
            </Box>
          </Box>
        </Box>
      </Box>
      )}
    </Box>
  );
}

function IpLane({
  ip, rowIdx, phases, byPhase, onOpen,
}: {
  ip: IpDto; rowIdx: number; phases: PhaseRef[];
  byPhase: Map<string, DeliverableDto[]>; onOpen: () => void;
}) {
  return (
    <>
      <Box
        component="button"
        onClick={onOpen}
        title={`${ip.name} — open board`}
        sx={{
          position: 'sticky', left: 0, zIndex: 1, gridColumn: 1, gridRow: rowIdx + 2,
          background: T.sf, borderRight: `1px solid ${T.ln}`, borderBottom: `1px solid ${T.ln}`,
          borderLeft: `3px solid ${ip.color || T.tl}`, display: 'flex', alignItems: 'center',
          padding: '0 14px 0 12px', textAlign: 'left', cursor: CURSOR_POINTER, fontFamily: 'inherit',
          '&:hover': { background: T.sf2 },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ fontSize: 12.5, fontWeight: 700, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ip.name}
          </Box>
          <Box sx={{ fontSize: 10, color: T.dm2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ip.description || '—'}
          </Box>
        </Box>
      </Box>

      {phases.map((p, i) => (
        <PhaseCell
          key={p.key}
          items={byPhase.get(p.key) ?? []}
          gridColumn={3 + i}
          gridRow={rowIdx + 2}
        />
      ))}
    </>
  );
}

function PhaseCell({ items, gridColumn, gridRow }: { items: DeliverableDto[]; gridColumn: number; gridRow: number }) {
  const visible = items.slice(0, MAX_VISIBLE_CHIPS);
  const overflow = items.length - visible.length;

  return (
    <Box
      sx={{
        gridColumn, gridRow, borderLeft: `1px solid ${T.ln}`, borderBottom: `1px solid ${T.ln}`,
        padding: `${ROW_PAD_V}px 8px`, display: 'flex', flexDirection: 'column',
        gap: `${CHIP_GAP}px`, justifyContent: items.length ? 'flex-start' : 'center',
      }}
    >
      {!items.length && (
        <Box sx={{ height: 5, borderRadius: 999, border: `1px dashed ${T.ln2}`, mx: '2px' }} />
      )}
      {visible.map((d) => {
        const st = statusOf(d);
        const color = STATUS_COLOR[st];
        return (
          <Box
            key={d.id}
            title={`${d.name}\n${st === 'released' ? 'Released' : st === 'inProgress' ? 'In progress' : 'Not submitted'}`}
            sx={{
              height: CHIP_H, borderRadius: '7px', border: `1px solid ${T.ln2}`, background: T.sf2,
              display: 'flex', alignItems: 'center', gap: '6px', padding: '0 7px 0 0', overflow: 'hidden',
              cursor: 'default',
            }}
          >
            <Box sx={{ alignSelf: 'stretch', width: 3, background: color, flex: '0 0 auto' }} />
            <Box sx={{ color: T.dm, flex: '0 0 auto', display: 'flex' }}>
              <DocIcon type={d.docType} size={11} />
            </Box>
            <Box
              sx={{
                fontSize: 10.5, color: T.tx, flex: 1, minWidth: 0, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {d.name}
            </Box>
          </Box>
        );
      })}
      {overflow > 0 && (
        <Box sx={{ fontSize: 9.5, color: T.dm2, fontFamily: FONT_MONO, textAlign: 'center' }}>
          +{overflow} more
        </Box>
      )}
    </Box>
  );
}

/* ══════════════════════════════════════════════════════════════ Gutter ═══ */

/** 같은 도메인 안의 IP→IP 흐름을 오른쪽 거터에 곡선으로 잇는다 — 분석적으로 계산되는
 * 좌표라 DOM 측정 없이 그린다(행 높이가 도메인마다 고정값이라 가능하다). */
function FlowGutter({
  flows, rowIndex, ips, rowH, height,
}: { flows: DomainFlow[]; rowIndex: Map<string, number>; ips: IpDto[]; rowH: number; height: number }) {
  if (!flows.length) return <svg width={GUTTER_W} height={height} />;

  const byId = new Map(ips.map((ip) => [ip.id, ip]));
  const yOf = (idx: number) => idx * rowH + rowH / 2;

  return (
    <svg width={GUTTER_W} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <marker id="wf-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={T.dm} />
        </marker>
      </defs>
      {flows.map((f) => {
        const fromIp = byId.get(f.from);
        const fromIdx = rowIndex.get(f.from);
        const toIdx = rowIndex.get(f.to);
        if (fromIdx === undefined || toIdx === undefined || !fromIp) return null;
        const y0 = yOf(fromIdx);
        const y1 = yOf(toIdx);
        const dir = fromIdx < toIdx ? 0 : 8;
        const bulge = Math.min(GUTTER_W - 8, 14 + Math.abs(toIdx - fromIdx) * 11 + dir);
        const color = fromIp.color || T.tl;
        const width = Math.min(4, 1.3 + f.total * 0.5);
        const title = `${f.total} deliverable${f.total > 1 ? 's' : ''} (${f.released} released)\n${f.names.slice(0, 4).join(', ')}${f.names.length > 4 ? '…' : ''}`;
        return (
          <path
            key={f.id}
            d={`M2,${y0} C${bulge},${y0} ${bulge},${y1} 2,${y1}`}
            fill="none"
            stroke={color}
            strokeWidth={width}
            strokeLinecap="round"
            opacity={0.72}
            markerEnd="url(#wf-arrow)"
          >
            <title>{title}</title>
          </path>
        );
      })}
    </svg>
  );
}
