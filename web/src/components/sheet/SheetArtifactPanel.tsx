import { useRef, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import {
  CalypsoArtifact, CalypsoVersionView, getCalypsoSheetStart, getCalypsoSheetVersion, saveCalypsoSheet, sheetFileBase,
} from '@/api/calypsoClient';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { UserAvatar } from '@/components/common/Avatar';
import { Badge, SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { isRichTextEmpty } from '@/components/common/RichTextEditor';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { toast } from '@/store/toastStore';
import { FONT_MONO, T } from '@/theme/tokens';
import { SheetHostFrame, SheetHostHandle } from './SheetHostFrame';

/** 버전 트리의 latest 행이 쓰는 가짜 versionRef — Calypso 버전 ref(`calypso:…`)와 겹치지 않는다. */
export const SHEET_LATEST_REF = '__sheet_latest__';

function fmtAt(iso: string): string {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime()) || t.getTime() === 0) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
}

/** 버전 트리 맨 위에 얹는 latest 행 — 정식 버전이 아니라 트리에서 고르는 손잡이일 뿐이다. */
export function sheetLatestRow(a: CalypsoArtifact): CalypsoVersionView | null {
  const l = a.sheetLatest;
  if (!l) return null;
  return {
    versionLabel: l.label,
    isReleased: false,
    versionRef: SHEET_LATEST_REF,
    files: [],
    links: [],
    paths: [],
    versionNote: !l.saved
      ? 'Not saved yet'
      : l.hasUnpublishedChanges ? 'Saved — not published yet' : 'Same as the last published version',
    description: '',
    createdBy: l.updatedBy,
    createdAt: l.updatedAt,
  };
}

interface Props {
  a: CalypsoArtifact;
  projectId: string;
  /** 지금 보이는 것 — latest 행(SHEET_LATEST_REF)이면 편집, published 버전이면 읽기 전용. */
  selected: CalypsoVersionView | null;
  /** 저장 안 한 변경이 생기거나 없어질 때 — 호출부가 다른 버전으로 옮기기·Publish 전에 확인한다. */
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
}

/**
 * sheet artifact의 본문(설계서 11장 §4) — 카드 대신 시트 자체를 이 영역 전체에 띄운다.
 *
 * - latest(`v0+`, `v2.0+`): edit 권한자만. 고치고 **Save**(확인 후 덮어쓰기)한다 — 버전이 생기지 않는다.
 * - published 버전: 그 버전의 시트를 읽기 전용으로. Version Note·Description을 위에 같이 보여준다.
 * - 어느 쪽이든 마지막으로 저장(발행)한 사람과 시각을 머리글에 둔다.
 */
export function SheetArtifactPanel({ a, projectId, selected, onDirtyChange, onSaved }: Props) {
  const { resolveUser } = useDirectory();
  const frame = useRef<SheetHostHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'import' | 'export'>(null);
  const [confirmSave, setConfirmSave] = useState(false);

  const isLatest = selected?.versionRef === SHEET_LATEST_REF;
  const canEdit = isLatest && a.myAccess === 'edit';

  const markDirty = (v: boolean) => {
    setDirty(v);
    onDirtyChange(v);
  };

  const latest = useQuery({
    queryKey: ['calypso', 'sheet-latest', a.id],
    queryFn: () => getCalypsoSheetStart(a.id, projectId),
    enabled: isLatest,
    retry: false,
  });
  const version = useQuery({
    queryKey: ['calypso', 'sheet-version', a.id, selected?.versionRef],
    queryFn: () => getCalypsoSheetVersion(a.id, projectId, selected!.versionRef),
    enabled: !!selected && !isLatest,
    retry: false,
    staleTime: Infinity, // published 버전은 바뀌지 않는다
  });
  const q = isLatest ? latest : version;
  // 다른 버전을 고른 뒤 데이터가 오기 전까지는 직전 시트를 그대로 둔다 — 비우면 iframe이 새로 만들어진다.
  const shownRef = useRef<{ content: { document: any; seed: any }; loadKey: string } | null>(null);
  if (q.data && selected) {
    shownRef.current = {
      content: { document: q.data.document, seed: 'seed' in q.data ? q.data.seed : null },
      // 같은 대상을 다시 받아와도(저장 직후 등) 새로 load되게 받아온 시각까지 키에 넣는다.
      loadKey: `${selected.versionRef}:${q.dataUpdatedAt}`,
    };
  }
  const shown = shownRef.current;

  const run = async (kind: 'save' | 'import' | 'export', fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (e: any) {
      toast(e?.response?.data?.message ?? e?.message ?? 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const onExport = () => run('export', async () => {
    const blob = await frame.current!.exportExcel();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sheetFileBase(a.name)}-v${selected?.versionLabel ?? ''}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  const onImportPicked = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast('Only .xlsx files can be imported.');
      return;
    }
    void run('import', async () => {
      await frame.current!.importExcel(file);
      markDirty(true);
      toast('Imported — review the sheet, then Save.');
    });
  };

  const doSave = () => {
    setConfirmSave(false);
    void run('save', async () => {
      const result = await frame.current!.save(true);
      await saveCalypsoSheet(a, projectId, result);
      markDirty(false);
      toast('Saved');
      onSaved();
      void latest.refetch();
    });
  };

  if (!selected) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.dm2, fontSize: 12.5 }}>
        Nothing published yet.
      </Box>
    );
  }

  const by = resolveUser(isLatest ? (latest.data?.updatedBy ?? selected.createdBy) : selected.createdBy);
  const at = isLatest ? (latest.data?.updatedAt ?? selected.createdAt) : selected.createdAt;
  const accent = isLatest ? T.warn : T.pr;
  const showNotes = !isLatest && (selected.versionNote || !isRichTextEmpty(selected.description));

  return (
    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: T.sf }}>
      {/* 머리글 — 버전, 마지막으로 저장(발행)한 사람·시각, 동작 버튼 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderBottom: `1px solid ${T.ln}`, flexWrap: 'wrap' }}>
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 18, fontWeight: 600, color: accent }}>v{selected.versionLabel}</Box>
        {isLatest
          ? <Badge color={T.warn} bg={T.warnSoft} borderColor={T.warnLine}>LATEST</Badge>
          : <Badge color={T.pr} bg={T.prSoft} borderColor={T.prLine}>PUBLISHED · READ ONLY</Badge>}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserAvatar user={by} size={24} />
          <Box>
            <Box sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{by.name}</Box>
            <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, color: T.dm2 }}>
              {isLatest ? (a.sheetLatest?.saved ? 'Last saved' : 'Created') : 'Published'} {fmtAt(at)}
            </Box>
          </Box>
        </Box>
        <Box sx={{ flex: 1 }} />
        {canEdit && (
          <>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              style={{ display: 'none' }}
              onChange={(e) => { onImportPicked(e.target.files?.[0]); e.target.value = ''; }}
            />
            <SirenButton disabled={!loaded || !!busy} onClick={() => fileInput.current?.click()}>
              {busy === 'import' ? <CircularProgress size={12} /> : <Icon name="up" />} Import Excel
            </SirenButton>
          </>
        )}
        <SirenButton disabled={!loaded || !!busy} onClick={onExport}>
          {busy === 'export' ? <CircularProgress size={12} /> : <Icon name="dn" />} Export Excel
        </SirenButton>
        {canEdit && (
          <SirenButton variant="primary" disabled={!loaded || !!busy} onClick={() => setConfirmSave(true)}>
            {busy === 'save' ? <CircularProgress size={12} sx={{ color: '#fff' }} /> : <Icon name="check" />} Save
            {dirty ? ' *' : ''}
          </SirenButton>
        )}
      </Box>

      {/* published 버전이면 그때의 Version Note·Description */}
      {showNotes && (
        <Box sx={{ padding: '10px 16px', borderBottom: `1px solid ${T.ln}`, background: T.sf2, maxHeight: 160, overflowY: 'auto' }}>
          {selected.versionNote && (
            <Box sx={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{selected.versionNote}</Box>
          )}
          {!isRichTextEmpty(selected.description) && (
            <Box
              // description은 HTML로 저장된다 — 꽂기 전에 반드시 sanitize한다.
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.description) }}
              sx={{
                mt: '4px', fontSize: 12.5, lineHeight: 1.7, color: T.tx2,
                '& p': { margin: '0 0 4px 0' }, '& p:last-child': { mb: 0 },
                '& ul, & ol': { paddingLeft: '20px', margin: '4px 0' },
                '& a': { color: T.pr },
              }}
            />
          )}
        </Box>
      )}

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {q.isError && (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: T.dm }}>
            {(q.error as any)?.response?.data?.message ?? 'Could not load the sheet.'}
          </Box>
        )}
        {!q.isError && !shown && (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress size={24} /></Box>
        )}
        {/* iframe은 한 번만 만든다 — 버전을 바꾸면 loadKey로 그 자리에서 다시 load한다. */}
        {!q.isError && shown && (
          <SheetHostFrame
            ref={frame}
            mode={canEdit ? 'edit' : 'view'}
            document={shown.content.document}
            seed={shown.content.seed}
            loadKey={shown.loadKey}
            onLoaded={() => { setLoaded(true); markDirty(false); }}
            onDirty={() => { if (canEdit) markDirty(true); }}
          />
        )}
      </Box>

      {confirmSave && (
        <ConfirmDialog
          title="Save the latest sheet?"
          message={`This overwrites the latest sheet (v${selected.versionLabel}). Published versions are not changed.`}
          confirmLabel="Save"
          danger={false}
          onCancel={() => setConfirmSave(false)}
          onConfirm={doSave}
        />
      )}
    </Box>
  );
}
