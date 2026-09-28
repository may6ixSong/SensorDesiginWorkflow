import type { Cell, Workbook, Worksheet } from 'exceljs';
import { TableRow, TableTemplateDef, cellText, isBlankRow, matchHeader } from '@/lib/tableValidation';

/**
 * 표(table) 콘텐츠의 엑셀 가져오기/내보내기(설계서 11장 §5). exceljs는 1MB 가까이 되므로
 * 버튼을 눌렀을 때만 불러온다(dynamic import).
 *
 * 가져오기 규칙은 LibertyGenScript `port_list_reader.py`와 맞췄다:
 *   - 시트: 이름에 template.sheetName이 들어간 시트 → 없으면 헤더가 가장 많이 맞는 시트
 *   - 헤더 행: 위 5행 중 template 컬럼 이름(별칭 포함, 대소문자·공백·기호 무시)이 가장 많이
 *     맞는 행 — 그 위의 행(예: "{cell name}")은 버린다
 *   - 완전히 빈 행이 500개 이어지면 데이터 끝
 *   - 병합 셀은 master 값을 모든 칸에 채운다 + fillDown 컬럼은 빈 칸을 위 행 값으로 채운다
 */

const HEADER_SCAN_ROWS = 5;
const MAX_TRAILING_BLANK_ROWS = 500;

async function loadExcelJs() {
  const mod = await import('exceljs');
  return (mod as unknown as { default?: typeof import('exceljs') }).default ?? mod;
}

/** exceljs 셀 값 → 화면에 보이는 문자열. */
function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(+value.toPrecision(12));
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText)) return (v.richText as { text: string }[]).map((r) => r.text).join('');
    if ('result' in v) return valueText(v.result);
    if ('text' in v) return valueText(v.text);
    if ('error' in v) return '';
  }
  return String(value);
}

function cellValueText(cell: Cell): string {
  const source = cell.isMerged && cell.master ? cell.master : cell;
  return valueText(source.value).trim();
}

function detectHeader(ws: Worksheet, template: TableTemplateDef): { row: number; map: Map<number, string> } {
  let best = { row: 0, map: new Map<number, string>() };
  const last = Math.min(ws.rowCount, HEADER_SCAN_ROWS);
  for (let r = 1; r <= last; r++) {
    const map = new Map<number, string>();
    const used = new Set<string>();
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      const key = matchHeader(template.columns, cellValueText(cell));
      if (key && !used.has(key)) {
        map.set(col, key);
        used.add(key);
      }
    });
    if (map.size > best.map.size) best = { row: r, map };
  }
  return best;
}

export interface ImportResult {
  rows: TableRow[];
  sheetName: string;
  headerRow: number;
  /** 인식한 template 컬럼 label들. */
  matched: string[];
  /** 파일에 없던 필수 컬럼 label들. */
  missingRequired: string[];
  /** template에 없어 버린 헤더들. */
  ignoredHeaders: string[];
}

export async function importTableFromXlsx(file: File, template: TableTemplateDef): Promise<ImportResult> {
  if (!/\.xlsx$/i.test(file.name)) {
    throw new Error('Only .xlsx files can be imported. Save an .xls file as .xlsx in Excel first.');
  }
  const ExcelJS = await loadExcelJs();
  const wb: Workbook = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const hint = template.sheetName.trim().toLowerCase();
  const named = wb.worksheets.find((ws) => hint && ws.name.toLowerCase().includes(hint));
  let ws: Worksheet | undefined = named;
  let header = named ? detectHeader(named, template) : { row: 0, map: new Map<number, string>() };
  if (!ws || header.map.size === 0) {
    for (const candidate of wb.worksheets) {
      const h = detectHeader(candidate, template);
      if (h.map.size > header.map.size) {
        ws = candidate;
        header = h;
      }
    }
  }
  if (!ws || header.map.size === 0) {
    throw new Error(`No sheet has a header row matching "${template.name}". Check the column names in the first ${HEADER_SCAN_ROWS} rows.`);
  }

  const ignoredHeaders: string[] = [];
  ws.getRow(header.row).eachCell({ includeEmpty: false }, (cell, col) => {
    if (!header.map.has(col)) {
      const t = cellValueText(cell);
      if (t) ignoredHeaders.push(t);
    }
  });

  const fillDownKeys = new Set(template.columns.filter((c) => c.fillDown).map((c) => c.key));
  const rows: TableRow[] = [];
  let blankRun = 0;
  let previous: TableRow | null = null;
  for (let r = header.row + 1; r <= ws.rowCount; r++) {
    const excelRow = ws.getRow(r);
    const row: TableRow = {};
    for (const c of template.columns) row[c.key] = '';
    header.map.forEach((key, col) => {
      row[key] = cellValueText(excelRow.getCell(col));
    });
    if (isBlankRow(template.columns, row)) {
      blankRun += 1;
      if (blankRun >= MAX_TRAILING_BLANK_ROWS) break;
      continue;
    }
    blankRun = 0;
    if (previous) {
      for (const k of fillDownKeys) if (!row[k] && previous[k]) row[k] = previous[k];
    }
    rows.push(row);
    previous = row;
  }

  const matchedKeys = new Set(header.map.values());
  return {
    rows,
    sheetName: ws.name,
    headerRow: header.row,
    matched: template.columns.filter((c) => matchedKeys.has(c.key)).map((c) => c.label),
    missingRequired: template.columns.filter((c) => c.required && !matchedKeys.has(c.key)).map((c) => c.label),
    ignoredHeaders,
  };
}

const PLAIN_NUMBER_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

/**
 * 한 시트짜리 .xlsx로 내보낸다 — 헤더 한 줄(필터 켜짐, 고정), mergeOnExport 컬럼은 같은 값이
 * 이어지는 구간을 병합한다(엑셀에서 쓰던 모양 그대로). 숫자 컬럼의 순수 숫자는 숫자 셀로 쓴다.
 */
export async function exportTableToXlsx(template: TableTemplateDef, rows: TableRow[], fileName: string): Promise<void> {
  const ExcelJS = await loadExcelJs();
  const wb: Workbook = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(template.sheetName.slice(0, 31) || 'Sheet1', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.columns = template.columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: Math.max(8, Math.round((c.width ?? 120) / 7)),
  }));
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E9EE' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF9AA1AE' } } };
  });

  for (const row of rows) {
    const values: Record<string, string | number> = {};
    for (const c of template.columns) {
      const v = cellText(row[c.key]);
      values[c.key] = (c.type === 'integer' || (c.type === 'number' && !c.allowUnit)) && PLAIN_NUMBER_RE.test(v.trim())
        ? Number(v)
        : v;
    }
    ws.addRow(values);
  }

  if (template.columns.length) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: template.columns.length } };
  }

  template.columns.forEach((c, i) => {
    if (!c.mergeOnExport) return;
    const col = i + 1;
    let start = 0;
    const flush = (end: number) => {
      if (end - start >= 1 && cellText(rows[start][c.key]).trim()) {
        ws.mergeCells(start + 2, col, end + 2, col);
        ws.getCell(start + 2, col).alignment = { vertical: 'middle', horizontal: 'center' };
      }
    };
    for (let r = 1; r <= rows.length; r++) {
      if (r === rows.length || cellText(rows[r][c.key]) !== cellText(rows[start][c.key])) {
        flush(r - 1);
        start = r;
      }
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ── 클립보드(엑셀과 같은 TSV) ── */

/** 엑셀이 클립보드에 쓰는 TSV를 칸 배열로 — 탭·줄바꿈이 든 칸은 따옴표로 감싸여 온다. */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let quoted = false;
  const src = text.replace(/\r\n?/g, '\n');
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      cell += ch; i += 1; continue;
    }
    if (ch === '"' && cell === '') { quoted = true; i += 1; continue; }
    if (ch === '\t') { row.push(cell); cell = ''; i += 1; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i += 1; continue; }
    cell += ch; i += 1;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  // 엑셀은 끝에 줄바꿈을 하나 붙인다 — 마지막 빈 행은 버린다.
  while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  return rows;
}

export function toTsv(grid: string[][]): string {
  return grid
    .map((r) => r.map((c) => (/[\t\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join('\t'))
    .join('\n');
}
