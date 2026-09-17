import { useState } from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { CalypsoArtifact } from '@/api/calypsoClient';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { Badge } from '@/components/common/SirenButton';
import { CURSOR_POINTER, T } from '@/theme/tokens';

type ContentKind = 'file' | 'oa' | 'hpc';
const KIND_LABEL: Record<ContentKind, string> = { file: 'File', oa: 'Link (OA)', hpc: 'Path (HPC)' };

function kindOf(network: 'OA' | 'HPC' | null): ContentKind {
  return network === 'OA' ? 'oa' : network === 'HPC' ? 'hpc' : 'file';
}

interface Props {
  a: CalypsoArtifact;
  canEdit: boolean;
  onChange: (kind: ContentKind) => void;
  changing: boolean;
}

/**
 * "새 Artifact 추가" 때는 network를 아예 안 물어봤고(콘텐츠 종류는 첫 버전에서 정한다는
 * 예전 설계), 정해진 뒤에는 바꿀 곳이 화면 어디에도 없었다(사용자 지적). Version
 * history 위쪽에 둔다 — edit 권한자는 언제든 바꿀 수 있되, 바꾸면 버전 화면 구성이
 * 달라진다는 걸 확인창으로 반드시 경고한다(사용자 요청, 시스템 언어에 맞춰).
 */
export function NetworkField({ a, canEdit, onChange, changing }: Props) {
  const { t } = useTranslation();
  const current = kindOf(a.network);
  const [pending, setPending] = useState<ContentKind | null>(null);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: '12px', flexWrap: 'wrap' }}>
      <Box sx={{ fontSize: 11, fontWeight: 600, color: T.dm2 }}>Network</Box>
      {canEdit ? (
        <Box sx={{ display: 'flex', gap: '4px' }}>
          {(Object.keys(KIND_LABEL) as ContentKind[]).map((k) => (
            <Box
              key={k}
              component="button"
              type="button"
              disabled={changing}
              onClick={() => { if (k !== current) setPending(k); }}
              sx={{
                fontSize: 11.5, fontWeight: 600, padding: '4px 9px', borderRadius: '999px',
                cursor: changing ? 'default' : CURSOR_POINTER,
                background: k === current ? T.pr : T.sf,
                color: k === current ? '#fff' : T.dm,
                border: `1px solid ${k === current ? T.pr : T.ln2}`,
              }}
            >
              {KIND_LABEL[k]}
            </Box>
          ))}
        </Box>
      ) : (
        <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>{KIND_LABEL[current]}</Badge>
      )}

      {pending && (
        <ConfirmDialog
          title={t('artifact.networkChangeTitle')}
          message={t('artifact.networkChangeMessage')}
          warning={t('artifact.networkChangeWarning')}
          confirmLabel={t('artifact.networkChangeConfirm')}
          danger={false}
          busy={changing}
          onCancel={() => setPending(null)}
          onConfirm={() => { onChange(pending); setPending(null); }}
        />
      )}
    </Box>
  );
}
