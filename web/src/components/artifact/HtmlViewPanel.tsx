import { Box } from '@mui/material';
import { ArtifactHtmlView } from '@/types/domain';
import { T } from '@/theme/tokens';

interface Props {
  data: ArtifactHtmlView | null | undefined;
  loading: boolean;
  /** 슬라이드 왼쪽(B) 칸의 실제 폭 — 이 안에서만 키운다(사용자 요청: max width 제한). */
  maxWidth: number;
}

/**
 * 그 서비스가 준 html preview 하나 — B Tier의 upload/download 자리를 A/C Tier에서는
 * 이걸로 대신한다(설계서 04장 §19 확장).
 *
 * ★ **반드시 sandbox iframe으로 그린다.** 이 html은 SIREN이 만든 게 아니라 외부 서비스가
 *   보낸 것이라 그대로 페이지에 주입하면(dangerouslySetInnerHTML 등) 그 안의 script가
 *   SIREN 자신의 쿠키·DOM에 손댈 수 있다(XSS). `allow-scripts`만 주고 `allow-same-origin`은
 *   절대 주지 않는다 — 그러면 iframe이 SIREN과 다른 origin으로 취급되어 스크립트가 돌아가도
 *   부모 페이지에는 닿지 못한다.
 */
export function HtmlViewPanel({ data, loading, maxWidth }: Props) {
  if (loading) {
    return (
      <Box
        sx={{
          border: `1px dashed ${T.ln2}`, borderRadius: '12px', background: T.sf,
          padding: '40px 20px', textAlign: 'center', color: T.dm2, fontSize: 12.5,
        }}
      >
        Loading preview…
      </Box>
    );
  }

  if (!data) return null;

  const w = Math.min(data.width, maxWidth);
  const h = Math.round(data.height * (w / data.width));

  return (
    <Box
      sx={{
        border: `1px solid ${T.ln}`, borderRadius: '12px', overflow: 'hidden',
        background: T.sf, boxShadow: T.shSm, maxWidth: w, mx: 'auto',
      }}
    >
      <Box
        component="iframe"
        title="Artifact preview"
        srcDoc={data.html}
        sandbox="allow-scripts"
        sx={{ display: 'block', width: w, height: h, border: 'none' }}
      />
    </Box>
  );
}
