import { Component, ReactNode } from 'react';
import { Stack, Typography } from '@mui/material';
import { SirenButton } from '@/components/common/SirenButton';
import { FONT_MONO, T } from '@/theme/tokens';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 앱 전체에 error boundary가 하나도 없었다 — 렌더 중 예외가 나면 React가 트리를
 * 통째로 unmount해서 완전히 빈 화면만 남았다(사용자가 실제로 겪은 증상: artifact
 * 목록에서 detail로 client-side navigation했을 때 빈 페이지, 새로고침하면 정상 —
 * 새로고침이 최신 JS 번들을 다시 받아오면서 우연히 고쳐진 것뿐, 원인 자체는 그
 * navigation 시점에 뭔가 렌더 예외가 났었다는 뜻이다). 그 예외의 실제 원인이 뭐든
 * (배포 직후 열려 있던 탭의 예전 번들과 새 API 응답 모양이 어긋났을 수도 있고, 다른
 * 경우일 수도 있다) 최소한 "빈 화면"이 아니라 새로고침 버튼이 있는 화면을 보여준다.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // eslint-disable-next-line no-console
    console.error('Unhandled render error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <Stack alignItems="center" justifyContent="center" sx={{ height: '100vh' }} spacing={1.5}>
          <Typography variant="h6">Something went wrong</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420, textAlign: 'center' }}>
            This page ran into an unexpected error. Reloading usually fixes it — this can happen
            right after a new version is deployed while this tab was already open.
          </Typography>
          <Typography sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm2, maxWidth: 460, textAlign: 'center' }}>
            {this.state.error.message}
          </Typography>
          <SirenButton variant="primary" onClick={() => window.location.reload()}>
            Reload
          </SirenButton>
        </Stack>
      );
    }
    return this.props.children;
  }
}
