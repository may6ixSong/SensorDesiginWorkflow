import { useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { WorkflowPhase } from '@/types/domain';
import { shortDate } from '@/lib/schedule';
import { CanvasNode, VersionView, fmtAt, hasW, isOrphanPhase, latA, latR, stOf, vstr } from '@/lib/canvasModel';
import { useCanvasStore } from '@/store/canvasStore';
import { useDownloadVersion } from '@/api/hooks/useDeliverables';
import { toast } from '@/store/toastStore';
import { RECEIVABLE_DEPARTMENTS, departmentName } from '@/shared/constants/departments';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { UserSearchDialog } from '@/components/dialogs/UserSearchDialog';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton, Badge, Chip } from '@/components/common/SirenButton';
import { Card, Ey, Field, Row, SelectInput, TextInput } from '@/components/common/Panel';
import { DocIcon, Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

/**
 * 삭제는 이 phase에 걸린 산출물 사본 하나만 지운다(다른 phase의 사본에는 영향 없음) —
 * 그 의미를 시스템 언어와 무관하게 항상 영어로 고정 표시한다(사용자 요청).
 */
const DELETE_LABEL = 'Delete artifact for this phase';

interface Props {
  node: CanvasNode | null;
  phases: WorkflowPhase[];
  /** 목업 own = isOwn(workflow) && !S.recv */
  own: boolean;
  onClose: () => void;
  onSaveInfo: (p: { name: string; artifactKey: string | null; net: 'OA' | 'HPC'; type: string }) => void;
  onUpload: (p: { file: string; note: string; net: 'OA' | 'HPC'; type: string }) => void;
  onRelease: () => void;
  onSaveRecv: (p: { recvDept: string | null; recvContact: string | null }) => void;
  /** 삭제 확인 후 호출된다 — 실제 삭제 API 호출과 dialog 닫기는 호출부(BoardPage) 책임. */
  onDelete: () => void;
}

/**
 * 산출물 상세 — 개요 / 버전 이력 / 전달 3탭.
 *
 * flow(연결)는 여기서 만들거나 지우지 않는다(사용자 요청) — 연결은 캔버스에서 pin을 끌어
 * 잇는 것으로만 하고, 이 화면에는 "무엇과 이어져 있는지" 읽기 전용 목록만 남긴다.
 */
export function DeliverableDialog({
  node: d, phases, own, onClose,
  onSaveInfo, onUpload, onRelease, onSaveRecv, onDelete,
}: Props) {
  const { t } = useTranslation();
  const storeTab = useCanvasStore((s) => s.tab);
  const setTab = useCanvasStore((s) => s.setTab);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  if (!d) return null;
  const ph = phases.find((p) => p.id === d.phase);
  const orphan = isOrphanPhase(phases, d.phase);
  const st = stOf(d);
  // "받아야 할 산출물" 자리표시자는 전달(Handoff) 탭 자체가 없다 — 다른 산출물을 보다가
  // 그 탭에 있던 상태로 넘어왔을 수 있으니 그 경우에만 개요로 되돌린다.
  const received = d.intent === 'received';
  const tab = received && storeTab === 'recv' ? 'overview' : storeTab;

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
          {(
            [
              ['overview', t('deliverable.tabOverview')] as const,
              ['versions', t('deliverable.tabVersions')] as const,
              ...(received ? [] : [['recv', t('deliverable.tabHandoff')] as const]),
            ]
          ).map(([k, l]) => (
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
      footer={own && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <SirenButton
            variant="ghost"
            onClick={() => setConfirmDeleteOpen(true)}
            sx={{ color: T.rd, borderColor: T.rd3 }}
          >
            <Icon name="trash" /> {DELETE_LABEL}
          </SirenButton>
        </Box>
      )}
    >
      {tab === 'overview' && (
        <OverviewTab
          d={d} phases={phases} own={own} nodes={nodes} edges={edges}
          onSaveInfo={onSaveInfo} onUpload={onUpload} onRelease={onRelease}
        />
      )}
      {tab === 'versions' && <VersionsTab d={d} />}
      {tab === 'recv' && <RecvTab d={d} own={own} onSave={onSaveRecv} />}

      {confirmDeleteOpen && (
        <ConfirmDialog
          title={DELETE_LABEL}
          message={t('deliverable.deleteMessage', { name: d.name })}
          warning={t('deliverable.deleteWarning')}
          confirmLabel={t('deliverable.delete')}
          cancelLabel={t('deliverable.cancel')}
          onCancel={() => setConfirmDeleteOpen(false)}
          onConfirm={() => { setConfirmDeleteOpen(false); onDelete(); }}
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
  const received = d.intent === 'received';
  const rel = latR(d);
  const work = hasW(d) ? latA(d) : null;
  const cur = own ? latA(d)?.file : rel?.file;
  // GET /deliverables/:id/download?major=&minor= — api/가 파일 바이트를 직접 중계한다.
  const download = useDownloadVersion();

  // rev를 의존성에 넣는 이유: 캔버스 드래그로 phase가 바뀌는 건 nodes 배열 원소를
  // in-place로 고치는 것이라(canvasStore) 배열 참조 자체는 그대로다 — rev 없이는 이
  // useMemo가 그 변화를 못 보고 예전 release schedule을 계속 들고 있는다(실측 확인된 버그).
  const rev = useCanvasStore((s) => s.rev);
  const sid = d.series || d.id;
  // 이 산출물과 "같은 실물"로 볼 다른 캔버스 block들 — 옛 series 연결(원본/회차)과, 이제
  // phase마다 개별로 추가하면서 같은 Artifact key를 붙인 block들을 모두 아우른다. 산출물은
  // 더 이상 여기서 여러 phase를 한번에 고를 수 없으므로(사용자 요청), Release schedule은
  // 이 집합을 읽기 전용으로만 보여준다 — phase별 추가/삭제는 각 phase의 캔버스에서 한다.
  const relatedPhases = useMemo(
    () => new Set(
      nodes
        .filter((x) => (x.series || x.id) === sid || (!!d.artifactKey && x.artifactKey === d.artifactKey))
        .map((x) => x.phase),
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, sid, d.artifactKey, rev],
  );

  const [name, setName] = useState(d.name);
  const [artifactKey, setArtifactKey] = useState(d.artifactKey ?? '');
  const [net, setNet] = useState<'OA' | 'HPC'>(d.net);
  const [type, setType] = useState(d.type);
  const [nameErr, setNameErr] = useState(false);
  const [keyErr, setKeyErr] = useState('');

  useEffect(() => {
    setName(d.name); setArtifactKey(d.artifactKey ?? ''); setNet(d.net); setType(d.type);
    setKeyErr('');
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

  const submitInfo = () => {
    if (!name.trim()) { setNameErr(true); return; }
    const key = artifactKey.trim();
    if (key && !/^[A-Za-z0-9_.-]+$/.test(key)) {
      setKeyErr('Only letters, numbers, dot, underscore and hyphen are allowed.');
      return;
    }
    setKeyErr('');
    onSaveInfo({ name: name.trim(), artifactKey: key || null, net, type: net === 'HPC' ? 'path' : type });
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
            <Field
              label="Artifact key — optional, stable id for future system integration (unaffected by renaming)"
              sx={{ mb: '13px' }}
            >
              <TextInput
                value={artifactKey}
                onChange={(v) => { setArtifactKey(v); setKeyErr(''); }}
                error={!!keyErr}
                placeholder="e.g. PLL_MAIN.DESIGN_REVIEW_PACKAGE"
              />
              {keyErr && <Box sx={{ fontSize: 11, color: T.rd, mt: '5px' }}>{keyErr}</Box>}
            </Field>
            <SirenButton variant="primary" onClick={submitInfo}>
              <Icon name="check" /> Save
            </SirenButton>
            <Field label="Release schedule — view only" sx={{ mt: '13px', mb: 0 }}>
              {orphan && (
                <Box
                  sx={{
                    display: 'flex', alignItems: 'flex-start', gap: '7px', fontSize: 11.5, color: T.rd,
                    background: T.rd2, border: `1px solid ${T.rd3}`, borderRadius: '8px',
                    padding: '8px 10px', mb: '8px', lineHeight: 1.6,
                  }}
                >
                  <Box component="span" sx={{ mt: '1px' }}><Icon name="warn" size={12} /></Box>
                  The phase this artifact was on no longer exists in this workflow's schedule.
                </Box>
              )}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {phases.map((p) => (
                  <Box
                    key={p.id}
                    title={`${shortDate(p.start)} → ${shortDate(p.end)}`}
                    sx={{
                      fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, padding: '5px 10px',
                      borderRadius: '7px', cursor: 'default',
                      background: relatedPhases.has(p.id) ? T.tl2 : T.sf,
                      border: `1px solid ${relatedPhases.has(p.id) ? T.tl : T.ln2}`,
                      color: relatedPhases.has(p.id) ? T.tl : T.dm2,
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
            </Field>
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

      {own && !received && (
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

/* ── 전달 탭 ──
 * own = 이 workflow가 만들어 남에게 준다(outgoing) — 전달 받을 부서(+ 개별 담당자)만
 * 남긴다(사용자 요청). 시스템에 등록된 workflow끼리의 전달은 받는 쪽이 자기 workflow에
 * 그 산출물을 "받아야 할 산출물"로 직접 등록하므로, 주는 쪽에서 대상 workflow를 따로
 * 지정하는 필드는 두지 않는다 — 이 시스템에 없는 부서를 위한 자유 입력만 남는다.
 */
function RecvTab({ d, own, onSave }: { d: CanvasNode; own: boolean; onSave: Props['onSaveRecv'] }) {
  const { t } = useTranslation();
  const { resolveUser } = useDirectory();
  const [dept, setDept] = useState(d.recvDept ?? '');
  const [contact, setContact] = useState(d.recvContact ?? '');
  const [contactSearchOpen, setContactSearchOpen] = useState(false);
  useEffect(() => {
    setDept(d.recvDept ?? ''); setContact(d.recvContact ?? '');
  }, [d.id]); // eslint-disable-line

  if (!own) {
    return (
      <Card>
        <Ey sx={{ mb: '9px' }}>{t('deliverable.recipientDeptTitle')}</Ey>
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
          <Box sx={{ fontSize: 12.5, color: T.dm2 }}>{t('deliverable.recipientDeptNotSet')}</Box>
        )}
      </Card>
    );
  }

  const contactUser = contact ? resolveUser(contact) : null;

  return (
    <>
      <Card>
        <Ey sx={{ mb: '9px' }}>{t('deliverable.recipientDeptTitle')}</Ey>
        <Row>
          <Field label={t('deliverable.departmentLabel')} sx={{ flex: 1, mb: 0 }}>
            <SelectInput
              value={dept}
              onChange={(v) => { setDept(v); setContact(''); }}
              options={[{ value: '', label: t('deliverable.notSet') }, ...RECEIVABLE_DEPARTMENTS.map((dp) => ({ value: dp.id, label: dp.name }))]}
            />
          </Field>
        </Row>
        <Row sx={{ mt: '11px', alignItems: 'flex-end' }}>
          <Field label={t('deliverable.individualContact')} sx={{ flex: 1, mb: 0 }}>
            {contactUser ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '4px 0' }}>
                <UserAvatar user={contactUser} size={24} />
                <Box sx={{ fontSize: 13 }}>{contactUser.name}</Box>
              </Box>
            ) : (
              <Box sx={{ fontSize: 12, color: T.dm2, padding: '8px 0' }}>{t('deliverable.notSet')}</Box>
            )}
          </Field>
          <SirenButton onClick={() => setContactSearchOpen(true)}>
            <Icon name="search" /> {contact ? t('deliverable.changeContact') : t('deliverable.setContact')}
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
          title={t('deliverable.setContactDialogTitle')}
          onClose={() => setContactSearchOpen(false)}
          onConfirm={(knoxId) => { setContact(knoxId); setContactSearchOpen(false); }}
        />
      )}

      <SirenButton
        variant="primary"
        sx={{ mt: '12px' }}
        onClick={() => onSave({ recvDept: dept || null, recvContact: contact || null })}
      >
        <Icon name="check" /> {t('deliverable.save')}
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
