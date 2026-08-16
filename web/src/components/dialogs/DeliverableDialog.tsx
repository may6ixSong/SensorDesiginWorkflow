import { useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { PhaseRef, UserDto } from '@/types/domain';
import { CanvasNode, VersionView, fmtAt, hasW, latA, latR, stOf, vstr } from '@/lib/canvasModel';
import { useCanvasStore } from '@/store/canvasStore';
import { toast } from '@/store/toastStore';
import { DEPARTMENTS, RECEIVABLE_DEPARTMENTS, departmentName } from '@/shared/constants/departments';
import { ModalShell } from '@/components/common/ModalShell';
import { AcroButton, Badge, Chip } from '@/components/common/AcroButton';
import { Card, Ey, Field, Row, SelectInput, TextInput } from '@/components/common/Panel';
import { DocIcon, Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { FONT_MONO, T } from '@/theme/tokens';

interface Props {
  node: CanvasNode | null;
  phases: PhaseRef[];
  usersById: Map<string, UserDto>;
  users: UserDto[];
  /** 목업 own = isOwn(ip) && !S.recv */
  own: boolean;
  onClose: () => void;
  onSaveInfo: (p: { name: string; net: 'OA' | 'HPC'; type: string; phaseKeys: string[] }) => void;
  onUpload: (p: { file: string; note: string; net: 'OA' | 'HPC'; type: string }) => void;
  onRelease: () => void;
  onSaveRecv: (p: { recvDept: string | null; recvContact: string | null }) => void;
  onAddLink: (toId: string) => void;
  onUnlink: (edgeId: string) => void;
}

/** 목업 renderModal()의 산출물 상세 — 개요 / 버전 이력 / 전달 3탭 */
export function DeliverableDialog({
  node: d, phases, usersById, users, own, onClose,
  onSaveInfo, onUpload, onRelease, onSaveRecv, onAddLink, onUnlink,
}: Props) {
  const tab = useCanvasStore((s) => s.tab);
  const setTab = useCanvasStore((s) => s.setTab);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  if (!d) return null;
  const ph = phases.find((p) => p.key === d.phase);
  const st = stOf(d);

  return (
    <ModalShell
      open
      onClose={onClose}
      width={640}
      header={
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <Box component="span" sx={{ color: d.net === 'HPC' ? T.hp : T.bl, mt: '4px' }}>
            <DocIcon type={d.type} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Ey>{ph ? `${ph.key} · ${ph.label}` : ''}</Ey>
            <Box sx={{ fontSize: 18, fontWeight: 700, mt: '3px' }}>{d.name}</Box>
          </Box>
          <Badge color={st.c} bg={st.bg} borderColor={st.bd} sx={{ mt: '6px' }}>{st.lb}</Badge>
          <Badge
            color={d.net === 'HPC' ? T.hp : T.dm}
            bg={d.net === 'HPC' ? T.hp2 : T.sf2}
            borderColor={d.net === 'HPC' ? T.hp3 : T.ln}
            sx={{ mt: '6px' }}
          >
            {d.net}망
          </Badge>
        </Box>
      }
      belowHeader={
        <Box sx={{ display: 'flex', gap: '2px', mt: '11px', borderBottom: `1px solid ${T.ln}` }}>
          {([['overview', '개요'], ['versions', '버전 이력'], ['recv', '전달']] as const).map(([k, l]) => (
            <Box
              key={k}
              component="button"
              onClick={() => setTab(k)}
              sx={{
                padding: '8px 13px', fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit',
                color: tab === k ? T.tl : T.dm, background: 'none', border: 'none',
                borderBottom: `2px solid ${tab === k ? T.tl : 'transparent'}`,
                mb: '-1px', cursor: 'pointer',
              }}
            >
              {l}
            </Box>
          ))}
        </Box>
      }
    >
      {tab === 'overview' && (
        <OverviewTab
          d={d} phases={phases} own={own} nodes={nodes} edges={edges}
          onSaveInfo={onSaveInfo} onUpload={onUpload} onRelease={onRelease}
          onAddLink={onAddLink} onUnlink={onUnlink}
        />
      )}
      {tab === 'versions' && <VersionsTab d={d} usersById={usersById} />}
      {tab === 'recv' && <RecvTab d={d} own={own} users={users} usersById={usersById} onSave={onSaveRecv} />}
    </ModalShell>
  );
}

/* ── 개요 탭 ── */
function OverviewTab({
  d, phases, own, nodes, edges, onSaveInfo, onUpload, onRelease, onAddLink, onUnlink,
}: {
  d: CanvasNode; phases: PhaseRef[]; own: boolean;
  nodes: CanvasNode[]; edges: ReturnType<typeof useCanvasStore.getState>['edges'];
  onSaveInfo: Props['onSaveInfo']; onUpload: Props['onUpload'];
  onRelease: Props['onRelease']; onAddLink: Props['onAddLink']; onUnlink: Props['onUnlink'];
}) {
  const rel = latR(d);
  const work = hasW(d) ? latA(d) : null;
  const cur = own ? latA(d)?.file : rel?.file;

  const sid = d.series || d.id;
  const seriesPhases = useMemo(
    () => new Set(nodes.filter((x) => (x.series || x.id) === sid).map((x) => x.phase)),
    [nodes, sid],
  );

  const [name, setName] = useState(d.name);
  const [net, setNet] = useState<'OA' | 'HPC'>(d.net);
  const [type, setType] = useState(d.type);
  const [picked, setPicked] = useState<Set<string>>(new Set(seriesPhases));
  const [nameErr, setNameErr] = useState(false);

  useEffect(() => {
    setName(d.name); setNet(d.net); setType(d.type); setPicked(new Set(seriesPhases));
  }, [d.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 업로드 폼
  const [fNet, setFNet] = useState<'OA' | 'HPC'>(d.net);
  const [fType, setFType] = useState(d.type);
  const [file, setFile] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  const outs = edges.filter((e) => e.from === d.id);
  const ins = edges.filter((e) => e.to === d.id);
  const linkable = nodes.filter((x) => x.id !== d.id && !edges.some((e) => e.from === d.id && e.to === x.id));
  const [lkTgt, setLkTgt] = useState('');

  const togglePick = (k: string) => {
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(k)) {
        if (n.size <= 1) return n; // 최소 1개 유지 (목업과 동일)
        n.delete(k);
      } else n.add(k);
      return n;
    });
  };

  const submitInfo = () => {
    if (!name.trim()) { setNameErr(true); return; }
    onSaveInfo({ name: name.trim(), net, type: net === 'HPC' ? 'path' : type, phaseKeys: [...picked] });
  };

  const submitUpload = () => {
    setErr('');
    const f = file.trim();
    if (!f) { setErr('파일명 또는 경로를 입력하세요.'); return; }
    if (fNet === 'HPC' && !f.startsWith('/vwp/')) { setErr('HPC 경로는 /vwp/ 로 시작해야 합니다.'); return; }
    onUpload({ file: f, note: note.trim() || '작업본 갱신', net: fNet, type: fNet === 'HPC' ? 'path' : fType });
    setFile(''); setNote('');
  };

  const edgeRow = (e: { id: string; from: string; to: string }, dir: 'in' | 'out') => {
    const other = nodes.find((x) => x.id === (dir === 'out' ? e.to : e.from));
    if (!other) return null;
    const op = phases.find((p) => p.key === other.phase);
    return (
      <Box key={e.id} sx={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: `1px solid ${T.ln}` }}>
        <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm2, width: 52 }}>
          {dir === 'out' ? '→ 다음' : '← 이전'}
        </Box>
        <Box sx={{ flex: 1, fontSize: 12.5 }}>
          {other.name}
          {other.seriesTotal > 1 && <Seq>{other.seriesIdx}/{other.seriesTotal}</Seq>}
        </Box>
        <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.dm2 }}>{op?.key ?? '—'}</Box>
        <AcroButton variant="ghost" title="연결 해제" onClick={() => onUnlink(e.id)}>
          <Icon name="trash" />
        </AcroButton>
      </Box>
    );
  };

  return (
    <>
      {own && (
        <>
          <Card sx={{ mb: '12px' }}>
            <Ey sx={{ mb: '9px' }}>기본 정보 수정</Ey>
            <Row>
              <Field label="이름" sx={{ flex: 1 }}>
                <TextInput value={name} onChange={(v) => { setName(v); setNameErr(false); }} error={nameErr} />
              </Field>
              <Field label="망" sx={{ width: 100 }}>
                <SelectInput
                  value={net}
                  onChange={(v) => { setNet(v as 'OA' | 'HPC'); if (v === 'HPC') setType('path'); else if (type === 'path') setType('word'); }}
                  options={[{ value: 'OA', label: 'OA' }, { value: 'HPC', label: 'HPC' }]}
                />
              </Field>
            </Row>
            <Row>
              <Field label="형식" sx={{ flex: 1 }}>
                <SelectInput
                  value={type}
                  disabled={net === 'HPC'}
                  onChange={setType}
                  options={[{ value: 'word', label: 'Word' }, { value: 'excel', label: 'Excel' }, { value: 'path', label: '경로' }]}
                />
              </Field>
            </Row>
            <Field label="Release 일정">
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {phases.map((p) => (
                  <Box
                    key={p.key}
                    component="button"
                    type="button"
                    onClick={() => togglePick(p.key)}
                    sx={{
                      fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, padding: '5px 10px',
                      borderRadius: '7px', transition: '.14s', cursor: 'pointer',
                      background: picked.has(p.key) ? T.tl2 : T.sf,
                      border: `1px solid ${picked.has(p.key) ? T.tl : T.ln2}`,
                      color: picked.has(p.key) ? T.tl : T.dm,
                      '&:hover': { background: picked.has(p.key) ? T.tl2 : T.sf3 },
                    }}
                  >
                    {p.key}
                  </Box>
                ))}
              </Box>
            </Field>
            <AcroButton variant="primary" onClick={submitInfo}>
              <Icon name="check" /> 저장
            </AcroButton>
          </Card>

          <Card sx={{ mb: '12px' }}>
            <Ey sx={{ mb: '9px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Icon name="link" /> Flow 연결
            </Ey>
            {ins.length + outs.length === 0 ? (
              <Box sx={{ fontSize: 12, color: T.dm2, pb: '8px' }}>연결된 산출물이 없습니다.</Box>
            ) : (
              <>
                {ins.map((e) => edgeRow(e, 'in'))}
                {outs.map((e) => edgeRow(e, 'out'))}
              </>
            )}
            <Row sx={{ mt: '10px' }}>
              <Field label="다음 산출물로 연결" sx={{ flex: 1, mb: 0 }}>
                <SelectInput
                  value={lkTgt || linkable[0]?.id || ''}
                  onChange={setLkTgt}
                  disabled={!linkable.length}
                  options={
                    linkable.length
                      ? linkable.map((x) => ({
                          value: x.id,
                          label: `${x.name}${x.seriesTotal > 1 ? ` (${x.seriesIdx}/${x.seriesTotal})` : ''} · ${phases.find((p) => p.key === x.phase)?.key ?? ''}`,
                        }))
                      : [{ value: '', label: '연결 가능한 산출물 없음' }]
                  }
                />
              </Field>
              <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
                <AcroButton
                  disabled={!linkable.length}
                  onClick={() => { const t = lkTgt || linkable[0]?.id; if (t) onAddLink(t); }}
                >
                  <Icon name="plus" /> 연결
                </AcroButton>
              </Box>
            </Row>
          </Card>
        </>
      )}

      <Row sx={{ mb: '12px' }}>
        <Card sx={{ flex: 1 }}>
          <Ey>수신 부서가 보는 버전</Ey>
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 21, fontWeight: 600, color: T.tl, mt: '6px' }}>
            {rel ? vstr(rel) : '—'}
          </Box>
          <Box sx={{ fontSize: 11, color: T.dm2, mt: '3px' }}>{rel ? fmtAt(rel.at) : '릴리스 이력 없음'}</Box>
        </Card>
        <Card sx={{ flex: 1, opacity: own ? 1 : 0.5 }}>
          <Ey>작성 측 작업본</Ey>
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 21, fontWeight: 600, color: T.am, mt: '6px', display: 'flex', alignItems: 'center' }}>
            {own ? (work ? vstr(work) : '없음') : <Icon name="lock" />}
          </Box>
          <Box sx={{ fontSize: 11, color: T.dm2, mt: '3px' }}>
            {own ? (work ? fmtAt(work.at) : '릴리스 이후 변경 없음') : 'IP 담당자만 열람'}
          </Box>
        </Card>
      </Row>

      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '7px' }}>{d.net === 'HPC' ? 'HPC vwp 경로' : '현재 파일'}</Ey>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Box component="span" sx={{ color: T.dm }}><DocIcon type={d.type} /></Box>
          <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 12, wordBreak: 'break-all' }}>
            {cur || '등록된 항목 없음'}
          </Box>
        </Box>
        <Box sx={{ mt: '11px' }}>
          {d.net === 'HPC' ? (
            <AcroButton
              disabled={!cur}
              onClick={() => { if (cur) { navigator.clipboard?.writeText(cur); toast('경로를 복사했습니다'); } }}
            >
              <Icon name="copy" /> 경로 복사
            </AcroButton>
          ) : (
            <AcroButton disabled={!rel} onClick={() => toast('다운로드는 스토리지 연동 후 제공됩니다')}>
              <Icon name="dn" /> 파일 내려받기
            </AcroButton>
          )}
        </Box>
      </Card>

      {own && (
        <Card>
          <Ey sx={{ mb: '9px' }}>새 작업본 올리기 — minor↑</Ey>
          <Row>
            <Field label="망" sx={{ width: 95 }}>
              <SelectInput
                value={fNet}
                onChange={(v) => { setFNet(v as 'OA' | 'HPC'); if (v === 'HPC') setFType('path'); else if (fType === 'path') setFType('word'); }}
                options={[{ value: 'OA', label: 'OA' }, { value: 'HPC', label: 'HPC' }]}
              />
            </Field>
            <Field label="형식" sx={{ width: 95 }}>
              <SelectInput
                value={fType} disabled={fNet === 'HPC'} onChange={setFType}
                options={[{ value: 'word', label: 'Word' }, { value: 'excel', label: 'Excel' }, { value: 'path', label: '경로' }]}
              />
            </Field>
            <Field label={fNet === 'HPC' ? 'HPC vwp 경로' : '파일명'} sx={{ flex: 1 }}>
              <TextInput
                value={file}
                onChange={(v) => { setFile(v); setErr(''); }}
                error={!!err}
                placeholder={fNet === 'HPC' ? '/vwp/cis_a7/<ip>/...' : 'spec_draft.docx'}
              />
            </Field>
          </Row>
          {err && <Box sx={{ fontSize: 11, color: T.rd, margin: '-5px 0 10px' }}>{err}</Box>}
          <Field label="변경 내용">
            <TextInput value={note} onChange={setNote} placeholder="무엇이 바뀌었는지 한 줄로" />
          </Field>
          <Box sx={{ display: 'flex', gap: '8px' }}>
            <AcroButton variant="primary" onClick={submitUpload}>
              <Icon name="up" /> 작업본 올리기
            </AcroButton>
            <AcroButton
              disabled={!d.versions.length}
              onClick={onRelease}
              sx={{ color: T.tl, borderColor: T.tl3 }}
            >
              <Icon name="send" /> Release — v{(latR(d)?.major ?? 0) + 1}.0
            </AcroButton>
          </Box>
        </Card>
      )}
    </>
  );
}

/* ── 버전 이력 탭 ── */
function VersionsTab({ d, usersById }: { d: CanvasNode; usersById: Map<string, UserDto> }) {
  const list = d.versions;
  if (!list.length) {
    return <Card sx={{ color: T.dm2, fontSize: 12 }}>아직 등록된 버전이 없습니다.</Card>;
  }
  return (
    <Box sx={{ perspective: '1000px', padding: '4px 0' }}>
      {list.map((v: VersionView, i: number) => (
        <Box
          key={`${v.major}.${v.minor}-${i}`}
          sx={{
            background: v.kind === 'major' ? T.sf : T.sf2,
            border: `1px solid ${T.ln}`,
            borderLeft: `3px solid ${v.kind === 'major' ? T.tl : T.am3}`,
            borderRadius: '9px', padding: '10px 13px', mb: '6px',
            transition: 'transform .2s, box-shadow .2s', transformStyle: 'preserve-3d',
            '&:hover': { transform: 'translateZ(20px) rotateX(3deg)', boxShadow: T.sl, zIndex: 2 },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Box sx={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: v.kind === 'major' ? T.tl : T.am }}>
              {vstr(v)}
            </Box>
            <Badge
              color={v.kind === 'major' ? T.tl : T.am}
              bg={v.kind === 'major' ? T.tl2 : T.am2}
              borderColor={v.kind === 'major' ? T.tl3 : T.am3}
            >
              {v.kind === 'major' ? 'RELEASE' : '작업본'}
            </Badge>
            {i === 0 && <Chip>최신</Chip>}
          </Box>
          <Box sx={{ fontSize: 12, color: T.dm, mt: '4px' }}>{v.note}</Box>
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, color: T.dm2, mt: '4px', wordBreak: 'break-all' }}>
            {v.file || '(없음)'} · {usersById.get(v.by)?.name ?? '—'} · {fmtAt(v.at)}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/* ── 전달 탭 ── */
function RecvTab({
  d, own, users, usersById, onSave,
}: {
  d: CanvasNode; own: boolean; users: UserDto[];
  usersById: Map<string, UserDto>; onSave: Props['onSaveRecv'];
}) {
  const [dept, setDept] = useState(d.recvDept ?? '');
  const [contact, setContact] = useState(d.recvContact ?? '');
  useEffect(() => { setDept(d.recvDept ?? ''); setContact(d.recvContact ?? ''); }, [d.id]); // eslint-disable-line

  if (!own) {
    return (
      <Card>
        <Ey sx={{ mb: '9px' }}>전달 받는 부서</Ey>
        {d.recvDept ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 0' }}>
            <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>{departmentName(d.recvDept)}</Badge>
            {d.recvContact && (
              <>
                <UserAvatar user={usersById.get(d.recvContact)} size={24} />
                <Box sx={{ fontSize: 13 }}>{usersById.get(d.recvContact)?.name}</Box>
              </>
            )}
          </Box>
        ) : (
          <Box sx={{ fontSize: 12.5, color: T.dm2 }}>지정된 전달 부서가 없습니다.</Box>
        )}
      </Card>
    );
  }

  // 부서를 지정하면 그 부서 소속자만 후보로 (UX 편의 — 실제 검증은 BE, 설계서 3.4)
  const contacts = users.filter((u) => !dept || u.department === dept);

  return (
    <Card>
      <Ey sx={{ mb: '9px' }}>전달 받는 부서</Ey>
      <Row>
        <Field label="부서" sx={{ flex: 1, mb: 0 }}>
          <SelectInput
            value={dept}
            onChange={(v) => { setDept(v); setContact(''); }}
            options={[{ value: '', label: '지정 안 함' }, ...RECEIVABLE_DEPARTMENTS.map((dp) => ({ value: dp.id, label: dp.name }))]}
          />
        </Field>
      </Row>
      <Row sx={{ mt: '11px' }}>
        <Field label="개별 담당자" sx={{ flex: 1, mb: 0 }}>
          <SelectInput
            value={contact}
            onChange={setContact}
            options={[
              { value: '', label: '지정 안 함' },
              ...contacts.map((u) => ({ value: u.id, label: `${u.name} · ${departmentName(u.department)}` })),
            ]}
          />
        </Field>
      </Row>
      <AcroButton variant="primary" sx={{ mt: '11px' }} onClick={() => onSave({ recvDept: dept || null, recvContact: contact || null })}>
        <Icon name="check" /> 저장
      </AcroButton>
    </Card>
  );
}

function Seq({ children }: { children: React.ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        fontFamily: FONT_MONO, fontSize: 9, fontWeight: 600, padding: '1px 5px', ml: '4px',
        borderRadius: '9px', background: T.vi2, color: T.vi, border: `1px solid ${T.vi3}`,
      }}
    >
      {children}
    </Box>
  );
}
