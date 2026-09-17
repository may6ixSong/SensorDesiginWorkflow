import { useState } from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { CalypsoArtifact } from '@/api/calypsoClient';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { Badge } from '@/components/common/SirenButton';
import { CURSOR_POINTER, T } from '@/theme/tokens';

const NETWORK_OPTIONS: readonly ['OA', 'HPC'] = ['OA', 'HPC'];

interface Props {
  a: CalypsoArtifact;
  canEdit: boolean;
  onChange: (network: 'OA' | 'HPC') => void;
  changing: boolean;
}

/**
 * "새 Artifact 추가" 때는 network를 아예 안 물어봤고, 정해진 뒤에는 바꿀 곳이 화면
 * 어디에도 없었다(사용자 지적). Version history 위쪽에 둔다 — edit 권한자는 언제든
 * 바꿀 수 있되, 바꾸면 새 버전이 링크(OA)를 쓸지 경로(HPC)를 쓸지가 달라진다는 걸
 * 확인창으로 반드시 경고한다(사용자 요청, 시스템 언어에 맞춰). File 업로드는 network와
 * 무관하게 항상 가능하므로(사용자 요청) 여기서는 더 이상 "File"이라는 선택지가 없다 —
 * OA/HPC 둘 중 하나만 고른다.
 */
export function NetworkField({ a, canEdit, onChange, changing }: Props) {
  const { t } = useTranslation();
  const current = a.network;
  const [pending, setPending] = useState<'OA' | 'HPC' | null>(null);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: '12px', flexWrap: 'wrap' }}>
      <Box sx={{ fontSize: 11, fontWeight: 600, color: T.dm2 }}>Network</Box>
      {canEdit ? (
        <Box sx={{ display: 'flex', gap: '4px' }}>
          {NETWORK_OPTIONS.map((n) => (
            <Box
              key={n}
              component="button"
              type="button"
              disabled={changing}
              onClick={() => { if (n !== current) setPending(n); }}
              sx={{
                fontSize: 11.5, fontWeight: 600, padding: '4px 9px', borderRadius: '999px',
                cursor: changing ? 'default' : CURSOR_POINTER,
                background: n === current ? T.pr : T.sf,
                color: n === current ? '#fff' : T.dm,
                border: `1px solid ${n === current ? T.pr : T.ln2}`,
              }}
            >
              {n}
            </Box>
          ))}
        </Box>
      ) : (
        current && <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>{current}</Badge>
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
