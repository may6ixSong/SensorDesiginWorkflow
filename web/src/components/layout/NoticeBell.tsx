import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Dialog, DialogContent, DialogTitle, List, ListItemButton, ListItemText, Popover, Typography } from '@mui/material';
import { formatDistanceToNow } from 'date-fns';
import { Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, T } from '@/theme/tokens';
import { getNoticesByStatus } from '@/service/notice-service';
import { useSignalRNotice } from '@/hooks/useSignalRNotice';
import type { NoticeItem } from '@/types/notice';

const READ_KEY = 'siren-notice-last-read';

/**
 * Bell icon + popover, backed by SYSTEM_API. Resolves to an always-empty list
 * (and simply hides the "new" indicator) when SYSTEM_API is blank, which is
 * the case in dev — see service/notice-service.ts.
 */
export function NoticeBell({ clientId }: { clientId: string }) {
  const { t } = useTranslation();
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [hasNew, setHasNew] = useState(false);
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [selected, setSelected] = useState<NoticeItem | null>(null);
  const open = Boolean(anchor);

  const refresh = useCallback(async () => {
    const list = await getNoticesByStatus();
    const sorted = [...list].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    setNotices(sorted);

    const lastRead = localStorage.getItem(READ_KEY);
    setHasNew(sorted.length > 0 && (!lastRead || new Date(sorted[0].startDate).getTime() > new Date(lastRead).getTime()));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useSignalRNotice({
    enabled: Boolean(import.meta.env.SYSTEM_API),
    clientId,
    systemApiBaseUrl: import.meta.env.SYSTEM_API,
    onEmergencyNotice: () => void refresh(),
  });

  const toggle = (e: React.MouseEvent<HTMLElement>) => {
    // Capture currentTarget synchronously — the DOM nulls it out once the event
    // finishes propagating, before a functional setState updater would run.
    const target = e.currentTarget;
    setAnchor((prev) => (prev ? null : target));
    if (!open) {
      localStorage.setItem(READ_KEY, new Date().toISOString());
      setHasNew(false);
    }
  };

  return (
    <>
      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
        <Box
          component="button"
          onClick={toggle}
          aria-label={t('appShell.notices.tooltip')}
          title={t('appShell.notices.tooltip')}
          sx={{
            display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: '8px',
            background: open ? T.sf3 : T.sf, color: open ? T.tx : T.dm,
            border: 'none', outline: 'none', cursor: CURSOR_POINTER, transition: '.14s',
            '&:hover': { background: T.sf3, color: T.tx },
          }}
        >
          <Icon name="bell" size={15} />
        </Box>
        {hasNew && (
          <Box
            sx={{
              position: 'absolute', right: 5, top: 5, width: 7, height: 7, borderRadius: 999,
              background: T.am, boxShadow: `0 0 0 2px ${T.sf}`, pointerEvents: 'none',
            }}
          />
        )}
      </Box>

      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { mt: 1, width: 320, maxHeight: 420, border: `1px solid ${T.ln}`, borderRadius: 2 } }}
      >
        <Typography sx={{ px: 2, py: 1.25, fontWeight: 700, fontSize: 13, borderBottom: `1px solid ${T.ln}` }}>
          {t('appShell.notices.title')}
        </Typography>
        {notices.length === 0 ? (
          <Typography sx={{ px: 2, py: 3, fontSize: 12.5, color: T.dm, textAlign: 'center' }}>
            {t('appShell.notices.empty')}
          </Typography>
        ) : (
          <List dense disablePadding>
            {notices.map((n) => (
              <ListItemButton
                key={n.nID}
                onClick={() => {
                  setSelected(n);
                  setAnchor(null);
                }}
              >
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
