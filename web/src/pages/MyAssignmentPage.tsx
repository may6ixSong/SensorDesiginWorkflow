import { useState } from 'react';
import { Box } from '@mui/material';
import { AppShell } from '@/components/layout/AppShell';
import { Tabs, TabPanel } from '@/components/common/Tabs';
import { ReleaseFeedPanel } from '@/components/assignment/ReleaseFeedPanel';
import { MyArtifactsPanel } from '@/components/assignment/MyArtifactsPanel';
import { AssignmentCalendar } from '@/components/assignment/AssignmentCalendar';
import { ReleaseDetailDialog } from '@/components/assignment/ReleaseDetailDialog';
import { MyReleaseRowDto } from '@/types/domain';
import { T } from '@/theme/tokens';

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
  const [view, setView] = useState<View>('overview');
  const [openRelease, setOpenRelease] = useState<MyReleaseRowDto | null>(null);

  return (
    <AppShell>
      <Box
        sx={{
          flex: 1, minHeight: 0, overflow: 'hidden', background: T.bg,
          display: 'flex', flexDirection: 'column',
        }}
      >
        <Box sx={{ flex: '0 0 auto', px: '24px', pt: '20px' }}>
          <Box sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.01em', mb: '14px' }}>
            My Assignment
          </Box>

          <Tabs<View>
            value={view}
            onChange={setView}
            tabs={[
              { key: 'overview', label: 'Overview' },
              { key: 'calendar', label: 'Calendar' },
            ]}
            sx={{ mb: '16px' }}
          />
        </Box>

        {/* display:grid + gridTemplateRows:'minmax(0,1fr)' 는 TabPanel(framer-motion div, 자기
            높이가 없다)이 이 컨테이너의 실제 높이를 그대로 물려받게 하는 자리다 — 그래야 안의
            overview grid가 height:'100%'로 실제 남은 세로 공간을 다 쓸 수 있다.
            ★ 반드시 minmax(0, 1fr)이어야 한다 — 그냥 '1fr'은 암묵적으로 min-height:auto를
            갖는다. 즉 자식(TabPanel 안의 리스트들)의 내용이 이 칸보다 커지면 트랙이 그
            내용 크기까지 늘어나 버려서, 바깥 overflow:hidden에 가려 스크롤할 방법 없이
            아래쪽이 통째로 안 보이는 사고가 난다(실측 — 짧은 화면에서 재현됨). minmax(0,1fr)은
            그 암묵적 최소값을 0으로 낮춰 트랙이 실제로 이 칸 크기까지 줄어들게 한다. */}
        <Box
          sx={{
            flex: 1, minHeight: 0, overflow: 'hidden', px: '24px', pb: '20px',
            display: 'grid', gridTemplateRows: 'minmax(0, 1fr)',
          }}
        >
          <TabPanel tabKey={view}>
            {view === 'overview' ? (
              <Box
                sx={{
                  display: 'grid', height: '100%', minHeight: 0, gap: '14px',
                  gridTemplateColumns: 'minmax(320px, 1fr) minmax(420px, 1.7fr)',
                  // 위 주석과 같은 이유로 여기도 minmax(0, 1fr)이다 — 안 그러면 Inbox/Outbox
                  // 리스트 내용이 길어지는 순간 그 행이 내용 크기로 늘어나며 같은 사고가 난다.
                  gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
                  gridTemplateAreas: '"received artifacts" "published artifacts"',
                  '@media (max-width: 1000px)': {
                    gridTemplateColumns: '1fr',
                    // 좁은 화면에서는 3칸을 세로로 쌓고, 이 grid 자신이 스크롤 컨테이너가
                    // 된다 — 'auto' 행은 내용 크기로 늘어나므로, 위의 minmax(0,1fr) 트릭이
                    // 통하지 않는다(애초에 줄어들 이유가 없다). 대신 여기서 직접 overflow를
                    // 열어 셋을 다 쌓은 뒤 통째로 스크롤하게 한다.
                    gridTemplateRows: 'auto auto auto',
                    gridTemplateAreas: '"received" "published" "artifacts"',
                    overflowY: 'auto',
                    height: 'auto', maxHeight: '100%',
                  },
                }}
              >
                <ReleaseFeedPanel
                  direction="received"
                  title="Inbox"
                  onOpen={setOpenRelease}
                  sx={{ gridArea: 'received' }}
                />
                <ReleaseFeedPanel
                  direction="published"
                  title="Outbox"
                  onOpen={setOpenRelease}
                  sx={{ gridArea: 'published' }}
                />
                <MyArtifactsPanel sx={{ gridArea: 'artifacts' }} />
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
