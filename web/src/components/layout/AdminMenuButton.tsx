import { useState } from 'react';
import { Menu, MenuItem, Tooltip } from '@mui/material';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useActingAsStore } from '@/store/actingAsStore';
import { HeaderIconButton } from '@/components/common/HeaderIconButton';
import { UserSimulatorDialog } from './UserSimulatorDialog';

/**
 * 헤더의 Admin 전용 진입점 — 예전의 별도 "Admin" 상단 네비 링크를 대체한다.
 * User Simulator(§13.1)와 Service Manage(§13.4) 두 옵션을 메뉴로 묶는다.
 *
 * non-admin에게는 아예 렌더하지 않는다 (Hub 설계서 §13.3 규칙 6 — 기존 Admin 링크와
 * 같은 원칙). 사용자 시뮬레이션 중에는 Service Manage 항목만 비활성화한다 — 시뮬레이션
 * 대상의 권한으로 레지스트리를 고칠 수 없어야 하기 때문(§13.3 규칙 2). 라우트 진입도
 * ServiceManagePage 쪽에서 한 번 더 막는다(URL 직접 접근 대비).
 */
export function AdminMenuButton() {
  const { isAdmin } = useAuth();
  const actingAs = useActingAsStore((s) => s.actingAs);
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  if (!isAdmin) return null;

  return (
    <>
      <HeaderIconButton
        iconElement={<AdminPanelSettingsRoundedIcon sx={{ fontSize: 20 }} />}
        label="Admin"
        active={!!anchorEl}
        onClick={(e) => setAnchorEl(e.currentTarget)}
      />
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            setSimulatorOpen(true);
          }}
        >
          User Simulator
        </MenuItem>
        <Tooltip title={actingAs ? 'Stop the user simulator first' : ''} placement="right">
          <span>
            <MenuItem
              disabled={!!actingAs}
              onClick={() => {
                setAnchorEl(null);
                navigate('/service-manage');
              }}
            >
              Service Manage
            </MenuItem>
          </span>
        </Tooltip>
      </Menu>
      <UserSimulatorDialog open={simulatorOpen} onClose={() => setSimulatorOpen(false)} />
    </>
  );
}
