import { ReactNode } from 'react';
import { Box, Dialog } from '@mui/material';
import { T } from '@/theme/tokens';
import { AcroButton } from './AcroButton';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  width?: number | string;
  header: ReactNode;
  /** 헤더 아래 탭 등 고정 영역 */
  belowHeader?: ReactNode;
  children: ReactNode;
}

/**
 * 목업 .scrim/.modal/.mh/.mb 구조.
 * 헤더는 흰 배경(.mh), 본문은 옅은 배경(.mb)에 스크롤.
 */
export function ModalShell({ open, onClose, width = 640, header, belowHeader, children }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          width,
          maxWidth: '96vw',
          maxHeight: '90vh',
          background: T.sf,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          m: 2,
        },
      }}
    >
      <Box sx={{ padding: '15px 20px 0', flex: '0 0 auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>{header}</Box>
          <AcroButton variant="ghost" onClick={onClose} aria-label="닫기">
            <Icon name="x" />
          </AcroButton>
        </Box>
        {belowHeader}
      </Box>
      <Box sx={{ padding: '15px 20px 20px', overflowY: 'auto', background: T.sf2, flex: 1 }}>
        {children}
      </Box>
    </Dialog>
  );
}
