import React from 'react';
import * as GC from '@mescius/spread-sheets';

/**
 * 로컬 개발용 최소 도구 모음. SDP_SPA에서는 이 자리에 기존 customRibbon이 들어간다
 * (사용자 결정: 리본 재사용). 여기서는 흐름 검증에 필요한 몇 가지만 둔다.
 */
function eachSelection(spread, fn) {
  const sheet = spread.getActiveSheet();
  sheet.suspendPaint();
  try {
    sheet.getSelections().forEach((sel) => fn(sheet, sel));
  } finally {
    sheet.resumePaint();
  }
}

const btn = {
  font: '12px sans-serif', padding: '4px 8px', border: '1px solid #c8c8c8', background: '#fff', borderRadius: 3, cursor: 'pointer',
};

export default function DevToolbar({ spread }) {
  const bold = () => eachSelection(spread, (sheet, s) => {
    const range = sheet.getRange(s.row, s.col, s.rowCount, s.colCount);
    const current = sheet.getCell(s.row < 0 ? 0 : s.row, s.col < 0 ? 0 : s.col).font() || '11pt Calibri';
    range.font(current.includes('bold') ? current.replace('bold ', '') : `bold ${current}`);
  });
  const fill = (color) => eachSelection(spread, (sheet, s) => sheet.getRange(s.row, s.col, s.rowCount, s.colCount).backColor(color));
  const borders = () => eachSelection(spread, (sheet, s) => sheet.getRange(s.row, s.col, s.rowCount, s.colCount).setBorder(
    new GC.Spread.Sheets.LineBorder('#000000', GC.Spread.Sheets.LineStyle.thin), { all: true },
  ));
  const merge = () => eachSelection(spread, (sheet, s) => sheet.addSpan(s.row, s.col, s.rowCount, s.colCount));
  const unmerge = () => eachSelection(spread, (sheet, s) => {
    for (let r = s.row; r < s.row + s.rowCount; r++) {
      for (let c = s.col; c < s.col + s.colCount; c++) {
        const span = sheet.getSpan(r, c);
        if (span) sheet.removeSpan(span.row, span.col);
      }
    }
  });
  // 선택한 행을 헤더로 보고 그 아래를 필터 범위로 잡는다(버튼은 범위 바로 위 행에 달린다).
  const filter = () => eachSelection(spread, (sheet, s) => {
    const top = Math.max(0, s.row) + 1;
    sheet.rowFilter(new GC.Spread.Sheets.Filter.HideRowFilter(
      new GC.Spread.Sheets.Range(top, Math.max(0, s.col), sheet.getRowCount() - top, s.colCount),
    ));
  });
  const freeze = () => {
    const sheet = spread.getActiveSheet();
    sheet.frozenRowCount(sheet.getActiveRowIndex());
  };

  return (
    <div style={{ display: 'flex', gap: 4, padding: 6, borderBottom: '1px solid #ddd', background: '#f7f7f7' }}>
      <span style={{ font: '12px sans-serif', color: '#777', alignSelf: 'center', marginRight: 6 }}>Dev toolbar</span>
      <button type="button" style={btn} onClick={bold}>Bold</button>
      <button type="button" style={btn} onClick={() => fill('#FFF2CC')}>Fill yellow</button>
      <button type="button" style={btn} onClick={() => fill(undefined)}>Clear fill</button>
      <button type="button" style={btn} onClick={borders}>Borders</button>
      <button type="button" style={btn} onClick={merge}>Merge</button>
      <button type="button" style={btn} onClick={unmerge}>Unmerge</button>
      <button type="button" style={btn} onClick={filter}>Filter</button>
      <button type="button" style={btn} onClick={freeze}>Freeze above</button>
    </div>
  );
}
