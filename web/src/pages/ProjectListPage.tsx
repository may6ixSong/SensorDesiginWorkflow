import { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ProjectDto, UserDto } from '@/types/domain';
import { useProjects, useProjectIps } from '@/api/hooks/useProjects';
import { useUsers } from '@/api/hooks/useUsers';
import { AppShell } from '@/components/layout/AppShell';
import { AcroButton } from '@/components/common/AcroButton';
import { UserAvatar } from '@/components/common/Avatar';
import { Icon } from '@/components/common/Icon';
import { FONT_DISPLAY, FONT_MONO, T } from '@/theme/tokens';

type View = 'grid' | 'list';
const FILTERS = ['전체', '진행중', '보관'] as const;

export function ProjectListPage() {
  const { data: projects } = useProjects();
  const { data: users } = useUsers();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('전체');
  const [view, setView] = useState<View>('grid');

  // 목업 단계 — 프로젝트 카드는 한 개만 노출한다.
  const list = useMemo(() => {
    const one = (projects ?? []).slice(0, 1);
    if (filter === '보관') return [];
    return one.filter((p) => `${p.code} ${p.name}`.toLowerCase().includes(q.trim().toLowerCase()));
  }, [projects, q, filter]);

  return (
    <AppShell users={users ?? []}>
      <Box sx={{ flex: 1, overflow: 'auto', background: T.bg }}>
        <Box sx={{ maxWidth: 1180, mx: 'auto', px: '28px', py: '30px' }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '14px', mb: '22px' }}>
            <Box>
              <Box sx={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 800, letterSpacing: '-.02em' }}>
                프로젝트
              </Box>
              <Box sx={{ fontSize: 12, color: T.dm, mt: '5px' }}>
                담당 중인 CIS 과제와 산출물 보드
              </Box>
            </Box>
            <Box sx={{ flex: 1 }} />
            <AcroButton variant="primary">
              <Icon name="plus" /> 새 프로젝트
            </AcroButton>
          </Box>

          {/* 툴바 */}
          <Box
            sx={{
              display: 'flex', alignItems: 'center', gap: '10px', mb: '18px',
              flexWrap: 'wrap',
            }}
          >
            <Box
              sx={{
                display: 'flex', alignItems: 'center', gap: '7px',
                background: T.sf, border: `1px solid ${T.ln2}`, borderRadius: '8px',
                padding: '0 10px', height: 34, minWidth: 250, boxShadow: T.ss,
                '&:focus-within': { borderColor: T.tl3, boxShadow: `0 0 0 3px ${T.tl2}` },
              }}
            >
              <Box component="span" sx={{ color: T.dm2, display: 'flex' }}>
                <Icon name="search" />
              </Box>
              <Box
                component="input"
                value={q}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
                placeholder="프로젝트 검색"
                sx={{
                  border: 'none', outline: 'none', background: 'transparent',
                  fontFamily: 'inherit', fontSize: 12.5, flex: 1, color: T.tx,
                  '&::placeholder': { color: T.dm2 },
                }}
              />
            </Box>

            <Box sx={{ display: 'flex', gap: '5px' }}>
              {FILTERS.map((f) => (
                <Box
                  key={f}
                  onClick={() => setFilter(f)}
                  sx={{
                    fontSize: 12, padding: '6px 12px', borderRadius: '999px', cursor: 'pointer',
                    border: `1px solid ${filter === f ? T.tl3 : T.ln2}`,
                    background: filter === f ? T.tl2 : T.sf,
                    color: filter === f ? T.tl : T.dm,
                    fontWeight: filter === f ? 600 : 500,
                    '&:hover': { borderColor: T.ln3 },
                  }}
                >
                  {f}
                </Box>
              ))}
            </Box>

            <Box sx={{ flex: 1 }} />

            <Box sx={{ display: 'flex', background: T.sf, border: `1px solid ${T.ln2}`, borderRadius: '8px', overflow: 'hidden', boxShadow: T.ss }}>
              {(['grid', 'list'] as View[]).map((v) => (
                <Box
                  key={v}
                  onClick={() => setView(v)}
                  sx={{
                    width: 34, height: 32, display: 'grid', placeItems: 'center', cursor: 'pointer',
                    background: view === v ? T.sf3 : 'transparent',
                    color: view === v ? T.tx : T.dm2,
                    '&:hover': { background: T.sf2 },
                  }}
                >
                  <Icon name={v === 'grid' ? 'grid' : 'list'} />
                </Box>
              ))}
            </Box>
          </Box>

          {list.length === 0 ? (
            <Box
              sx={{
                border: `1px dashed ${T.ln2}`, borderRadius: '14px', background: T.sf,
                padding: '58px 20px', textAlign: 'center',
              }}
            >
              <Box sx={{ fontSize: 14, fontWeight: 600, mb: '6px' }}>조건에 맞는 프로젝트가 없습니다</Box>
              <Box sx={{ fontSize: 12, color: T.dm }}>검색어나 필터를 바꿔보세요.</Box>
            </Box>
          ) : (
            <Box
              sx={
                view === 'grid'
                  ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: '16px' }
                  : { display: 'flex', flexDirection: 'column', gap: '10px' }
              }
            >
              {list.map((p) => (
                <ProjectCard key={p._id} project={p} view={view} />
              ))}
              <Box
                sx={{
                  border: `1px dashed ${T.ln2}`, borderRadius: '14px', cursor: 'pointer',
                  display: 'flex', flexDirection: view === 'grid' ? 'column' : 'row',
                  alignItems: 'center', justifyContent: 'center',
                  minHeight: view === 'grid' ? 190 : 62,
                  color: T.dm2, fontSize: 12.5, gap: '7px',
                  transition: 'border-color .16s, color .16s, background .16s',
                  '&:hover': { borderColor: T.tl3, color: T.tl, background: T.tl2 },
                }}
              >
                <Icon name="plus" size={18} />
                새 프로젝트 만들기
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </AppShell>
  );
}

/** 오늘 날짜가 phases 구간의 어디쯤인지 → 진행률(%)과 현재 Phase */
function progressOf(p: ProjectDto) {
  const ph = [...p.phases].sort((a, b) => a.order - b.order);
  if (!ph.length) return { pct: 0, current: null as null | string, done: 0, total: 0 };
  const now = Date.now();
  const done = ph.filter((x) => new Date(x.end).getTime() < now).length;
  const current = ph.find((x) => new Date(x.start).getTime() <= now && now <= new Date(x.end).getTime());
  const s = new Date(ph[0].start).getTime();
  const e = new Date(ph[ph.length - 1].end).getTime();
  const pct = Math.round((Math.min(1, Math.max(0, (now - s) / (e - s || 1)))) * 100);
  return { pct, current: current?.key ?? (done >= ph.length ? '완료' : ph[0].key), done, total: ph.length };
}

function ProjectCard({ project, view }: { project: ProjectDto; view: View }) {
  const navigate = useNavigate();
  const { data: ips } = useProjectIps(project._id);
  const { pct, current, done, total } = progressOf(project);
  const owners = useMemo(() => {
    const seen = new Map<string, UserDto>();
    (ips ?? []).flatMap((i) => i.owners).forEach((u) => seen.set(u.id, u));
    return [...seen.values()];
  }, [ips]);

  const row = view === 'list';

  return (
    <Box
      onClick={() => navigate(`/details/${project._id}`)}
      sx={{
        position: 'relative', cursor: 'pointer', background: T.sf,
        border: `1px solid ${T.ln}`, borderRadius: '14px', overflow: 'hidden',
        boxShadow: T.ss, transition: 'transform .18s cubic-bezier(.2,.8,.3,1), box-shadow .18s, border-color .18s',
        padding: row ? '14px 18px' : '18px 18px 16px',
        display: row ? 'flex' : 'block',
        alignItems: row ? 'center' : undefined,
        gap: row ? '18px' : undefined,
        '&:hover': { transform: 'translateY(-3px)', boxShadow: T.sl, borderColor: T.ln2 },
        '&::before': {
          content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
          background: `linear-gradient(180deg, ${T.tl}, ${T.vi})`,
        },
      }}
    >
      <Box sx={{ flex: row ? '0 0 260px' : undefined }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', mb: '8px' }}>
          <Box
            component="span"
            sx={{
              fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '.1em', padding: '2px 7px',
              borderRadius: '6px', background: T.sf3, color: T.dm, border: `1px solid ${T.ln}`,
            }}
          >
            {project.code}
          </Box>
          <Box
            component="span"
            sx={{
              fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.1em', padding: '2px 7px',
              borderRadius: '999px', background: T.tl2, color: T.tl, border: `1px solid ${T.tl3}`,
            }}
          >
            {project.status}
          </Box>
        </Box>
        <Box sx={{ fontSize: row ? 15 : 17, fontWeight: 700, letterSpacing: '-.015em', lineHeight: 1.3 }}>
          {project.name}
        </Box>
        <Box sx={{ fontSize: 11.5, color: T.dm, mt: '4px' }}>
          {project.domain} · IP {ips?.length ?? 0}개
        </Box>
      </Box>

      <Box sx={{ flex: row ? 1 : undefined, mt: row ? 0 : '16px' }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '6px', mb: '6px' }}>
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '.08em', color: T.dm2 }}>
            {current}
          </Box>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, color: T.tl }}>{pct}%</Box>
          <Box sx={{ fontSize: 10, color: T.dm2 }}>
            {done}/{total} 구간
          </Box>
        </Box>
        <Box sx={{ height: 6, borderRadius: 999, background: T.sf3, overflow: 'hidden' }}>
          <Box
            sx={{
              width: `${pct}%`, height: '100%', borderRadius: 999,
              background: `linear-gradient(90deg, ${T.tl}, ${T.vi})`,
              transition: 'width .5s cubic-bezier(.2,.8,.3,1)',
            }}
          />
        </Box>

        {!row && (
          <Box sx={{ display: 'flex', gap: '5px', flexWrap: 'wrap', mt: '13px' }}>
            {(ips ?? []).map((i) => (
              <Box
                key={i.id}
                sx={{
                  fontSize: 10.5, padding: '2px 8px', borderRadius: '999px',
                  background: T.sf2, border: `1px solid ${T.ln}`, color: T.dm,
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                }}
              >
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: i.color || T.ln3 }} />
                {i.name}
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: '10px',
          mt: row ? 0 : '15px', pt: row ? 0 : '13px',
          borderTop: row ? 'none' : `1px solid ${T.ln}`,
          flex: row ? '0 0 auto' : undefined,
        }}
      >
        <Box sx={{ display: 'flex' }}>
          {owners.slice(0, 4).map((u, i) => (
            <Box key={u.id} sx={{ ml: i ? '-7px' : 0, borderRadius: '8px', border: `2px solid ${T.sf}`, display: 'flex' }}>
              <UserAvatar user={u} size={24} />
            </Box>
          ))}
          {owners.length > 4 && (
            <Box
              sx={{
                ml: '-7px', width: 24, height: 24, borderRadius: '7px', border: `2px solid ${T.sf}`,
                background: T.sf3, color: T.dm, fontSize: 9.5, fontWeight: 700,
                display: 'grid', placeItems: 'center',
              }}
            >
              +{owners.length - 4}
            </Box>
          )}
        </Box>
        <Box sx={{ flex: 1 }} />
        <Box
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontSize: 11.5, fontWeight: 600, color: T.tl,
          }}
        >
          보드 열기 <Icon name="expand" />
        </Box>
      </Box>
    </Box>
  );
}
