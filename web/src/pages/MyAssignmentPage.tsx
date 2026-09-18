import { useState } from 'react';
import { Box } from '@mui/material';
import { AppShell } from '@/components/layout/AppShell';
import { Tabs, TabPanel } from '@/components/common/Tabs';
import { useAuth } from '@/app/providers/AuthProvider';
import { ReleaseFeedPanel } from '@/components/assignment/ReleaseFeedPanel';
import { MyArtifactsPanel } from '@/components/assignment/MyArtifactsPanel';
import { AssignmentCalendar } from '@/components/assignment/AssignmentCalendar';
import { ReleaseDetailDialog } from '@/components/assignment/ReleaseDetailDialog';
import { MyReleaseRowDto } from '@/types/domain';
import { FONT_DISPLAY, T } from '@/theme/tokens';

type View = 'overview' | 'calendar';

/**
 * My Assignment (설계서 09장) — 과제를 가로질러 "내 일"만 한 화면에 모은다.
 *
 * 무엇이 내 것인지는 전부 서버가 정한다(MyScopeService): 내가 member인 과제 → 그 과제
 * 로스터에서 **내가 속한 부서가 소속 부서인 workflow** → 그 workflow에서 **내가 주는
 * 산출물(own)이면서 artifact가 매핑된 block**. release는 그와 별개로 recipient(부서·개인)와
 * 발행 부서로 판정한다. Admin은 어느 쪽에도 필터가 걸리지 않는다.
 *
 * ★ 이 페이지의 어떤 목록도 산출물마다 외부 서비스에 권한을 물어보지 않는다 — 그 판정은
 *   release 다이얼로그를 열 때 그 한 건에 대해서만 돈다(01장 §4.2, 09장 §4).
 */
export function MyAssignmentPage() {
  const { user, isAdmin } = useAuth();
  const [view, setView] = useState<View>('overview');
  const [openRelease, setOpenRelease] = useState<MyReleaseRowDto | null>(null);

  return (
    <AppShell>
      <Box sx={{ flex: 1, overflow: 'auto', background: T.bg }}>
        <Box sx={{ maxWidth: 1420, mx: 'auto', px: '28px', py: '26px' }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '14px', mb: '16px', flexWrap: 'wrap' }}>
            <Box>
              <Box sx={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 800, letterSpacing: '-.02em' }}>
                My Assignment
              </Box>
              <Box sx={{ fontSize: 12, color: T.dm, mt: '5px' }}>
                {isAdmin
                  ? 'Every release and artifact version across every project (Admin)'
                  : `Releases and artifacts for ${user?.KnoxID ?? 'you'} and your departments, across every project`}
              </Box>
            </Box>
          </Box>

          <Tabs<View>
            value={view}
            onChange={setView}
            tabs={[
              { key: 'overview', label: 'Overview' },
              { key: 'calendar', label: 'Calendar' },
            ]}
            sx={{ mb: '18px' }}
          />

          <TabPanel tabKey={view}>
            {view === 'overview' ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* 받은 것 / 낸 것은 서로 대칭이라 나란히 둔다. 좁아지면 자연히 쌓인다. */}
                <Box
                  sx={{
                    display: 'grid', gap: '14px',
                    gridTemplateColumns: '1fr 1fr',
                    '@media (max-width: 1100px)': { gridTemplateColumns: '1fr' },
                  }}
                >
                  <ReleaseFeedPanel
                    direction="received"
                    title="Released to me"
                    caption="I or my departments are a recipient"
                    onOpen={setOpenRelease}
                  />
                  <ReleaseFeedPanel
                    direction="published"
                    title="Released by us"
                    caption="published by me or my departments"
                    onOpen={setOpenRelease}
                  />
                </Box>
                <MyArtifactsPanel />
              </Box>
            ) : (
              <AssignmentCalendar onOpenRelease={setOpenRelease} />
            )}
          </TabPanel>
        </Box>
      </Box>

      {openRelease && (
        <ReleaseDetailDialog row={openRelease} onClose={() => setOpenRelease(null)} />
      )}
    </AppShell>
  );
}
