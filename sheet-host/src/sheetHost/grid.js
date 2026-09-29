import * as GC from '@mescius/spread-sheets';
import { SheetGridFormat } from './gridFormat';

/**
 * 워크북 → 셀 값 격자(SIREN이 HPC·소비자에게 넘기는 형식, docs/11-sheet-artifacts.md §5).
 *
 * - 값은 화면에 보이는 문자열 그대로(getText). getValue는 수식 결과·숫자 타입이 섞여 "저장한
 *   그대로"와 달라진다.
 * - 모든 시트를 순서대로 담는다. 숨긴 시트도 담는다(사용자가 저장한 것이므로).
 * - 끝의 빈 행·열은 자른다. 중간의 빈 행은 그대로 둔다.
 * - 병합은 잘린 범위와 겹치는 것만 { row, col, rowCount, colCount }로 담는다.
 */
export function workbookToGrid(spread) {
  const sheets = [];
  for (let i = 0; i < spread.getSheetCount(); i++) {
    sheets.push(sheetToGrid(spread.getSheet(i)));
  }
  return { format: SheetGridFormat, version: 1, sheets };
}

function scanBounds(sheet) {
  let rows = sheet.getRowCount();
  let cols = sheet.getColumnCount();
  // 데이터가 있는 범위로 먼저 좁힌다 — 스타일만 있는 빈 칸까지 훑지 않게.
  try {
    const used = sheet.getUsedRange(GC.Spread.Sheets.UsedRangeType.data);
    if (used) {
      rows = Math.min(rows, used.row + used.rowCount);
      cols = Math.min(cols, used.col + used.colCount);
    } else {
      rows = 0;
      cols = 0;
    }
  } catch {
    // 이 버전에 getUsedRange가 없으면 전체를 훑는다.
  }
  return { rows, cols };
}

export function sheetToGrid(sheet) {
  const { rows, cols } = scanBounds(sheet);
  const out = [];
  let lastRow = -1;
  let lastCol = -1;
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const text = sheet.getText(r, c);
      const s = text == null ? '' : String(text);
      row.push(s);
      if (s !== '') {
        lastRow = r;
        if (c > lastCol) lastCol = c;
      }
    }
    out.push(row);
  }
  const trimmed = out.slice(0, lastRow + 1).map((row) => row.slice(0, lastCol + 1));
  const merges = (sheet.getSpans() || [])
    .filter((m) => m.row <= lastRow && m.col <= lastCol)
    .map((m) => ({ row: m.row, col: m.col, rowCount: m.rowCount, colCount: m.colCount }));
  return { name: sheet.name(), rows: trimmed, merges };
}
