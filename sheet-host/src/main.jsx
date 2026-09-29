import React from 'react';
import { createRoot } from 'react-dom/client';
import SheetHost from './sheetHost/SheetHost';
import DevToolbar from './dev/DevToolbar';
import * as GC from '@mescius/spread-sheets';

// 개발 서버에서만 — 브라우저 콘솔·자동 테스트가 워크북을 직접 볼 수 있게.
window.GC = GC;

// SDP_SPA에서는 이 파일 대신 App.js에 `<Route path="/sheet-host" element={<SheetHost ... />} />`
// 한 줄을 넣고, renderToolbar로 기존 customRibbon을 넘긴다(docs/prompts/sdp-spa-sheet-host.md).
createRoot(document.getElementById('root')).render(
  <SheetHost renderToolbar={(spread) => <DevToolbar spread={spread} />} />,
);
