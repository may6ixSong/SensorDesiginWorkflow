import { ReactNode, useRef, useState } from 'react';
import { Box, CircularProgress, Dialog } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { SheetDocument, SheetSeed } from '@/api/calypsoClient';
import { TextInput } from '@/components/common/Panel';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { toast } from '@/store/toastStore';
import { T } from '@/theme/tokens';
import { SheetHostFrame, SheetHostHandle, SheetSaveResult } from './SheetHostFrame';

export interface SheetSaveAction {
  /** 예: "Save as new version", "Save as new revision" */
  label: string;
  notePlaceholder: string;
  /** Calypso 버전은 한 줄 메모가 필수다. */
  noteRequired: boolean;
  /** 버전에는 사람이 받아볼 .xlsx도 같이 남긴다. template 개정본에는 필요 없다. */
  includeXlsx: boolean;
  submit: (result: SheetSaveResult, note: string) => Promise<void>;
}

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  mode: 'edit' | 'view';
  /** 시작 시트를 불러오는 조회 — react-query 키와 함께 준다. */
  queryKey: readonly unknown[];
  load: () => Promise<{ document: SheetDocument | null; seed: SheetSeed | null }>;
  /** 엑셀 내보내기 파일 이름(확장자 없이). */
  exportName: string;
  save?: SheetSaveAction;
  onClose: () => void;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * sheet 편집 화면(설계서 11장 §4) — 거의 전체 화면 다이얼로그 안에 sheet-host iframe을 띄운다.
 * 시트 안의 편집(서식·병합·필터·붙여넣기)은 전부 iframe 안의 SpreadJS가 하고, 여기는 가져오기·
 * 내보내기·저장 버튼만 둔다. 내용 검사는 하지 않는다(사용자 결정) — 저장한 그대로 올린다.
 */
export function SheetEditorDialog({ title, subtitle, mode, queryKey, load, exportName, save, onClose }: Props) {
  const frame = useRef<SheetHostHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'import' | 'export'>(null);
  const [note, setNote] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);

  const start = useQuery({ queryKey, queryFn: load, retry: false, staleTime: 0, gcTime: 0 });

  const requestClose = () => {
    if (busy) return;
    if (dirty && mode === 'edit') setConfirmClose(true);
    else onClose();
  };

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
    downloadBlob(blob, `${exportName}.xlsx`);
  });

  const onImportPicked = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast('Only .xlsx files can be imported.');
      return;
    }
    void run('import', async () => {
      await frame.current!.importExcel(file);
      setDirty(true);
      toast('Imported — review the sheet, then save.');
    });
  };

  const onSave = () => {
    if (!save) return;
    if (save.noteRequired && !note.trim()) {
      toast('Add a short note for this version.');
      return;
    }
    void run('save', async () => {
      const result = await frame.current!.save(save.includeXlsx);
      await save.submit(result, note.trim());
      setDirty(false);
      onClose();
    });
  };

  const canEdit = mode === 'edit' && loaded && !busy;

  return (
    <Dialog
      open
      onClose={requestClose}
      maxWidth={false}
      PaperProps={{ sx: { width: '96vw', height: '92vh', maxWidth: '96vw', maxHeight: '92vh', m: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.sf } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: `1px solid ${T.ln}`, flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 0, flex: '1 1 240px' }}>
          <Box sx={{ fontSize: 15, fontWeight: 700 }}>{title}</Box>
          {subtitle && <Box sx={{ fontSize: 11.5, color: T.dm2, mt: '2px' }}>{subtitle}</Box>}
        </Box>
        {mode === 'edit' && (
          <>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              style={{ display: 'none' }}
              onChange={(e) => { onImportPicked(e.target.files?.[0]); e.target.value = ''; }}
            />
            <SirenButton disabled={!canEdit} onClick={() => fileInput.current?.click()}>
              {busy === 'import' ? <CircularProgress size={12} /> : <Icon name="up" />} Import Excel
            </SirenButton>
          </>
        )}
        <SirenButton disabled={!loaded || !!busy} onClick={onExport}>
          {busy === 'export' ? <CircularProgress size={12} /> : <Icon name="dn" />} Export Excel
        </SirenButton>
        {save && mode === 'edit' && (
          <>
            <Box sx={{ width: 260 }}>
              <TextInput value={note} onChange={setNote} placeholder={save.notePlaceholder} />
            </Box>
            <SirenButton variant="primary" disabled={!canEdit || (save.noteRequired && !note.trim())} onClick={onSave}>
              {busy === 'save' ? <CircularProgress size={12} sx={{ color: '#fff' }} /> : <Icon name="check" />} {save.label}
            </SirenButton>
          </>
        )}
        <SirenButton variant="ghost" onClick={requestClose} aria-label="Close">
          <Icon name="x" />
        </SirenButton>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {start.isLoading && (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress size={24} /></Box>
        )}
        {start.isError && (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: T.dm }}>
            {(start.error as any)?.response?.data?.message ?? 'Could not load the sheet.'}
          </Box>
        )}
        {start.data && (
          <SheetHostFrame
            ref={frame}
            mode={mode}
            document={start.data.document}
            seed={start.data.seed}
            onLoaded={() => setLoaded(true)}
            onDirty={() => setDirty(true)}
          />
        )}
      </Box>

      {confirmClose && (
        <ConfirmDialog
          title="Discard changes?"
          message="The sheet has changes that are not saved."
          confirmLabel="Discard"
          onCancel={() => setConfirmClose(false)}
          onConfirm={() => { setConfirmClose(false); onClose(); }}
        />
      )}
    </Dialog>
  );
}
