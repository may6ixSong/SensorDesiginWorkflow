/**
 * 표(table) template 정의와 검증 — 순수 함수(의존성 없음).
 *
 * ★ web/src/lib/tableValidation.ts와 **같은 파일**이다. FE는 입력하는 즉시 표시하려고,
 *   Calypso는 저장할 때 다시 판정하려고 같은 규칙을 쓴다. 한쪽을 고치면 반드시 다른 쪽도
 *   똑같이 고친다(SIREN docs/11-table-templates.md §4).
 */

export type ColumnType = 'string' | 'integer' | 'number' | 'enum' | 'ref';
export type IssueSeverity = 'error' | 'warning';

export interface TemplateColumn {
  /** 저장·전송에 쓰는 키 — 행 데이터는 `{ [key]: string }`. 바꾸면 기존 데이터와 끊긴다. */
  key: string;
  /** 표 머리글에 보이는 이름(엑셀 헤더와 같게). */
  label: string;
  /** 엑셀 가져오기 때 이 컬럼으로 인식할 헤더 이름들(대소문자·공백·기호 무시). key/label은 자동 포함. */
  aliases?: string[];
  type: ColumnType;
  required?: boolean;
  /** enum: 허용 값. */
  options?: string[];
  /** enum/pattern 비교에서 대소문자를 구분할지(기본 false). */
  caseSensitive?: boolean;
  /** number: "0.8V"처럼 숫자 뒤 단위를 허용할지. */
  allowUnit?: boolean;
  min?: number;
  max?: number;
  /** 정규식(값 전체). 어떤 type에도 추가로 걸 수 있다. */
  pattern?: string;
  patternMessage?: string;
  /** 같은 값이 두 번 나오면 오류. */
  unique?: boolean;
  /** ref: 이 값이 같은 표의 다른 컬럼 값 중 하나여야 한다. */
  ref?: {
    column: string;
    /** 참조 대상 행을 좁힌다 — 예: Port == PWR 인 행의 Pin name만. */
    where?: { column: string; equals: string } | null;
    /** 비교할 때 양쪽의 `[MSB:LSB]`를 떼고 본다. */
    stripBitRange?: boolean;
    /** 못 찾았을 때 심각도(기본 warning). */
    severity?: IssueSeverity;
  };
  /** 이 값들은 "비어 있음"으로 본다(예: N/A, -) — 형식·참조 검사를 건너뛴다. */
  emptyTokens?: string[];
  /** 엑셀 가져오기: 빈 칸이면 위 행 값을 이어받는다(병합 셀로 묶어 둔 컬럼). */
  fillDown?: boolean;
  /** 엑셀 내보내기: 위아래로 같은 값이 이어지면 셀을 병합한다. */
  mergeOnExport?: boolean;
  width?: number;
  description?: string;
}

export interface TableTemplateDef {
  key: string;
  name: string;
  description: string;
  /** 엑셀 시트 이름 — 가져오기 때 이 이름이 들어간 시트를 먼저 찾고, 내보내기 때 이 이름을 쓴다. */
  sheetName: string;
  version: number;
  columns: TemplateColumn[];
}

export type TableRow = Record<string, string>;

export interface CellIssue {
  /** 0-based 행 번호(표 안에서의 순서). */
  row: number;
  column: string;
  severity: IssueSeverity;
  message: string;
}

export interface ValidationResult {
  issues: CellIssue[];
  errorCount: number;
  warningCount: number;
}

export function normalizeHeader(text: string): string {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** 엑셀 헤더 문자열 → 컬럼 key. 못 찾으면 null. */
export function matchHeader(columns: TemplateColumn[], text: string): string | null {
  const n = normalizeHeader(text);
  if (!n) return null;
  for (const c of columns) {
    const names = [c.key, c.label, ...(c.aliases ?? [])].map(normalizeHeader);
    if (names.includes(n)) return c.key;
  }
  return null;
}

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function isBlankRow(columns: TemplateColumn[], row: TableRow): boolean {
  return columns.every((c) => cellText(row[c.key]).trim() === '');
}

/** 행을 template 컬럼만 남긴 문자열 사전으로 정리하고, 완전히 빈 행은 버린다. */
export function sanitizeRows(columns: TemplateColumn[], rows: unknown[]): TableRow[] {
  const out: TableRow[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const row: TableRow = {};
    for (const c of columns) row[c.key] = cellText((raw as Record<string, unknown>)[c.key]);
    if (!isBlankRow(columns, row)) out.push(row);
  }
  return out;
}

export function stripBitRange(value: string): string {
  const i = value.indexOf('[');
  return (i === -1 ? value : value.slice(0, i)).trim();
}

const INTEGER_RE = /^[-+]?\d+(\.0+)?$/;
const NUMBER_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const NUMBER_WITH_UNIT_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*[a-zA-Zµ%]*$/;

function isEmptyValue(col: TemplateColumn, v: string): boolean {
  if (v === '') return true;
  const tokens = (col.emptyTokens ?? []).map((t) => t.trim().toLowerCase());
  return tokens.includes(v.toLowerCase());
}

function safeRegExp(pattern: string, caseSensitive?: boolean): RegExp | null {
  try {
    return new RegExp(pattern, caseSensitive ? '' : 'i');
  } catch {
    return null;
  }
}

/**
 * 표 전체를 검사한다. 오류(error)는 publish를 막고, 경고(warning)는 표시만 한다.
 * 빈 칸이 허용된 컬럼에서 값이 비어 있거나 emptyTokens면 형식·참조 검사는 건너뛴다.
 */
export function validateTable(columns: TemplateColumn[], rows: TableRow[]): ValidationResult {
  const issues: CellIssue[] = [];
  const push = (row: number, column: string, severity: IssueSeverity, message: string) =>
    issues.push({ row, column, severity, message });

  // ref 대상 집합과 unique 집계는 표 전체를 한 번 훑어서 만든다.
  const refSets = new Map<string, Set<string>>();
  for (const c of columns) {
    if (c.type !== 'ref' || !c.ref) continue;
    const { column, where, stripBitRange: strip } = c.ref;
    const set = new Set<string>();
    for (const r of rows) {
      if (where && cellText(r[where.column]).trim().toLowerCase() !== where.equals.trim().toLowerCase()) continue;
      const target = cellText(r[column]).trim();
      if (target) set.add(strip ? stripBitRange(target) : target);
    }
    refSets.set(c.key, set);
  }
  const seen = new Map<string, Map<string, number>>();

  rows.forEach((row, i) => {
    for (const c of columns) {
      const v = cellText(row[c.key]).trim();
      if (v === '') {
        if (c.required) push(i, c.key, 'error', `${c.label} is required.`);
        continue;
      }
      if (isEmptyValue(c, v)) continue;

      switch (c.type) {
        case 'integer': {
          if (!INTEGER_RE.test(v)) {
            push(i, c.key, 'error', `${c.label} must be a whole number.`);
            break;
          }
          const n = Number(v);
          if (c.min !== undefined && n < c.min) push(i, c.key, 'error', `${c.label} must be at least ${c.min}.`);
          if (c.max !== undefined && n > c.max) push(i, c.key, 'error', `${c.label} must be at most ${c.max}.`);
          break;
        }
        case 'number': {
          const ok = (c.allowUnit ? NUMBER_WITH_UNIT_RE : NUMBER_RE).test(v);
          if (!ok) {
            push(i, c.key, 'error', c.allowUnit
              ? `${c.label} must be a number, optionally with a unit (e.g. 0.8V).`
              : `${c.label} must be a number.`);
            break;
          }
          const n = parseFloat(v);
          if (c.min !== undefined && n < c.min) push(i, c.key, 'error', `${c.label} must be at least ${c.min}.`);
          if (c.max !== undefined && n > c.max) push(i, c.key, 'error', `${c.label} must be at most ${c.max}.`);
          break;
        }
        case 'enum': {
          const options = c.options ?? [];
          const hit = c.caseSensitive
            ? options.includes(v)
            : options.some((o) => o.toLowerCase() === v.toLowerCase());
          if (!hit) push(i, c.key, 'error', `${c.label} must be one of: ${options.join(', ')}.`);
          break;
        }
        case 'ref': {
          if (!c.ref) break;
          const probe = c.ref.stripBitRange ? stripBitRange(v) : v;
          if (!refSets.get(c.key)?.has(probe)) {
            const scope = c.ref.where ? ` with ${c.ref.where.column} = ${c.ref.where.equals}` : '';
            push(i, c.key, c.ref.severity ?? 'warning', `No row${scope} has ${c.ref.column} "${probe}".`);
          }
          break;
        }
        default:
          break;
      }

      if (c.pattern) {
        const re = safeRegExp(c.pattern, c.caseSensitive);
        if (re && !re.test(v)) push(i, c.key, 'error', c.patternMessage || `${c.label} has an unexpected format.`);
      }

      if (c.unique) {
        const counts = seen.get(c.key) ?? new Map<string, number>();
        const prev = counts.get(v);
        if (prev !== undefined) {
          push(i, c.key, 'error', `${c.label} "${v}" is already used in row ${prev + 1}.`);
        } else {
          counts.set(v, i);
        }
        seen.set(c.key, counts);
      }
    }
  });

  let errorCount = 0;
  let warningCount = 0;
  for (const it of issues) {
    if (it.severity === 'error') errorCount += 1;
    else warningCount += 1;
  }
  return { issues, errorCount, warningCount };
}

/** template 정의 자체의 문제 — Admin 편집 화면과 Calypso 저장이 같이 쓴다. */
export function templateProblems(def: Pick<TableTemplateDef, 'key' | 'name' | 'columns'>): string[] {
  const out: string[] = [];
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(def.key ?? '')) {
    out.push('Template key must be 2–63 characters of lowercase letters, digits and dashes.');
  }
  if (!def.name?.trim()) out.push('Template name is required.');
  if (!def.columns?.length) out.push('Add at least one column.');
  const keys = new Set<string>();
  const headerNames = new Map<string, string>();
  for (const c of def.columns ?? []) {
    const k = c.key?.trim();
    if (!k) { out.push('Every column needs a key.'); continue; }
    if (keys.has(k)) out.push(`Duplicate column key "${k}".`);
    keys.add(k);
    if (!c.label?.trim()) out.push(`Column "${k}" needs a label.`);
    for (const n of [k, c.label, ...(c.aliases ?? [])].map(normalizeHeader).filter(Boolean)) {
      const owner = headerNames.get(n);
      if (owner && owner !== k) out.push(`Header name "${n}" matches both "${owner}" and "${k}".`);
      headerNames.set(n, k);
    }
    if (!['string', 'integer', 'number', 'enum', 'ref'].includes(c.type)) out.push(`Column "${k}" has an unknown type.`);
    if (c.type === 'enum' && !(c.options ?? []).filter((o) => o.trim()).length) out.push(`Enum column "${k}" needs options.`);
    if (c.pattern && !safeRegExp(c.pattern)) out.push(`Column "${k}" has an invalid pattern.`);
  }
  for (const c of def.columns ?? []) {
    if (c.type !== 'ref') continue;
    if (!c.ref?.column || !keys.has(c.ref.column)) out.push(`Ref column "${c.key}" must point to an existing column.`);
    if (c.ref?.where && !keys.has(c.ref.where.column)) out.push(`Ref column "${c.key}" filters on an unknown column.`);
  }
  return out;
}
