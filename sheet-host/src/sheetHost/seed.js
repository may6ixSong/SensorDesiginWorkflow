import * as GC from '@mescius/spread-sheets';

/**
 * template seed(중립 명세, calypso/src/sheets/sheet-format.ts SheetSeed) → 워크북.
 * 서버에는 SpreadJS가 없어 문서 JSON을 직접 만들 수 없으므로 기본 template은 이 모양으로
 * 오고, 여기서 헤더 꾸밈(굵게·배경·테두리)·틀 고정·필터를 입힌다. Admin이 한 번 저장한 뒤로는
 * 문서 JSON이 오므로 이 함수를 거치지 않는다.
 */
export function applySeed(spread, seed) {
  spread.clearSheets();
  const sheets = seed && Array.isArray(seed.sheets) && seed.sheets.length ? seed.sheets : [{ name: 'Sheet1', rows: [], headerRowCount: 0 }];
  sheets.forEach((s, index) => {
    const sheet = new GC.Spread.Sheets.Worksheet(s.name || `Sheet${index + 1}`);
    spread.addSheet(index, sheet);
    const rows = Array.isArray(s.rows) ? s.rows : [];
    const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
    sheet.setRowCount(Math.max(200, rows.length + 100));
    sheet.setColumnCount(Math.max(26, width));

    rows.forEach((row, r) => row.forEach((value, c) => {
      if (value !== '' && value != null) sheet.setValue(r, c, String(value));
    }));
    (s.merges || []).forEach((m) => sheet.addSpan(m.row, m.col, m.rowCount, m.colCount));
    (s.columnWidths || []).forEach((w, c) => sheet.setColumnWidth(c, w));

    const headerRows = Math.min(s.headerRowCount || 0, rows.length);
    if (headerRows > 0 && width > 0) {
      const border = new GC.Spread.Sheets.LineBorder('#8EA9C1', GC.Spread.Sheets.LineStyle.thin);
      for (let r = 0; r < headerRows; r++) {
        for (let c = 0; c < width; c++) {
          const style = new GC.Spread.Sheets.Style();
          style.font = 'bold 11pt Calibri';
          style.backColor = s.headerStyle?.backColor || '#DDEBF7';
          style.foreColor = s.headerStyle?.foreColor || '#1F1F1F';
          style.hAlign = GC.Spread.Sheets.HorizontalAlign.center;
          style.vAlign = GC.Spread.Sheets.VerticalAlign.center;
          style.wordWrap = true;
          style.borderLeft = border;
          style.borderRight = border;
          style.borderTop = border;
          style.borderBottom = border;
          sheet.setStyle(r, c, style);
        }
        sheet.setRowHeight(r, 30);
      }
      sheet.frozenRowCount(headerRows);
      if (s.filter) {
        // 필터 버튼은 범위 바로 위 행에 달린다(범위가 0행에서 시작하면 열 머리글 A·B·C에 달린다).
        // 그래서 범위를 헤더 아래부터 잡아 버튼이 헤더 마지막 행에 오게 한다.
        const filter = new GC.Spread.Sheets.Filter.HideRowFilter(
          new GC.Spread.Sheets.Range(headerRows, 0, sheet.getRowCount() - headerRows, width),
        );
        sheet.rowFilter(filter);
      }
    }
  });
  spread.setActiveSheetIndex(0);
}
