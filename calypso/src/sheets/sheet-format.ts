import { BadRequestException } from '@nestjs/common';

/**
 * Sheet(엑셀처럼 편집하는 표) 콘텐츠의 저장 형식(SIREN 설계서 11장).
 *
 * 한 sheet 버전은 **보통 파일 버전**이다 — 같은 업로드 경로로 파일 두세 개를 올린다.
 *   - `<name>.ssjson`    SpreadJS 문서 JSON(workbook.toJSON). 편집기가 그대로 다시 연다.
 *   - `<name>.grid.json` 셀 값 격자(아래 SheetGrid). HPC·다른 서비스가 가져다 쓰는 쪽.
 *   - `<name>.xlsx`      (선택) 같은 내용의 엑셀 파일. 사람이 내려받아 볼 때 쓴다.
 *
 * ★ 내용 검사는 하지 않는다(사용자 결정) — 사용자가 저장한 그대로 저장하고, 그대로 열고,
 *   소비자도 그대로 받는다. 값이 맞는지는 그걸 쓰는 쪽(liberty generator 등)이 본다. 여기서
 *   보는 건 "격자 파일이 약속한 모양인가" 하나뿐이다 — 모양이 깨지면 소비자가 읽지 못한다.
 */

export const SHEET_DOCUMENT_EXT = '.ssjson';
export const SHEET_GRID_EXT = '.grid.json';
export const SHEET_XLSX_EXT = '.xlsx';
export const SHEET_GRID_FORMAT = 'siren-sheet-grid';

export interface SheetMerge {
  row: number;
  col: number;
  rowCount: number;
  colCount: number;
}

/** 시트 하나 — 행마다 화면에 보이는 문자열 그대로(getText). 끝의 빈 행·열은 잘려 있다. */
export interface SheetGridSheet {
  name: string;
  rows: string[][];
  merges: SheetMerge[];
}

export interface SheetGrid {
  format: typeof SHEET_GRID_FORMAT;
  version: 1;
  sheets: SheetGridSheet[];
}

/**
 * Admin이 아직 한 번도 편집기로 저장하지 않은 template의 시작 모양. 서버에는 SpreadJS가
 * 없어 문서 JSON을 직접 만들 수 없으므로, 이 중립 명세를 sheet-host가 받아 워크북으로
 * 만든다. Admin이 한 번 저장하면 그 뒤로는 문서 JSON이 이 자리를 대신한다.
 */
export interface SheetSeedSheet {
  name: string;
  /** 머리 부분 행들 — 보통 헤더 한 줄. */
  rows: string[][];
  merges?: SheetMerge[];
  /** 헤더로 꾸밀(굵게·배경·테두리) 위쪽 행 수. 틀 고정도 이만큼 한다. */
  headerRowCount: number;
  /** true면 헤더 마지막 행에 필터 버튼을 단다. */
  filter?: boolean;
  columnWidths?: number[];
  headerStyle?: { backColor?: string; foreColor?: string };
}

export interface SheetSeed {
  sheets: SheetSeedSheet[];
}

export function isSheetDocumentFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(SHEET_DOCUMENT_EXT);
}

export function isSheetGridFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(SHEET_GRID_EXT);
}

/** 버전 파일 중 문서/격자 파일을 찾는다 — 없으면 null. */
export function sheetFilesOf<F extends { fileName: string }>(files: F[] | undefined): { document: F | null; grid: F | null } {
  const list = files ?? [];
  return {
    document: list.find((f) => isSheetDocumentFile(f.fileName)) ?? null,
    grid: list.find((f) => isSheetGridFile(f.fileName)) ?? null,
  };
}

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

/**
 * 격자 파일이 약속한 모양인지만 본다(셀 값은 보지 않는다). 모양이 맞으면 파싱한 값을 돌려준다.
 */
export function parseSheetGrid(raw: string | Buffer): SheetGrid {
  let data: unknown;
  try {
    data = JSON.parse(raw.toString());
  } catch {
    throw new BadRequestException('The grid file is not valid JSON.');
  }
  const bad = (why: string) => new BadRequestException(`The grid file has the wrong shape: ${why}.`);
  if (!data || typeof data !== 'object') throw bad('not an object');
  const g = data as Record<string, unknown>;
  if (g.format !== SHEET_GRID_FORMAT) throw bad(`format must be "${SHEET_GRID_FORMAT}"`);
  if (g.version !== 1) throw bad('version must be 1');
  if (!Array.isArray(g.sheets) || g.sheets.length === 0) throw bad('sheets must be a non-empty array');
  for (const [i, s] of (g.sheets as unknown[]).entries()) {
    if (!s || typeof s !== 'object') throw bad(`sheets[${i}] is not an object`);
    const sheet = s as Record<string, unknown>;
    if (typeof sheet.name !== 'string') throw bad(`sheets[${i}].name must be a string`);
    if (!Array.isArray(sheet.rows)) throw bad(`sheets[${i}].rows must be an array`);
    for (const [r, row] of (sheet.rows as unknown[]).entries()) {
      if (!Array.isArray(row) || row.some((c) => typeof c !== 'string')) {
        throw bad(`sheets[${i}].rows[${r}] must be an array of strings`);
      }
    }
    if (!Array.isArray(sheet.merges)) throw bad(`sheets[${i}].merges must be an array`);
    for (const [m, merge] of (sheet.merges as unknown[]).entries()) {
      const mm = merge as Record<string, unknown>;
      if (!mm || !isInt(mm.row) || !isInt(mm.col) || !isInt(mm.rowCount) || !isInt(mm.colCount)) {
        throw bad(`sheets[${i}].merges[${m}] must have integer row, col, rowCount, colCount`);
      }
    }
  }
  return data as SheetGrid;
}

/** 문서 JSON은 SpreadJS 내부 형식이라 모양을 따지지 않는다 — JSON 객체인지만 본다. */
export function parseSheetDocument(raw: string | Buffer): Record<string, unknown> {
  let data: unknown;
  try {
    data = JSON.parse(raw.toString());
  } catch {
    throw new BadRequestException('The sheet document is not valid JSON.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new BadRequestException('The sheet document must be a JSON object.');
  }
  return data as Record<string, unknown>;
}

/** seed의 모양 검사 — Admin 입력과 기본 template 둘 다 이걸 거친다. */
export function parseSheetSeed(value: unknown): SheetSeed {
  const bad = (why: string) => new BadRequestException(`The template seed has the wrong shape: ${why}.`);
  if (!value || typeof value !== 'object') throw bad('not an object');
  const sheets = (value as Record<string, unknown>).sheets;
  if (!Array.isArray(sheets) || sheets.length === 0) throw bad('sheets must be a non-empty array');
  return {
    sheets: sheets.map((s, i) => {
      const sheet = (s ?? {}) as Record<string, unknown>;
      if (typeof sheet.name !== 'string' || !sheet.name.trim()) throw bad(`sheets[${i}].name is required`);
      if (!Array.isArray(sheet.rows) || sheet.rows.some((r) => !Array.isArray(r))) {
        throw bad(`sheets[${i}].rows must be an array of rows`);
      }
      const headerRowCount = Number(sheet.headerRowCount ?? 0);
      if (!isInt(headerRowCount)) throw bad(`sheets[${i}].headerRowCount must be a non-negative integer`);
      return {
        name: sheet.name.trim(),
        rows: (sheet.rows as unknown[][]).map((r) => r.map((c) => (c == null ? '' : String(c)))),
        merges: Array.isArray(sheet.merges)
          ? (sheet.merges as SheetMerge[]).filter((m) => m && isInt(m.row) && isInt(m.col) && isInt(m.rowCount) && isInt(m.colCount))
          : [],
        headerRowCount,
        filter: sheet.filter === true,
        columnWidths: Array.isArray(sheet.columnWidths)
          ? (sheet.columnWidths as unknown[]).map((w) => (typeof w === 'number' && w > 0 ? w : 64))
          : undefined,
        headerStyle: sheet.headerStyle && typeof sheet.headerStyle === 'object'
          ? {
              backColor: typeof (sheet.headerStyle as any).backColor === 'string' ? (sheet.headerStyle as any).backColor : undefined,
              foreColor: typeof (sheet.headerStyle as any).foreColor === 'string' ? (sheet.headerStyle as any).foreColor : undefined,
            }
          : undefined,
      };
    }),
  };
}
