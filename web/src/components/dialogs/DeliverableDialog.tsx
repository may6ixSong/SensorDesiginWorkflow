import { useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { IpBriefDto, PhaseRef, UserDto } from '@/types/domain';
import { CanvasNode, VersionView, fmtAt, hasW, latA, latR, stOf, vstr } from '@/lib/canvasModel';
import { useCanvasStore } from '@/store/canvasStore';
import { toast } from '@/store/toastStore';
import { DEPARTMENTS, RECEIVABLE_DEPARTMENTS, departmentName } from '@/shared/constants/departments';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton, Badge, Chip } from '@/components/common/SirenButton';
import { Card, Ey, Field, Row, SelectInput, TextInput } from '@/components/common/Panel';
import { DocIcon, Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

interface Props {
  node: CanvasNode | null;
  phases: PhaseRef[];
  usersById: Map<string, UserDto>;
  users: UserDto[];
  /** 목업 own = isOwn(ip) && !S.recv */
  own: boolean;
  /** 수신 IP 셀렉트 박스용 — 과제 소속 IP 전체(id/name/color). */
  ipDirectory: IpBriefDto[];
  onClose: () => void;
  onSaveInfo: (p: { name: string; net: 'OA' | 'HPC'; type: string; phaseKeys: string[] }) => void;
  onUpload: (p: { file: string; note: string; net: 'OA' | 'HPC'; type: string }) => void;
  onRelease: () => void;
  onSaveRecv: (p: {
    recvDept: string | null; recvContact: string | null; recvIpId: string | null; sourceDept: string | null;
  }) => void;
  onAddLink: (toId: string) => void;
  onUnlink: (edgeId: string) => void;
}

/** 목업 renderModal()의 산출물 상세 — 개요 / 버전 이력 / 전달 3탭 */
export function DeliverableDialog({
  node: d, phases, usersById, users, own, ipDirectory, onClose,
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
          onAddLink={onAddLink} onUnlink={onUnlink}
        />
      )}
      {tab === 'versions' && <VersionsTab d={d} usersById={usersById} />}
      {tab === 'recv' && (
        <RecvTab d={d} own={own} users={users} usersById={usersById} ipDirectory={ipDirectory} onSave={onSaveRecv} />
      )}
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
  // 받은 산출물(origin==='incoming')로는 링크할 수 없다 — 그건 다른 IP 소유라
  // "내가 그 IP에 준다"는 방향이 되어 의미가 반대가 된다. 그 방향은 캔버스에서
  // incoming 노드의 pin을 직접 끌어 own 노드로 연결하면 된다.
  const linkable = nodes.filter(
    (x) => x.id !== d.id && x.origin !== 'incoming' && !edges.some((e) => e.from === d.id && e.to === x.id),
  );
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
    if (!f) { setErr('Enter a file name or path.'); return; }
    if (fNet === 'HPC' && !f.startsWith('/vwp/')) { setErr('HPC paths must start with /vwp/.'); return; }
    onUpload({ file: f, note: note.trim() || 'Working copy update', net: fNet, type: fNet === 'HPC' ? 'path' : fType });
    setFile(''); setNote('');
  };

  const edgeRow = (e: { id: string; from: string; to: string }, dir: 'in' | 'out') => {
    const other = nodes.find((x) => x.id === (dir === 'out' ? e.to : e.from));
    if (!other) return null;
    const op = phases.find((p) => p.key === other.phase);
    return (
      <Box key={e.id} sx={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: `1px solid ${T.ln}` }}>
        <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm2, width: 52 }}>
          {dir === 'out' ? '→ Next' : '← Previous'}
        </Box>
        <Box sx={{ flex: 1, fontSize: 12.5 }}>
          {other.name}
          {other.seriesTotal > 1 && <Seq>{other.seriesIdx}/{other.seriesTotal}</Seq>}
        </Box>
        <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.dm2 }}>{op?.key ?? '—'}</Box>
        <SirenButton variant="ghost" title="Unlink" onClick={() => onUnlink(e.id)}>
          <Icon name="trash" />
        </SirenButton>
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
            <Field label="Release schedule">
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {phases.map((p) => (
                  <Box
                    key={p.key}
                    component="button"
                    type="button"
                    onClick={() => togglePick(p.key)}
                    sx={{
                      fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, padding: '5px 10px',
                      borderRadius: '7px', transition: '.14s', cursor: CURSOR_POINTER,
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
            <SirenButton variant="primary" onClick={submitInfo}>
              <Icon name="check" /> Save
            </SirenButton>
          </Card>

          <Card sx={{ mb: '12px' }}>
            <Ey sx={{ mb: '9px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Icon name="link" /> Flow links
            </Ey>
            {ins.length + outs.length === 0 ? (
              <Box sx={{ fontSize: 12, color: T.dm2, pb: '8px' }}>No linked deliverables.</Box>
            ) : (
              <>
                {ins.map((e) => edgeRow(e, 'in'))}
                {outs.map((e) => edgeRow(e, 'out'))}
              </>
            )}
            <Row sx={{ mt: '10px' }}>
              <Field label="Link to next deliverable" sx={{ flex: 1, mb: 0 }}>
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
                      : [{ value: '', label: 'No linkable deliverables' }]
                  }
                />
              </Field>
              <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
                <SirenButton
                  disabled={!linkable.length}
                  onClick={() => { const t = lkTgt || linkable[0]?.id; if (t) onAddLink(t); }}
                >
                  <Icon name="plus" /> Link
                </SirenButton>
              </Box>
            </Row>
          </Card>
        </>
      )}

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
            {own ? (work ? fmtAt(work.at) : 'No changes since release') : 'IP owners only'}
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
            <SirenButton disabled={!rel} onClick={() => toast('Downloads will be available once storage is connected')}>
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
                placeholder={fNet === 'HPC' ? '/vwp/cis_a7/<ip>/...' : 'spec_draft.docx'}
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
function VersionsTab({ d, usersById }: { d: CanvasNode; usersById: Map<string, UserDto> }) {
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
            {v.file || '(none)'} · {usersById.get(v.by)?.name ?? '—'} · {fmtAt(v.at)}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/* ── 전달 탭 ── */
function RecvTab({
  d, own, users, usersById, ipDirectory, onSave,
}: {
  d: CanvasNode; own: boolean; users: UserDto[];
  usersById: Map<string, UserDto>; ipDirectory: IpBriefDto[]; onSave: Props['onSaveRecv'];
}) {
  const [dept, setDept] = useState(d.recvDept ?? '');
  const [contact, setContact] = useState(d.recvContact ?? '');
  const [recvIp, setRecvIp] = useState(d.recvIpId ?? '');
  const [sourceDept, setSourceDept] = useState(d.sourceDept ?? '');
  useEffect(() => {
    setDept(d.recvDept ?? ''); setContact(d.recvContact ?? ''); setRecvIp(d.recvIpId ?? '');
    setSourceDept(d.sourceDept ?? '');
  }, [d.id]); // eslint-disable-line

  const ipById = new Map(ipDirectory.map((ip) => [ip.id, ip]));
  const otherIps = ipDirectory.filter((ip) => ip.id !== d.ip);
  const recvIpInfo = d.recvIpId ? ipById.get(d.recvIpId) : undefined;

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
                  <UserAvatar user={usersById.get(d.recvContact)} size={24} />
                  <Box sx={{ fontSize: 13 }}>{usersById.get(d.recvContact)?.name}</Box>
                </>
              )}
            </Box>
          ) : (
            <Box sx={{ fontSize: 12.5, color: T.dm2 }}>No recipient department set.</Box>
          )}
        </Card>
        <Card sx={{ mb: '12px' }}>
          <Ey sx={{ mb: '9px' }}>Recipient IP</Ey>
          {recvIpInfo ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 0' }}>
              <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: recvIpInfo.color }} />
              <Box sx={{ fontSize: 13 }}>{recvIpInfo.name}</Box>
            </Box>
          ) : (
            <Box sx={{ fontSize: 12.5, color: T.dm2 }}>No recipient IP set.</Box>
          )}
        </Card>
        <Card>
          <Ey sx={{ mb: '9px' }}>Received from</Ey>
          {d.sourceDept ? (
            <Box sx={{ fontSize: 13, padding: '9px 0' }}>{d.sourceDept}</Box>
          ) : (
            <Box sx={{ fontSize: 12.5, color: T.dm2 }}>Not marked as received from anywhere.</Box>
          )}
        </Card>
      </>
    );
  }

  // 부서를 지정하면 그 부서 소속자만 후보로 (UX 편의 — 실제 검증은 BE, 설계서 3.4)
  const contacts = users.filter((u) => !dept || u.department === dept);

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
        <Row sx={{ mt: '11px' }}>
          <Field label="Individual contact" sx={{ flex: 1, mb: 0 }}>
            <SelectInput
              value={contact}
              onChange={setContact}
              options={[
                { value: '', label: 'Not set' },
                ...contacts.map((u) => ({ value: u.id, label: `${u.name} · ${departmentName(u.department)}` })),
              ]}
            />
          </Field>
        </Row>
      </Card>

      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '9px' }}>Recipient IP</Ey>
        <Box sx={{ fontSize: 11.5, color: T.dm2, mb: '9px' }}>
          Set another Analog IP that should receive this deliverable — it'll show up on that
          IP's board as "Incoming from other IPs", showing only the version you release.
        </Box>
        <Field label="IP" sx={{ mb: 0 }}>
          <SelectInput
            value={recvIp}
            onChange={setRecvIp}
            options={[
              { value: '', label: 'Not set' },
              ...otherIps.map((ip) => ({ value: ip.id, label: ip.name })),
            ]}
          />
        </Field>
      </Card>

      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '9px' }}>Received from (external department)</Ey>
        <Box sx={{ fontSize: 11.5, color: T.dm2, mb: '9px' }}>
          Mark this as something handed to you from a department that doesn't use this system
          (e.g. a foundry or vendor). It stays your own deliverable — position it in any Phase(s)
          just like anything else you own.
        </Box>
        <Field label="Department" sx={{ mb: 0 }}>
          <TextInput value={sourceDept} onChange={setSourceDept} placeholder="e.g. Foundry" />
        </Field>
      </Card>

      <SirenButton
        variant="primary"
        onClick={() => onSave({
          recvDept: dept || null, recvContact: contact || null, recvIpId: recvIp || null,
          sourceDept: sourceDept.trim() || null,
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
