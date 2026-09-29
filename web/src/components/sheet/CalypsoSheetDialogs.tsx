import { ReactNode, useState } from 'react';
import {
  CalypsoArtifact, CalypsoVersionView, addCalypsoSheetVersion, getCalypsoSheetStart, getCalypsoSheetVersion, sheetFileBase,
} from '@/api/calypsoClient';
import { toast } from '@/store/toastStore';
import { SheetEditorDialog } from './SheetEditorDialog';

type Open = { kind: 'edit' } | { kind: 'view'; version: CalypsoVersionView } | null;

/**
 * sheet artifact의 편집/보기 다이얼로그 — 독립 Artifact page와 workflow slide가 같은 걸 쓴다.
 *
 * - 편집: 다음 편집 시작 시트(최신 버전 → 없으면 template → 없으면 빈 시트)를 열고, 저장하면
 *   새 minor 버전이 된다(보통 업로드와 같은 경로·같은 규칙).
 * - 보기: 고른 버전을 읽기 전용으로 연다. 엑셀 내보내기는 된다.
 */
export function useCalypsoSheetDialogs(
  a: CalypsoArtifact | undefined,
  projectId: string,
  onSaved: () => void,
): { openEdit: () => void; openView: (v: CalypsoVersionView) => void; dialogs: ReactNode } {
  const [open, setOpen] = useState<Open>(null);

  let dialogs: ReactNode = null;
  if (a && open?.kind === 'edit') {
    const fromTemplate = a.versionCount === 0 && a.templateKey;
    dialogs = (
      <SheetEditorDialog
        title={a.name}
        subtitle={
          a.latestVersion
            ? `Editing from v${a.latestVersion.versionLabel} — saving adds a new version.`
            : fromTemplate
              ? `Starting from template "${a.templateKey}" (revision ${a.templateRevision}) — saving adds the first version.`
              : 'Starting from a blank sheet — saving adds the first version.'
        }
        mode="edit"
        queryKey={['calypso', 'sheet-start', a.id]}
        load={() => getCalypsoSheetStart(a.id, projectId)}
        exportName={sheetFileBase(a.name)}
        save={{
          label: 'Save as new version',
          notePlaceholder: 'What changed in this version (required)',
          noteRequired: true,
          includeXlsx: true,
          submit: async (result, note) => {
            await addCalypsoSheetVersion(a, projectId, result, note);
            toast('Version added');
            onSaved();
          },
        }}
        onClose={() => setOpen(null)}
      />
    );
  } else if (a && open?.kind === 'view') {
    const v = open.version;
    dialogs = (
      <SheetEditorDialog
        title={`${a.name} · v${v.versionLabel}`}
        subtitle={v.isReleased ? 'Published version — read only.' : 'Working version — read only.'}
        mode="view"
        queryKey={['calypso', 'sheet-version', a.id, v.versionRef]}
        load={() => getCalypsoSheetVersion(a.id, projectId, v.versionRef).then((r) => ({ document: r.document, seed: null }))}
        exportName={`${sheetFileBase(a.name)}-v${v.versionLabel}`}
        onClose={() => setOpen(null)}
      />
    );
  }

  return {
    openEdit: () => setOpen({ kind: 'edit' }),
    openView: (version) => setOpen({ kind: 'view', version }),
    dialogs,
  };
}
