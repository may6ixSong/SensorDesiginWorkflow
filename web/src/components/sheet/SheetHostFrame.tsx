import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { SheetDocument, SheetGrid, SheetSeed } from '@/api/calypsoClient';
import { SHEET_HOST_URL, SheetHostBridge, isSheetMessage, sheetHostOrigin } from '@/lib/sheetHost';
import { FONT_MONO, T } from '@/theme/tokens';

export interface SheetSaveResult {
  document: SheetDocument;
  grid: SheetGrid;
  xlsx: Blob | null;
}

export interface SheetHostHandle {
  save(includeXlsx: boolean): Promise<SheetSaveResult>;
  exportExcel(): Promise<Blob>;
  importExcel(file: File): Promise<void>;
}

interface Props {
  mode: 'edit' | 'view';
  /** 둘 중 하나 — document(저장된 시트)가 있으면 그걸, 없으면 seed(template 명세)로 만든다. */
  document: SheetDocument | null;
  seed: SheetSeed | null;
  /** load까지 끝나 편집할 수 있게 됐을 때. */
  onLoaded?: () => void;
  /** 사용자가 처음 고쳤을 때(저장 뒤 다시 고치면 또). */
  onDirty?: () => void;
}

/** 편집기 페이지가 이 안에 ready를 안 보내면 연결 실패로 본다(주소·방화벽·배포 문제). */
const READY_TIMEOUT_MS = 20_000;

/**
 * sheet-host iframe 하나 — 설계서 11장 §6의 규약을 SIREN 쪽에서 들고 있는다. 이 컴포넌트는
 * 시트 내용을 해석하지 않는다: 받은 문서를 넘기고, 돌려받은 문서·격자를 그대로 호출부에 준다.
 */
export const SheetHostFrame = forwardRef<SheetHostHandle, Props>(function SheetHostFrame(
  { mode, document, seed, onLoaded, onDirty }, ref,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<SheetHostBridge | null>(null);
  const [state, setState] = useState<'connecting' | 'loading' | 'ready' | 'failed'>('connecting');
  const [error, setError] = useState<string | null>(null);
  const origin = sheetHostOrigin();

  // 최신 콜백을 ref로 들고 있어 message 리스너를 다시 달지 않는다.
  const cb = useRef({ onLoaded, onDirty });
  cb.current = { onLoaded, onDirty };
  const content = useRef({ mode, document, seed });
  content.current = { mode, document, seed };

  useEffect(() => {
    if (!origin) {
      setState('failed');
      setError('SHEET_HOST_URL is not configured.');
      return undefined;
    }
    // ready를 받으면 이 타이머를 지운다 — 남아서 울렸다는 건 아직 한 번도 연결되지 않았다는 뜻이다.
    const readyTimer = setTimeout(() => {
      setError(`Could not reach the sheet editor at ${SHEET_HOST_URL}.`);
      setState('failed');
    }, READY_TIMEOUT_MS);

    const onMessage = (e: MessageEvent) => {
      const win = iframeRef.current?.contentWindow;
      if (!win || e.source !== win || e.origin !== origin || !isSheetMessage(e.data)) return;
      const msg = e.data;
      if (bridgeRef.current?.settle(msg)) return;
      if (msg.type === 'sheet:ready') {
        clearTimeout(readyTimer);
        bridgeRef.current?.dispose();
        const bridge = new SheetHostBridge(win, origin);
        bridgeRef.current = bridge;
        setState('loading');
        const c = content.current;
        bridge.request('sheet:load', { mode: c.mode, document: c.document, seed: c.seed }, 'sheet:loaded')
          .then(() => { setState('ready'); cb.current.onLoaded?.(); })
          .catch((err: Error) => { setState('failed'); setError(err.message); });
      } else if (msg.type === 'sheet:dirty') {
        cb.current.onDirty?.();
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      clearTimeout(readyTimer);
      window.removeEventListener('message', onMessage);
      bridgeRef.current?.dispose();
      bridgeRef.current = null;
    };
  }, [origin]);

  useImperativeHandle(ref, () => ({
    save: (includeXlsx) => {
      const b = bridgeRef.current;
      if (!b) return Promise.reject(new Error('The sheet editor is not ready.'));
      return b.request<SheetSaveResult>('sheet:save', { includeXlsx }, 'sheet:saved');
    },
    exportExcel: async () => {
      const b = bridgeRef.current;
      if (!b) throw new Error('The sheet editor is not ready.');
      const res = await b.request<{ xlsx: Blob }>('sheet:exportExcel', {}, 'sheet:exported');
      return res.xlsx;
    },
    importExcel: async (file) => {
      const b = bridgeRef.current;
      if (!b) throw new Error('The sheet editor is not ready.');
      await b.request('sheet:importExcel', { file }, 'sheet:imported');
    },
  }), []);

  return (
    <Box sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
      {origin && (
        <Box
          component="iframe"
          ref={iframeRef}
          src={SHEET_HOST_URL}
          title="Sheet editor"
          // sandbox를 두지 않는다 — 붙여넣기·엑셀 가져오기가 막힌다(조사 보고서 §8-8).
          sx={{ flex: 1, border: 0, width: '100%', height: '100%', background: '#fff', visibility: state === 'ready' ? 'visible' : 'hidden' }}
        />
      )}
      {state !== 'ready' && (
        <Box
          sx={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: '10px', color: T.dm, fontSize: 12.5, textAlign: 'center', padding: '20px',
          }}
        >
          {state === 'failed' ? (
            <>
              <Box sx={{ fontWeight: 700, color: T.tx }}>The sheet editor could not open</Box>
              <Box>{error}</Box>
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm2 }}>
                The editor runs on the SpreadJS-licensed site and must be reachable from your network.
              </Box>
            </>
          ) : (
            <>
              <CircularProgress size={24} />
              <Box>{state === 'connecting' ? 'Opening the sheet editor…' : 'Loading the sheet…'}</Box>
            </>
          )}
        </Box>
      )}
    </Box>
  );
});
