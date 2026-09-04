import { useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { WorkflowPhase } from '@/types/domain';
import { shortDate } from '@/lib/schedule';
import {
  CanvasNode, VersionView, fmtAt, hasW, isOrphanPhase, latA, latR, stOf, vstr,
} from '@/lib/canvasModel';
import { useCanvasStore } from '@/store/canvasStore';
import { useArtifactServices } from '@/api/hooks/useHub';
import { RECEIVABLE_DEPARTMENTS, departmentName } from '@/shared/constants/departments';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { UserSearchDialog } from '@/components/dialogs/UserSearchDialog';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { SlidePanel } from '@/components/common/SlidePanel';
import { VersionTree } from '@/components/deliverable/VersionTree';
import { VersionContents } from '@/components/deliverable/VersionContents';
import { SirenButton, Badge } from '@/components/common/SirenButton';
import { Card, Ey, Field, Row, SelectInput, TextInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { FONT_MONO, T } from '@/theme/tokens';

/**
 * 삭제는 이 phase에 걸린 산출물 사본 하나만 지운다(다른 phase의 사본에는 영향 없음) —
 * 그 의미를 시스템 언어와 무관하게 항상 영어로 고정 표시한다(사용자 요청).
 */
const DELETE_LABEL = 'Delete artifact for this phase';

export interface AssertVersionInput {
  versionLabel: string;
  note: string;
  isReleased: boolean;
}

interface Props {
  node: CanvasNode | null;
  phases: WorkflowPhase[];
  /** 목업 own = isOwn(workflow) && !S.recv */
  own: boolean;
  onClose: () => void;
  onSaveInfo: (p: {
    name: string; artifactKey: string | null;
    serviceKey: string | null; externalArtifactId: string | null;
  }) => void;
  /** C/D 티어 수동 버전 기록 — 연동된 서비스가 없는 산출물에서만 쓴다. */
  onAssertVersion: (p: AssertVersionInput) => void;
  /** 가장 최근 작업본을 릴리스로 승격 — note를 함께 남긴다. */
  onRelease: (note: string) => void;
  onSaveRecv: (p: { recvDept: string | null; recvContact: string | null }) => void;
  /** 삭제 확인 후 호출된다 — 실제 삭제 API 호출과 dialog 닫기는 호출부(BoardPage) 책임. */
  onDelete: () => void;
}

/**
 * 산출물 상세 — 우측에서 슬라이드로 열리는 패널(SlidePanel). 탭으로 나누지 않고
 * A|B 두 컬럼을 한 화면에 동시에 보여준다(사용자 요청) — 3:1.
 *
 *  A(왼쪽, 넓게) = 지금 고른 버전의 내용(문서면) + (내가 편집 가능하면) 버전 기록 폼.
 *    "업로드"는 여기 있다 — 예전엔 오른쪽 탭 안에 있었는데, 내용을 보는 자리와
 *    새 버전을 남기는 자리가 같은 컬럼에 있는 게 자연스럽다.
 *  B(오른쪽, 좁게) = 요약 배지 → 버전 트리 → 기본 정보 편집 → 연결 → 전달, 전부
 *    한 번에 스크롤되는 하나의 레일. 버전 이력도 더 이상 별도 탭이 아니라 이 레일
 *    안에서 트리 형태로 바로 보인다.
 *
 * flow(연결)는 여기서 만들거나 지우지 않는다(사용자 요청) — 연결은 캔버스에서 pin을 끌어
 * 잇는 것으로만 하고, 이 화면에는 "무엇과 이어져 있는지" 읽기 전용 목록만 남긴다.
 */
export function DeliverableDialog({
  node: d, phases, own, onClose,
  onSaveInfo, onAssertVersion, onRelease, onSaveRecv, onDelete,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  /** 내용 면에 띄울 버전 — 트리에서 고른 것. 산출물이 바뀌면 최신으로 되돌린다. */
  const [picked, setPicked] = useState<VersionView | null>(null);

  useEffect(() => setPicked(null), [d?.id]);

  if (!d) return null;
  const ph = phases.find((p) => p.id === d.phase);
  const orphan = isOrphanPhase(phases, d.phase);
  const st = stOf(d);
  const received = d.intent === 'received';
  const shown = picked ?? (own ? latA(d) : latR(d));
  /** 실물을 소유한 서비스가 붙어 있으면 버전은 그쪽에서 올라온다 — SIREN에서 못 쓴다(§1.2). */
  const canRecord = own && !received && !d.serviceKey;
  /**
   * "Open in Artifact page" — 지금은 Calypso만 SIREN 안에 실제 상세 페이지가 있다
   * (설계서 §11.5). 다른 서비스는 아직 그 화면이 없어 링크를 내지 않는다.
   */
  const canOpenArtifactPage = d.serviceKey === 'calypso' && !!d.externalArtifactId;

  return (
    <SlidePanel
      open
      onClose={onClose}
      header={
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '11px' }}>
          <Box component="span" sx={{ color: d.serviceKey ? T.tl : T.bl, mt: '4px' }}>
            <Icon name={d.serviceKey ? 'link' : 'word'} size={18} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Ey>{ph ? `${ph.name} · ${shortDate(ph.start)} → ${shortDate(ph.end)}` : 'No release schedule'}</Ey>
            <Box sx={{ fontSize: 19, fontWeight: 700, mt: '3px', letterSpacing: '-.015em' }}>{d.name}</Box>
          </Box>
          <Box sx={{ display: 'flex', gap: '5px', mt: '5px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {orphan && <Badge color={T.rd} bg={T.rd2} borderColor={T.rd3}>Schedule lost</Badge>}
            <Badge color={st.c} bg={st.bg} borderColor={st.bd}>{st.lb}</Badge>
            {d.serviceKey ? (
              <Badge color={T.tl} bg={T.tl2} borderColor={T.tl3}>{d.serviceKey.toUpperCase()}</Badge>
            ) : (
              <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>Unlinked</Badge>
            )}
          </Box>
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
      {/* A — 내용 + (편집 가능하면) 버전 기록 */}
      <Box
        sx={{
          flex: 3, minWidth: 0, overflowY: 'auto', background: T.sf3, padding: '22px',
          borderRight: `1px solid ${T.ln}`, display: 'flex',
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 660, mx: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <VersionContents d={d} version={shown} />
          {canRecord && (
            <RecordVersionCard
              latest={hasW(d) ? latA(d) : null}
              onAssertVersion={onAssertVersion}
              onRelease={onRelease}
            />
          )}
        </Box>
      </Box>

      {/* B — 요약 / 버전 트리 / 기본 정보 / 연결 / 전달, 탭 없이 한 레일 */}
      <Box sx={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', background: T.sf2 }}>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <VersionSummary d={d} own={own} />

          {canOpenArtifactPage && (
            <SirenButton
              variant="primary"
              onClick={() => navigate(`/artifacts/${d.externalArtifactId}`)}
            >
              <Icon name="expand" /> Open in Artifact page
            </SirenButton>
          )}

          <Card>
            <Ey sx={{ mb: '9px' }}>Version history</Ey>
            <VersionTree versions={d.versions} selected={shown} onSelect={setPicked} />
          </Card>

          {own && (
            <BasicInfoCard
              d={d} phases={phases} nodes={nodes} onSaveInfo={onSaveInfo}
            />
          )}

          <FlowLinksCard d={d} phases={phases} nodes={nodes} edges={edges} />

          {!received && <HandoffSection d={d} own={own} onSave={onSaveRecv} />}
        </Box>
      </Box>

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
    </SlidePanel>
  );
}

/* ── A: 버전 기록 폼 (구 Overview 탭 "Record a version") ── */
function RecordVersionCard({
  latest, onAssertVersion, onRelease,
}: {
  latest: VersionView | null;
  onAssertVersion: Props['onAssertVersion'];
  onRelease: Props['onRelease'];
}) {
  const [vLabel, setVLabel] = useState('');
  const [vNote, setVNote] = useState('');
  const [vErr, setVErr] = useState('');

  const submitVersion = (isReleased: boolean) => {
    const label = vLabel.trim();
    if (!label) { setVErr('Enter a version label.'); return; }
    setVErr('');
    onAssertVersion({ versionLabel: label, note: vNote.trim(), isReleased });
    setVLabel(''); setVNote('');
  };

  return (
    <Card>
      <Ey sx={{ mb: '9px' }}>Record a version</Ey>
      <Row>
        <Field label="Version" sx={{ flex: '0 0 130px' }}>
          <TextInput
            value={vLabel}
            onChange={(v) => { setVLabel(v); setVErr(''); }}
            error={!!vErr}
            placeholder="e.g. 1.2"
          />
        </Field>
        <Field label="Note" sx={{ flex: 1 }}>
          <TextInput value={vNote} onChange={setVNote} placeholder="What changed in this version" />
        </Field>
      </Row>
      {vErr && <Box sx={{ fontSize: 11, color: T.rd, margin: '-5px 0 9px' }}>{vErr}</Box>}
      <Box sx={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
        <SirenButton onClick={() => submitVersion(false)}>
          <Icon name="up" /> Save working
        </SirenButton>
        <SirenButton variant="primary" onClick={() => submitVersion(true)}>
          <Icon name="send" /> Save & release
        </SirenButton>
      </Box>
      {latest && (
        <Box sx={{ mt: '10px', paddingTop: '10px', borderTop: `1px solid ${T.ln}` }}>
          <SirenButton
            onClick={() => { onRelease(vNote.trim()); setVNote(''); }}
            sx={{ color: T.tl, borderColor: T.tl3 }}
          >
            <Icon name="send" /> Release {vstr(latest)} as-is
          </SirenButton>
        </Box>
      )}
    </Card>
  );
}

/* ── B: 버전 요약 배지 ── */
function VersionSummary({ d, own }: { d: CanvasNode; own: boolean }) {
  const rel = latR(d);
  const work = hasW(d) ? latA(d) : null;
  return (
    <Row>
      <Card sx={{ flex: 1, minWidth: 0 }}>
        <Ey>Recipient sees</Ey>
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 17, fontWeight: 600, color: T.tl, mt: '5px' }}>
          {rel ? vstr(rel) : '—'}
        </Box>
        <Box sx={{ fontSize: 10, color: T.dm2, mt: '3px' }}>{rel ? fmtAt(rel.at) : 'No release yet'}</Box>
      </Card>
      <Card sx={{ flex: 1, minWidth: 0, opacity: own ? 1 : 0.5 }}>
        <Ey>Working copy</Ey>
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 17, fontWeight: 600, color: T.am, mt: '5px', display: 'flex', alignItems: 'center' }}>
          {own ? (work ? vstr(work) : 'None') : <Icon name="lock" />}
        </Box>
        <Box sx={{ fontSize: 10, color: T.dm2, mt: '3px' }}>
          {own ? (work ? fmtAt(work.at) : 'No changes since release') : 'owners only'}
        </Box>
      </Card>
    </Row>
  );
}

/* ── B: 기본 정보 편집 (Artifact key는 더 이상 보여주지 않는다 — 사용자 요청) ── */
function BasicInfoCard({
  d, phases, nodes, onSaveInfo,
}: {
  d: CanvasNode; phases: WorkflowPhase[]; nodes: CanvasNode[];
  onSaveInfo: Props['onSaveInfo'];
}) {
  const { data: services } = useArtifactServices();
  const rev = useCanvasStore((s) => s.rev);
  const sid = d.series || d.id;
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
  const [serviceKey, setServiceKey] = useState(d.serviceKey ?? '');
  const [externalArtifactId, setExternalArtifactId] = useState(d.externalArtifactId ?? '');
  const [nameErr, setNameErr] = useState(false);
  const orphan = isOrphanPhase(phases, d.phase);

  useEffect(() => {
    setName(d.name); setServiceKey(d.serviceKey ?? ''); setExternalArtifactId(d.externalArtifactId ?? '');
  }, [d.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (!name.trim()) { setNameErr(true); return; }
    // artifactKey는 더 이상 이 화면에서 편집하지 않는다 — 있던 값을 그대로 들고 저장한다.
    onSaveInfo({
      name: name.trim(), artifactKey: d.artifactKey,
      serviceKey: serviceKey || null, externalArtifactId: externalArtifactId.trim() || null,
    });
  };

  return (
    <Card>
      <Ey sx={{ mb: '9px' }}>Edit basic info</Ey>
      <Field label="Name">
        <TextInput value={name} onChange={(v) => { setName(v); setNameErr(false); }} error={nameErr} />
      </Field>
      <Field label="Source — the registered system this artifact lives in">
        <SelectInput
          value={serviceKey}
          onChange={setServiceKey}
          options={[
            { value: '', label: 'Not linked — record versions here' },
            ...(services ?? []).map((s) => ({ value: s.key, label: s.name })),
          ]}
        />
      </Field>
      <Field label="External artifact ID — optional" sx={{ mb: '12px' }}>
        <TextInput
          value={externalArtifactId}
          onChange={setExternalArtifactId}
          placeholder="its id in that system"
        />
      </Field>
      <SirenButton variant="primary" onClick={submit}>
        <Icon name="check" /> Save
      </SirenButton>

      <Field label="Release schedule" sx={{ mt: '13px', mb: 0 }}>
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
                fontFamily: FONT_MONO, fontSize: 10.5, fontWeight: 600, padding: '4px 9px',
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
  );
}

/* ── B: Flow links — 읽기 전용 ── */
function FlowLinksCard({
  d, phases, nodes, edges,
}: {
  d: CanvasNode; phases: WorkflowPhase[]; nodes: CanvasNode[];
  edges: ReturnType<typeof useCanvasStore.getState>['edges'];
}) {
  const outs = edges.filter((e) => e.from === d.id);
  const ins = edges.filter((e) => e.to === d.id);

  const edgeRow = (e: { id: string; from: string; to: string }, dir: 'in' | 'out') => {
    const other = nodes.find((x) => x.id === (dir === 'out' ? e.to : e.from));
    if (!other) return null;
    const op = phases.find((p) => p.id === other.phase);
    return (
      <Box key={e.id} sx={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: `1px solid ${T.ln}` }}>
        <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 10, color: T.dm2, width: 46, flex: '0 0 46px' }}>
          {dir === 'out' ? '→ Next' : '← Prev'}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>{other.name}</Box>
        <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 10, color: op ? T.dm2 : T.rd }}>
          {op?.name ?? 'no schedule'}
        </Box>
      </Box>
    );
  };

  return (
    <Card>
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
    </Card>
  );
}

/* ── B: 전달 — own = 이 workflow가 만들어 남에게 준다(outgoing) — 전달 받을 부서(+
 * 개별 담당자)만 남긴다(사용자 요청). 탭이 아니라 이 산출물이 받는 게 아닌 이상(own
 * 여부와 무관하게) 항상 보이는 섹션이다. ── */
function HandoffSection({ d, own, onSave }: { d: CanvasNode; own: boolean; onSave: Props['onSaveRecv'] }) {
  const { t } = useTranslation();
  const { resolveUser } = useDirectory();
  const [dept, setDept] = useState(d.recvDept ?? '');
  const [contact, setContact] = useState(d.recvContact ?? '');
  const [contactSearchOpen, setContactSearchOpen] = useState(false);
  useEffect(() => {
    setDept(d.recvDept ?? ''); setContact(d.recvContact ?? '');
  }, [d.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <Card>
      <Ey sx={{ mb: '9px' }}>{t('deliverable.recipientDeptTitle')}</Ey>
      <Field label={t('deliverable.departmentLabel')} sx={{ mb: '11px' }}>
        <SelectInput
          value={dept}
          onChange={(v) => { setDept(v); setContact(''); }}
          options={[{ value: '', label: t('deliverable.notSet') }, ...RECEIVABLE_DEPARTMENTS.map((dp) => ({ value: dp.id, label: dp.name }))]}
        />
      </Field>
      <Field label={t('deliverable.individualContact')} sx={{ mb: '9px' }}>
        {contactUser ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '4px 0' }}>
            <UserAvatar user={contactUser} size={24} />
            <Box sx={{ flex: 1, minWidth: 0, fontSize: 13 }}>{contactUser.name}</Box>
            <SirenButton variant="ghost" onClick={() => setContact('')}>
              <Icon name="x" />
            </SirenButton>
          </Box>
        ) : (
          <Box sx={{ fontSize: 12, color: T.dm2, padding: '6px 0' }}>{t('deliverable.notSet')}</Box>
        )}
      </Field>
      <SirenButton onClick={() => setContactSearchOpen(true)}>
        <Icon name="search" /> {contact ? t('deliverable.changeContact') : t('deliverable.setContact')}
      </SirenButton>

      {contactSearchOpen && (
        <UserSearchDialog
          title={t('deliverable.setContactDialogTitle')}
          onClose={() => setContactSearchOpen(false)}
          onConfirm={(knoxId) => { setContact(knoxId); setContactSearchOpen(false); }}
        />
      )}

      <Box sx={{ mt: '12px' }}>
        <SirenButton
          variant="primary"
          onClick={() => onSave({ recvDept: dept || null, recvContact: contact || null })}
        >
          <Icon name="check" /> {t('deliverable.save')}
        </SirenButton>
      </Box>
    </Card>
  );
}
