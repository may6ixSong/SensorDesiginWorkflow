import { useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { WorkflowBriefDto, WorkflowPhase } from '@/types/domain';
import { shortDate } from '@/lib/schedule';
import { CanvasNode, VersionView, fmtAt, hasW, isOrphanPhase, latA, latR, stOf, vstr } from '@/lib/canvasModel';
import { useCanvasStore } from '@/store/canvasStore';
import { useDownloadVersion } from '@/api/hooks/useDeliverables';
import { toast } from '@/store/toastStore';
import { RECEIVABLE_DEPARTMENTS, departmentName } from '@/shared/constants/departments';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { UserSearchDialog } from '@/components/dialogs/UserSearchDialog';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton, Badge, Chip } from '@/components/common/SirenButton';
import { Card, Ey, Field, Row, SelectInput, TextInput } from '@/components/common/Panel';
import { DocIcon, Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

interface Props {
  node: CanvasNode | null;
  phases: WorkflowPhase[];
  /** 목업 own = isOwn(workflow) && !S.recv */
  own: boolean;
  /** 수신 workflow 셀렉트 박스용 — 과제 소속 workflow 전체(id/name/color). */
  workflowDirectory: WorkflowBriefDto[];
  /** "Received from" 부서 후보 — 과제마다 자유롭게 관리하는 목록(Project.departments). */
  projectDepartments: string[];
  onClose: () => void;
  onSaveInfo: (p: { name: string; net: 'OA' | 'HPC'; type: string; phaseIds: string[] }) => void;
  onUpload: (p: { file: string; note: string; net: 'OA' | 'HPC'; type: string }) => void;
  onRelease: () => void;
  onSaveRecv: (p: {
    recvDept: string | null; recvContact: string | null; recvWorkflowId: string | null; sourceDept: string | null;
    sourceWorkflowId: string | null; sourceContact: string | null;
  }) => void;
}

/**
 * 산출물 상세 — 개요 / 버전 이력 / 전달 3탭.
 *
 * flow(연결)는 여기서 만들거나 지우지 않는다(사용자 요청) — 연결은 캔버스에서 pin을 끌어
 * 잇는 것으로만 하고, 이 화면에는 "무엇과 이어져 있는지" 읽기 전용 목록만 남긴다.
 */
export function DeliverableDialog({
  node: d, phases, own, workflowDirectory, projectDepartments, onClose,
  onSaveInfo, onUpload, onRelease, onSaveRecv,
}: Props) {
  const tab = useCanvasStore((s) => s.tab);
  const setTab = useCanvasStore((s) => s.setTab);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  if (!d) return null;
  const ph = phases.find((p) => p.id === d.phase);
  const orphan = isOrphanPhase(phases, d.phase);
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
            <Ey>{ph ? `${ph.name} · ${shortDate(ph.start)} → ${shortDate(ph.end)}` : 'No release schedule'}</Ey>
            <Box sx={{ fontSize: 18, fontWeight: 700, mt: '3px' }}>{d.name}</Box>
          </Box>
          {orphan && (
            <Badge color={T.rd} bg={T.rd2} borderColor={T.rd3} sx={{ mt: '6px' }}>Schedule lost</Badge>
          )}
          <Badge color={st.c} bg={st.bg} borderColor={st.bd} sx={{ mt: '6px' }}>{st.lb}</Badge>
          <Badge
            color={d.net === 'HPC' ? T.hp : T.dm}
            bg={d.net === 'HPC' ? T.hp2 : T.sf2}
            borderColor={d.net === 'HPC' ? T.hp3 : T.ln}
            sx={{ mt: '6px' }}
          >
            {d.net} network
          </Badge>
        </Box>
      }
      belowHeader={
        <Box sx={{ display: 'flex', gap: '2px', mt: '11px', borderBottom: `1px solid ${T.ln}` }}>
          {([['overview', 'Overview'], ['versions', 'Version History'], ['recv', 'Handoff']] as const).map(([k, l]) => (
            <Box
              key={k}
              component="button"
              onClick={() => setTab(k)}
              sx={{
                padding: '8px 13px', fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit',
                color: tab === k ? T.tl : T.dm, background: 'none', border: 'none',
                borderBottom: `2px solid ${tab === k ? T.tl : 'transparent'}`,
                mb: '-1px', cursor: CURSOR_POINTER,
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
        />
      )}
      {tab === 'versions' && <VersionsTab d={d} />}
      {tab === 'recv' && (
        <RecvTab
          d={d} own={own} workflowDirectory={workflowDirectory} projectDepartments={projectDepartments}
          onSave={onSaveRecv}
        />
      )}
    </ModalShell>
  );
}

/* ── 개요 탭 ── */
function OverviewTab({
  d, phases, own, nodes, edges, onSaveInfo, onUpload, onRelease,
}: {
  d: CanvasNode; phases: WorkflowPhase[]; own: boolean;
  nodes: CanvasNode[]; edges: ReturnType<typeof useCanvasStore.getState>['edges'];
  onSaveInfo: Props['onSaveInfo']; onUpload: Props['onUpload'];
  onRelease: Props['onRelease'];
}) {
  const rel = latR(d);
  const work = hasW(d) ? latA(d) : null;
  const cur = own ? latA(d)?.file : rel?.file;
  // GET /deliverables/:id/download?major=&minor= — api/가 파일 바이트를 직접 중계한다.
  const download = useDownloadVersion();

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
  const [schedErr, setSchedErr] = useState('');

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

  // 이 산출물(또는 같은 series의 회차)이 지금 살아 있는 phase 중 어디에도 안 걸려 있으면
  // "일정 유실" 상태다 — 사라진 phase를 가리키고 있다는 뜻이다.
  const orphan = isOrphanPhase(phases, d.phase);
  const livePicked = useMemo(
    () => new Set([...picked].filter((id) => phases.some((p) => p.id === id))),
    [picked, phases],
  );

  const togglePick = (k: string) => {
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const submitInfo = () => {
    if (!name.trim()) { setNameErr(true); return; }
    if (!livePicked.size) { setSchedErr('Pick at least one phase — an artifact with no phase has no release schedule.'); return; }
    setSchedErr('');
    // 사라진 phase의 id는 보내지 않는다 — 서버가 거절하기도 하고, 여기서 일정을 다시
    // 고르는 것이 곧 "유실 상태를 푸는" 행위이기 때문이다.
    onSaveInfo({ name: name.trim(), net, type: net === 'HPC' ? 'path' : type, phaseIds: [...livePicked] });
  };

  const submitUpload = () => {
    setErr('');
    const f = file.trim();
    if (!f) { setErr('Enter a file name or path.'); return; }
    if (fNet === 'HPC' && !f.startsWith('/vwp/')) { setErr('HPC paths must start with /vwp/.'); return; }
    onUpload({ file: f, note: note.trim() || 'Working copy update', net: fNet, type: fNet === 'HPC' ? 'path' : fType });
    setFile(''); setNote('');
  };

  const edgeRow = (e: { id: string; from: string; to: string }, dir: 'in' | 'out') => {
    const other = nodes.find((x) => x.id === (dir === 'out' ? e.to : e.from));
    if (!other) return null;
    const op = phases.find((p) => p.id === other.phase);
    return (
      <Box key={e.id} sx={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: `1px solid ${T.ln}` }}>
        <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm2, width: 52 }}>
          {dir === 'out' ? '→ Next' : '← Previous'}
        </Box>
        <Box sx={{ flex: 1, fontSize: 12.5 }}>
          {other.name}
          {other.seriesTotal > 1 && <Seq>{other.seriesIdx}/{other.seriesTotal}</Seq>}
        </Box>
        <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: op ? T.dm2 : T.rd }}>
          {op?.name ?? 'no schedule'}
        </Box>
      </Box>
    );
  };

  return (
    <>
      {own && (
        <>
          <Card sx={{ mb: '12px' }}>
            <Ey sx={{ mb: '9px' }}>Edit basic info</Ey>
            <Row>
              <Field label="Name" sx={{ flex: 1 }}>
                <TextInput value={name} onChange={(v) => { setName(v); setNameErr(false); }} error={nameErr} />
              </Field>
              <Field label="Network" sx={{ width: 100 }}>
                <SelectInput
                  value={net}
                  onChange={(v) => { setNet(v as 'OA' | 'HPC'); if (v === 'HPC') setType('path'); else if (type === 'path') setType('word'); }}
                  options={[{ value: 'OA', label: 'OA' }, { value: 'HPC', label: 'HPC' }]}
                />
              </Field>
            </Row>
            <Row>
              <Field label="Format" sx={{ flex: 1 }}>
                <SelectInput
                  value={type}
                  disabled={net === 'HPC'}
                  onChange={setType}
                  options={[{ value: 'word', label: 'Word' }, { value: 'excel', label: 'Excel' }, { value: 'path', label: 'Path' }]}
                />
              </Field>
            </Row>
            <Field label="Release schedule — every phase of this workflow this artifact is due in">
              {orphan && (
                <Box
                  sx={{
                    display: 'flex', alignItems: 'flex-start', gap: '7px', fontSize: 11.5, color: T.rd,
                    background: T.rd2, border: `1px solid ${T.rd3}`, borderRadius: '8px',
                    padding: '8px 10px', mb: '8px', lineHeight: 1.6,
                  }}
                >
                  <Box component="span" sx={{ mt: '1px' }}><Icon name="warn" size={12} /></Box>
                  The phase this artifact was on no longer exists in this workflow's schedule. It kept its
                  place on the canvas, but it has no release date until you pick one below.
                </Box>
              )}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {phases.map((p) => (
                  <Box
                    key={p.id}
                    component="button"
                    type="button"
                    title={`${shortDate(p.start)} → ${shortDate(p.end)}`}
                    onClick={() => togglePick(p.id)}
                    sx={{
                      fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, padding: '5px 10px',
                      borderRadius: '7px', transition: '.14s', cursor: CURSOR_POINTER,
                      background: picked.has(p.id) ? T.tl2 : T.sf,
                      border: `1px solid ${picked.has(p.id) ? T.tl : T.ln2}`,
                      color: picked.has(p.id) ? T.tl : T.dm,
                      '&:hover': { background: picked.has(p.id) ? T.tl2 : T.sf3 },
                    }}
                  >
                    {p.name}
                  </Box>
                ))}
                {!phases.length && (
                  <Box sx={{ fontSize: 12, color: T.rd }}>
                    This workflow has no phases — add a schedule first.
                  </Box>
                )}
              </Box>
              {schedErr && <Box sx={{ fontSize: 11, color: T.rd, mt: '7px' }}>{schedErr}</Box>}
            </Field>
            <SirenButton variant="primary" onClick={submitInfo}>
              <Icon name="check" /> Save
            </SirenButton>
          </Card>

        </>
      )}

      {/* Flow links — 읽기 전용이다. 연결을 만들거나 지우는 것은 캔버스에서 pin을 끌어
          잇는 방법 하나뿐이다(사용자 요청). 여기서는 무엇과 이어져 있는지만 보여 준다. */}
      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '9px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Icon name="link" /> Flow links
        </Ey>
        {ins.length + outs.length === 0 ? (
          <Box sx={{ fontSize: 12, color: T.dm2 }}>Not linked to anything yet.</Box>
        ) : (
          <>
            {ins.map((e) => edgeRow(e, 'in'))}
            {outs.map((e) => edgeRow(e, 'out'))}
          </>
        )}
        <Box sx={{ fontSize: 11, color: T.dm2, mt: '9px' }}>
          Links are drawn on the canvas only: in edit mode, click an artifact's right-hand pin and then the
          target artifact to connect, or click a link's ✕ handle to remove it.
        </Box>
      </Card>

      <Row sx={{ mb: '12px' }}>
        <Card sx={{ flex: 1 }}>
          <Ey>Version the recipient dept sees</Ey>
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 21, fontWeight: 600, color: T.tl, mt: '6px' }}>
            {rel ? vstr(rel) : '—'}
          </Box>
          <Box sx={{ fontSize: 11, color: T.dm2, mt: '3px' }}>{rel ? fmtAt(rel.at) : 'No release history'}</Box>
        </Card>
        <Card sx={{ flex: 1, opacity: own ? 1 : 0.5 }}>
          <Ey>Author's working copy</Ey>
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 21, fontWeight: 600, color: T.am, mt: '6px', display: 'flex', alignItems: 'center' }}>
            {own ? (work ? vstr(work) : 'None') : <Icon name="lock" />}
          </Box>
          <Box sx={{ fontSize: 11, color: T.dm2, mt: '3px' }}>
            {own ? (work ? fmtAt(work.at) : 'No changes since release') : 'workflow owners only'}
          </Box>
        </Card>
      </Row>

      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '7px' }}>{d.net === 'HPC' ? 'HPC vwp path' : 'Current file'}</Ey>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Box component="span" sx={{ color: T.dm }}><DocIcon type={d.type} /></Box>
          <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 12, wordBreak: 'break-all' }}>
            {cur || 'Nothing registered yet'}
          </Box>
        </Box>
        <Box sx={{ mt: '11px' }}>
          {d.net === 'HPC' ? (
            <SirenButton
              disabled={!cur}
              onClick={() => { if (cur) { navigator.clipboard?.writeText(cur); toast('Path copied'); } }}
            >
              <Icon name="copy" /> Copy path
            </SirenButton>
          ) : (
            <SirenButton
              disabled={!rel || download.isPending}
              onClick={() => {
                if (!rel) return;
                download.mutate(
                  { id: d.id, major: rel.major, minor: rel.minor, fileName: rel.file },
                  { onError: () => toast('Download failed') },
                );
              }}
            >
              <Icon name="dn" /> Download file
            </SirenButton>
          )}
        </Box>
      </Card>

      {own && (
        <Card>
          <Ey sx={{ mb: '9px' }}>Upload new working copy — minor↑</Ey>
          <Row>
            <Field label="Network" sx={{ width: 95 }}>
              <SelectInput
                value={fNet}
                onChange={(v) => { setFNet(v as 'OA' | 'HPC'); if (v === 'HPC') setFType('path'); else if (fType === 'path') setFType('word'); }}
                options={[{ value: 'OA', label: 'OA' }, { value: 'HPC', label: 'HPC' }]}
              />
            </Field>
            <Field label="Format" sx={{ width: 95 }}>
              <SelectInput
                value={fType} disabled={fNet === 'HPC'} onChange={setFType}
                options={[{ value: 'word', label: 'Word' }, { value: 'excel', label: 'Excel' }, { value: 'path', label: 'Path' }]}
              />
            </Field>
            <Field label={fNet === 'HPC' ? 'HPC vwp path' : 'File name'} sx={{ flex: 1 }}>
              <TextInput
                value={file}
                onChange={(v) => { setFile(v); setErr(''); }}
                error={!!err}
                placeholder={fNet === 'HPC' ? '/vwp/cis_a7/<workflow>/...' : 'spec_draft.docx'}
              />
            </Field>
          </Row>
          {err && <Box sx={{ fontSize: 11, color: T.rd, margin: '-5px 0 10px' }}>{err}</Box>}
          <Field label="Change notes">
            <TextInput value={note} onChange={setNote} placeholder="One line describing what changed" />
          </Field>
          <Box sx={{ display: 'flex', gap: '8px' }}>
            <SirenButton variant="primary" onClick={submitUpload}>
              <Icon name="up" /> Upload working copy
            </SirenButton>
            <SirenButton
              disabled={!d.versions.length}
              onClick={onRelease}
              sx={{ color: T.tl, borderColor: T.tl3 }}
            >
              <Icon name="send" /> Release — v{(latR(d)?.major ?? 0) + 1}.0
            </SirenButton>
          </Box>
        </Card>
      )}
    </>
  );
}

/* ── 버전 이력 탭 ── */
function VersionsTab({ d }: { d: CanvasNode }) {
  const { resolveUser } = useDirectory();
  const list = d.versions;
  if (!list.length) {
    return <Card sx={{ color: T.dm2, fontSize: 12 }}>No versions yet.</Card>;
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
              {v.kind === 'major' ? 'RELEASE' : 'WORKING'}
            </Badge>
            {i === 0 && <Chip>Latest</Chip>}
          </Box>
          <Box sx={{ fontSize: 12, color: T.dm, mt: '4px' }}>{v.note}</Box>
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, color: T.dm2, mt: '4px', wordBreak: 'break-all' }}>
            {v.file || '(none)'} · {resolveUser(v.by).name} · {fmtAt(v.at)}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/* ── 전달 탭 ── */
function RecvTab({
  d, own, workflowDirectory, projectDepartments, onSave,
}: {
  d: CanvasNode; own: boolean;
  workflowDirectory: WorkflowBriefDto[]; projectDepartments: string[]; onSave: Props['onSaveRecv'];
}) {
  const { resolveUser } = useDirectory();
  const [dept, setDept] = useState(d.recvDept ?? '');
  const [contact, setContact] = useState(d.recvContact ?? '');
  const [recvWorkflow, setRecvIp] = useState(d.recvWorkflowId ?? '');
  const [sourceDept, setSourceDept] = useState(d.sourceDept ?? '');
  const [sourceWorkflow, setSourceWorkflow] = useState(d.sourceWorkflowId ?? '');
  const [sourceContact, setSourceContact] = useState(d.sourceContact ?? '');
  const [contactSearchOpen, setContactSearchOpen] = useState(false);
  useEffect(() => {
    setDept(d.recvDept ?? ''); setContact(d.recvContact ?? ''); setRecvIp(d.recvWorkflowId ?? '');
    setSourceDept(d.sourceDept ?? ''); setSourceWorkflow(d.sourceWorkflowId ?? '');
    setSourceContact(d.sourceContact ?? '');
  }, [d.id]); // eslint-disable-line

  const workflowById = new Map(workflowDirectory.map((workflow) => [workflow.id, workflow]));
  const otherIps = workflowDirectory.filter((workflow) => workflow.id !== d.workflow);
  const recvIpInfo = d.recvWorkflowId ? workflowById.get(d.recvWorkflowId) : undefined;
  const sourceIpInfo = d.sourceWorkflowId ? workflowById.get(d.sourceWorkflowId) : undefined;

  if (!own) {
    return (
      <>
        <Card sx={{ mb: '12px' }}>
          <Ey sx={{ mb: '9px' }}>Recipient department</Ey>
          {d.recvDept ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 0' }}>
              <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>{departmentName(d.recvDept)}</Badge>
              {d.recvContact && (
                <>
                  <UserAvatar user={resolveUser(d.recvContact)} size={24} />
                  <Box sx={{ fontSize: 13 }}>{resolveUser(d.recvContact).name}</Box>
                </>
              )}
            </Box>
          ) : (
            <Box sx={{ fontSize: 12.5, color: T.dm2 }}>No recipient department set.</Box>
          )}
        </Card>
        <Card sx={{ mb: '12px' }}>
          <Ey sx={{ mb: '9px' }}>Recipient workflow</Ey>
          {recvIpInfo ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 0' }}>
              <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: recvIpInfo.color }} />
              <Box sx={{ fontSize: 13 }}>{recvIpInfo.name}</Box>
            </Box>
          ) : (
            <Box sx={{ fontSize: 12.5, color: T.dm2 }}>No recipient workflow set.</Box>
          )}
        </Card>
        <Card>
          <Ey sx={{ mb: '9px' }}>Received from</Ey>
          {d.sourceDept || sourceIpInfo ? (
            <Box sx={{ padding: '9px 0' }}>
              {d.sourceDept && <Box sx={{ fontSize: 13 }}>{d.sourceDept}</Box>}
              {sourceIpInfo && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', mt: '6px' }}>
                  <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: sourceIpInfo.color }} />
                  <Box sx={{ fontSize: 12.5, color: T.dm2 }}>Expecting from {sourceIpInfo.name}</Box>
                </Box>
              )}
              {d.sourceContact && (
                <Box sx={{ fontSize: 11.5, color: T.dm2, mt: '3px' }}>{d.sourceContact}</Box>
              )}
            </Box>
          ) : (
            <Box sx={{ fontSize: 12.5, color: T.dm2 }}>Not marked as received from anywhere.</Box>
          )}
        </Card>
      </>
    );
  }

  const contactUser = contact ? resolveUser(contact) : null;
  // 이 프로젝트 부서 목록에 없는 값(과거에 자유 입력했던 값)도 후보에 끼워 보여준다 —
  // 셀렉트가 "선택 없음"으로 조용히 지워버리면 저장된 값과 화면이 어긋난다.
  const sourceDeptOptions = [
    { value: '', label: 'Not set' },
    ...(sourceDept && !projectDepartments.includes(sourceDept) ? [{ value: sourceDept, label: `${sourceDept} (not in list)` }] : []),
    ...projectDepartments.map((dp) => ({ value: dp, label: dp })),
  ];

  return (
    <>
      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '9px' }}>Recipient department</Ey>
        <Row>
          <Field label="Department" sx={{ flex: 1, mb: 0 }}>
            <SelectInput
              value={dept}
              onChange={(v) => { setDept(v); setContact(''); }}
              options={[{ value: '', label: 'Not set' }, ...RECEIVABLE_DEPARTMENTS.map((dp) => ({ value: dp.id, label: dp.name }))]}
            />
          </Field>
        </Row>
        <Row sx={{ mt: '11px', alignItems: 'flex-end' }}>
          <Field label="Individual contact" sx={{ flex: 1, mb: 0 }}>
            {contactUser ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '4px 0' }}>
                <UserAvatar user={contactUser} size={24} />
                <Box sx={{ fontSize: 13 }}>{contactUser.name}</Box>
              </Box>
            ) : (
              <Box sx={{ fontSize: 12, color: T.dm2, padding: '8px 0' }}>Not set</Box>
            )}
          </Field>
          <SirenButton onClick={() => setContactSearchOpen(true)}>
            <Icon name="search" /> {contact ? 'Change' : 'Set contact'}
          </SirenButton>
          {contact && (
            <SirenButton variant="ghost" onClick={() => setContact('')}>
              <Icon name="x" />
            </SirenButton>
          )}
        </Row>
      </Card>

      {contactSearchOpen && (
        <UserSearchDialog
          title="Set individual contact"
          onClose={() => setContactSearchOpen(false)}
          onConfirm={(knoxId) => { setContact(knoxId); setContactSearchOpen(false); }}
        />
      )}

      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '9px' }}>Recipient workflow</Ey>
        <Box sx={{ fontSize: 11.5, color: T.dm2, mb: '9px' }}>
          Set another Analog workflow that should receive this deliverable — it'll show up on that
          workflow's board as "Incoming from other workflows", showing only the version you release.
        </Box>
        <Field label="workflow" sx={{ mb: 0 }}>
          <SelectInput
            value={recvWorkflow}
            onChange={setRecvIp}
            options={[
              { value: '', label: 'Not set' },
              ...otherIps.map((workflow) => ({ value: workflow.id, label: workflow.name })),
            ]}
          />
        </Field>
      </Card>

      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '9px' }}>Received from</Ey>
        <Box sx={{ fontSize: 11.5, color: T.dm2, mb: '9px' }}>
          Mark this as something you're waiting to receive. Pick a department below — if the workflow
          that will actually send it is registered in this system, also set it under "Expecting from
          workflow". If not (e.g. a department that doesn't use this system, a foundry or vendor),
          leave that unset and use the contact field for a name/email/phone instead. This stays your
          own deliverable either way — position it in any Phase(s) just like anything else you own.
        </Box>
        <Field label="Department" sx={{ mb: 0 }}>
          <SelectInput value={sourceDept} onChange={setSourceDept} options={sourceDeptOptions} />
        </Field>
      </Card>

      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '9px' }}>Expecting from workflow (registered in this system)</Ey>
        <Field label="workflow" sx={{ mb: 0 }}>
          <SelectInput
            value={sourceWorkflow}
            onChange={setSourceWorkflow}
            options={[
              { value: '', label: 'Not set — outside this system' },
              ...otherIps.map((workflow) => ({ value: workflow.id, label: workflow.name })),
            ]}
          />
        </Field>
        <Box sx={{ fontSize: 11, color: T.dm2, mt: '8px' }}>
          This is a reference only — the target workflow isn't linked automatically, and its schedule
          or status doesn't sync here yet.
        </Box>
      </Card>

      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '9px' }}>Contact (optional)</Ey>
        <Field label="Name, email or phone" sx={{ mb: 0 }}>
          <TextInput value={sourceContact} onChange={setSourceContact} placeholder="e.g. Jane Doe · jane@vendor.com" />
        </Field>
      </Card>

      <SirenButton
        variant="primary"
        onClick={() => onSave({
          recvDept: dept || null, recvContact: contact || null, recvWorkflowId: recvWorkflow || null,
          sourceDept: sourceDept.trim() || null,
          sourceWorkflowId: sourceWorkflow || null,
          sourceContact: sourceContact.trim() || null,
        })}
      >
        <Icon name="check" /> Save
      </SirenButton>
    </>
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
