import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Dialog, DialogContent, DialogTitle, List, ListItemButton, ListItemText, Popover, Typography } from '@mui/material';
import { formatDistanceToNow } from 'date-fns';
import { Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, T } from '@/theme/tokens';
import { NoticeService, getUnreadNotices, markNoticeRead } from '@/service/notice-service';
import { useSignalRNotice } from '@/hooks/useSignalRNotice';
import type { Notice } from '@/types/notice';

/**
 * Bell icon + popover, backed by SYSTEM_API. Ported from SIREN web's
 * NoticeBell — only the app tag ('Calypso' instead of 'SIREN') differs.
 */
export function NoticeBell({ clientId }: { clientId: string }) {
  const { t } = useTranslation();
  const btnRef = useRef<HTMLButtonElement>(null);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [selected, setSelected] = useState<Notice | null>(null);

  useEffect(() => {
    const noticeService = new NoticeService();
    Promise.all([noticeService.getNoticesByStatus('Calypso', 'posting')])
      .then(([notices]) => {
        setNotices(notices);
        setUnreadCount(getUnreadNotices(notices).length);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = () => setUnreadCount((prev) => Math.max(0, prev - 1));
    window.addEventListener('sdp:notice-read', handler);
    return () => window.removeEventListener('sdp:notice-read', handler);
  }, []);

  const handleNoticeRead = useCallback((notice: Notice) => {
    markNoticeRead(notice);
    setUnreadCount((prev) => Math.max(0, prev - 1));
    setSelected(notice);
    setNoticeOpen(false);
  }, []);

  const toggleNotice = useCallback(() => {
    if (noticeOpen) {
      setNoticeOpen(false);
      return;
    }
    setNoticeOpen(true);
  }, [noticeOpen]);

  useSignalRNotice({
    enabled: Boolean(import.meta.env.SYSTEM_API),
    clientId,
    systemApiBaseUrl: import.meta.env.SYSTEM_API,
    onEmergencyNotice: () => {
      const noticeService = new NoticeService();
      void noticeService.getNoticesByStatus('Calypso', 'posting').then((list) => {
        setNotices(list);
        setUnreadCount(getUnreadNotices(list).length);
      });
    },
  });

  return (
    <>
      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
        <Box
          component="button"
          ref={btnRef}
          onClick={toggleNotice}
          aria-label="Notices"
          title="Notices"
          sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '36px', height: '36px', borderRadius: '8px',
            background: noticeOpen ? T.sf3 : T.sf, color: noticeOpen ? T.tx : T.dm,
            border: 'none', outline: 'none', cursor: CURSOR_POINTER, transition: '.14s',
            '&:hover': { background: T.sf3, color: T.tx },
          }}
        >
          <Icon name="bell" size={18} />
        </Box>
        {unreadCount > 0 && (
          <Box
            sx={{
              position: 'absolute', top: '-1px', right: '-1px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minWidth: '14px', height: '14px', px: '2px',
              background: '#E82C1F', border: '0.5px solid #F73529', borderRadius: '999px',
              pointerEvents: 'none',
            }}
          >
            <Typography sx={{ fontSize: '9px', lineHeight: 1, letterSpacing: '0.5px', color: '#fff', fontWeight: 700 }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </Typography>
          </Box>
        )}
      </Box>

      <Popover
        open={noticeOpen}
        anchorEl={btnRef.current}
        onClose={() => setNoticeOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { mt: 1, width: 320, maxHeight: 420, border: `1px solid ${T.ln}`, borderRadius: 2 } }}
      >
        <Typography sx={{ px: 2, py: 1.25, fontWeight: 700, fontSize: 13, borderBottom: `1px solid ${T.ln}` }}>
          Notices
        </Typography>
        {notices.length === 0 ? (
          <Typography sx={{ px: 2, py: 3, fontSize: 12.5, color: T.dm, textAlign: 'center' }}>
            {t('appShell.notices.empty')}
          </Typography>
        ) : (
          <List dense disablePadding>
            {notices.map((n) => (
              <ListItemButton key={n.nID} onClick={() => handleNoticeRead(n)}>
                <ListItemText
                  primary={n.title}
                  secondary={formatDistanceToNow(new Date(n.startDate), { addSuffix: true })}
                  primaryTypographyProps={{ fontSize: 12.5, fontWeight: 600 }}
                  secondaryTypographyProps={{ fontSize: 11 }}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Popover>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>{selected?.title}</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{selected?.content}</Typography>
        </DialogContent>
      </Dialog>
    </>
  );
}
