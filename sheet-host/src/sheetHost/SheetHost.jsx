import './license';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import '@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css';
import * as GC from '@mescius/spread-sheets';
import '@mescius/spread-sheets-io';
import { SpreadSheets } from '@mescius/spread-sheets-react';
import { ALLOWED_PARENT_ORIGINS } from './allowedOrigins';
import { envelope, isProtocolMessage } from './protocol';
import { applySeed } from './seed';
import { workbookToGrid } from './grid';

/** 사용자가 고치면 올라오는 이벤트 — 하나라도 오면 "저장 안 한 변경 있음". */
const DIRTY_EVENTS = [
  'CellChanged', 'RangeChanged', 'ClipboardPasted', 'RowChanged', 'ColumnChanged', 'SheetNameChanged',
  'SheetMoved', 'ColumnWidthChanged', 'RowHeightChanged', 'DragDropBlockCompleted', 'DragFillBlockCompleted',
  'DragMerged', 'CommentChanged', 'RangeSorted',
];

function errorMessage(e) {
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  return e.errorMessage || e.message || String(e);
}

/**
 * SIREN이 iframe으로 띄우는 SpreadJS 편집기(docs/11-sheet-artifacts.md). 사용자는 엑셀처럼
 * 자유롭게 고치고(헤더 포함), 이 페이지는 검사하지 않는다 — 저장한 그대로 SIREN에 돌려준다.
 *
 * renderToolbar(spread, mode): 편집 도구. SDP_SPA에서는 기존 customRibbon을 넘긴다. view
 * 모드에서는 부르지 않는다.
 */
export default function SheetHost({ renderToolbar }) {
  const spreadRef = useRef(null);
  const parentOriginRef = useRef(null);
  const dirtyRef = useRef(false);
  const [spread, setSpread] = useState(null);
  const [mode, setMode] = useState(null);

  const post = useCallback((type, requestId, payload) => {
    const target = parentOriginRef.current;
    if (!target) return;
    try {
      window.parent.postMessage(envelope(type, requestId, payload), target);
    } catch (e) {
      // 복제할 수 없는 값이 섞이면 여기서 던진다 — 조용히 삼키지 않고 요청자에게 알린다.
      window.parent.postMessage(envelope('sheet:error', requestId, { message: `Could not send ${type}: ${errorMessage(e)}` }), target);
    }
  }, []);

  const markClean = useCallback(() => {
    dirtyRef.current = false;
  }, []);

  const markDirty = useCallback(() => {
    if (dirtyRef.current) return;
    dirtyRef.current = true;
    post('sheet:dirty', undefined, { dirty: true });
  }, [post]);

  const applyMode = useCallback((wb, nextMode) => {
    const readOnly = nextMode === 'view';
    wb.options.newTabVisible = !readOnly;
    wb.options.tabEditable = !readOnly;
    wb.options.allowSheetReorder = !readOnly;
    wb.options.allowUserDragDrop = !readOnly;
    wb.options.allowUserDragFill = !readOnly;
    for (let i = 0; i < wb.getSheetCount(); i++) {
      const sheet = wb.getSheet(i);
      if (readOnly) {
        sheet.options.isProtected = true;
        sheet.options.protectionOptions = {
          ...sheet.options.protectionOptions, allowFilter: true, allowSort: true, allowResizeColumns: true,
        };
      }
    }
  }, []);

  const handlers = useRef({});
  handlers.current = {
    'sheet:load': (wb, msg) => {
      const { mode: nextMode, document, seed } = msg.payload || {};
      wb.suspendPaint();
      wb.suspendEvent();
      try {
        if (document) wb.fromJSON(document);
        else applySeed(wb, seed);
        applyMode(wb, nextMode === 'view' ? 'view' : 'edit');
      } finally {
        wb.resumeEvent();
        wb.resumePaint();
      }
      setMode(nextMode === 'view' ? 'view' : 'edit');
      markClean();
      post('sheet:loaded', msg.requestId, {});
    },

    'sheet:save': (wb, msg) => {
      const includeXlsx = !!(msg.payload && msg.payload.includeXlsx);
      // 편집 중인 셀이 있으면 먼저 확정한다 — 안 그러면 마지막 입력이 빠진다.
      wb.getActiveSheet().endEdit();
      // toJSON 결과에는 함수가 섞여 있어(docProps.toString 등) postMessage의 구조적 복제가 실패한다.
      // 순수 JSON으로 한 번 걸러서 보낸다 — 저장 파일(.ssjson)도 어차피 이 JSON 문자열이다.
      const document = JSON.parse(JSON.stringify(wb.toJSON({ includeBindingSource: true })));
      const grid = workbookToGrid(wb);
      const done = (xlsx) => {
        markClean();
        post('sheet:saved', msg.requestId, { document, grid, xlsx });
      };
      if (!includeXlsx) {
        done(null);
        return;
      }
      wb.export(
        (blob) => done(blob),
        (e) => post('sheet:error', msg.requestId, { message: `Excel export failed: ${errorMessage(e)}` }),
        { fileType: GC.Spread.Sheets.FileType.excel },
      );
    },

    'sheet:exportExcel': (wb, msg) => {
      wb.getActiveSheet().endEdit();
      wb.export(
        (blob) => post('sheet:exported', msg.requestId, { xlsx: blob }),
        (e) => post('sheet:error', msg.requestId, { message: `Excel export failed: ${errorMessage(e)}` }),
        { fileType: GC.Spread.Sheets.FileType.excel },
      );
    },

    'sheet:importExcel': (wb, msg) => {
      const file = msg.payload && msg.payload.file;
      if (!(file instanceof Blob)) {
        post('sheet:error', msg.requestId, { message: 'No file to import.' });
        return;
      }
      // .xlsx만 된다(SpreadJS IO). 워크북 전체를 그 파일로 바꾼다 — 사용자가 고른 동작이다.
      wb.import(
        file,
        () => {
          applyMode(wb, 'edit');
          dirtyRef.current = false;
          markDirty();
          post('sheet:imported', msg.requestId, {});
        },
        (e) => post('sheet:error', msg.requestId, { message: `Excel import failed: ${errorMessage(e)}` }),
        { fileType: GC.Spread.Sheets.FileType.excel },
      );
    },
  };

  useEffect(() => {
    if (!spread) return undefined;

    const onMessage = (event) => {
      // 부모 창에서, 허용된 origin으로 온 규약 메시지만 받는다.
      if (event.source !== window.parent) return;
      if (!ALLOWED_PARENT_ORIGINS.includes(event.origin)) return;
      if (parentOriginRef.current && parentOriginRef.current !== event.origin) return;
      if (!isProtocolMessage(event.data)) return;
      parentOriginRef.current = event.origin;

      const msg = event.data;
      const handler = handlers.current[msg.type];
      if (!handler) return;
      try {
        handler(spreadRef.current, msg);
      } catch (e) {
        post('sheet:error', msg.requestId, { message: errorMessage(e) });
      }
    };
    window.addEventListener('message', onMessage);

    const onChange = () => markDirty();
    DIRTY_EVENTS.forEach((name) => {
      const evt = GC.Spread.Sheets.Events[name];
      if (evt) spread.bind(evt, onChange);
    });

    // 워크북이 준비된 뒤에 알린다 — 먼저 알리면 첫 sheet:load를 잃을 수 있다. 부모 origin을
    // 아직 모르므로 '*'로 보내되 데이터는 담지 않는다.
    window.parent.postMessage(envelope('sheet:ready', undefined, { spreadVersion: GC.Spread.Sheets.productInfo?.productVersion ?? null }), '*');

    return () => {
      window.removeEventListener('message', onMessage);
      DIRTY_EVENTS.forEach((name) => {
        const evt = GC.Spread.Sheets.Events[name];
        if (evt) spread.unbind(evt, onChange);
      });
    };
  }, [spread, markDirty, post]);

  const onInit = useCallback((wb) => {
    spreadRef.current = wb;
    setSpread(wb);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {spread && mode === 'edit' && renderToolbar ? (
        // 리본 동작(서식·테두리 등)은 API 호출이라 변경 이벤트가 안 올 수 있다 — 도구 영역을 누르면
        // "변경 있음"으로 본다. 이 표시는 저장 안 한 변경 경고용 힌트일 뿐, 저장 내용과는 무관하다.
        <div style={{ flex: 'none' }} onClick={() => markDirty()}>{renderToolbar(spread, mode)}</div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0 }}>
        <SpreadSheets workbookInitialized={onInit} hostStyle={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}
