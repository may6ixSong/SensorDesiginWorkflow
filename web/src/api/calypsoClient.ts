import { apiClient, ApiEnvelope } from './client';

/**
 * File Artifacts(Calypso, Tier B) — SIREN BE의 프록시를 통해서만 호출한다(설계서 07장 §2).
 *
 * ★ 예전에는 이 파일이 axios로 Calypso backend를 브라우저에서 직접 호출했다(knoxId/
 *   departments/actingAs 헤더도 여기서 직접 실었다). 이제 SIREN FE는 Calypso를 절대
 *   직접 호출하지 않는다 — 전부 SIREN BE(`/calypso-artifacts`)를 거치고, 그 department
 *   계산도 SIREN BE가 (actor + project 멤버십으로) 대신 한다. 그래서 이 파일의 모든
 *   함수는 `projectId`를 받아 그대로 SIREN BE에 실어 보낼 뿐, 헤더를 직접 만들지 않는다
 *   — `setCalypsoUserDepartments`/`setCalypsoActingAsGroup` 같은 전역 상태도 더 이상
 *   필요 없어 제거했다.
 */

export interface CalypsoFile {
  fileName: string;
  storageKey: string;
}

export interface CalypsoLink {
  url: string;
  label: string;
}

export interface CalypsoPathEntry {
  path: string;
  label: string;
}

export interface CalypsoVersionView {
  versionLabel: string;
  isReleased: boolean;
  versionRef: string;
  /** network와 무관하게 항상 올릴 수 있다 — 한 버전에 여러 파일이 있을 수 있다. */
  files: CalypsoFile[];
  /** network==='OA'인 artifact에서만 쓴다 — 여러 개 가능(사용자 요청). */
  links: CalypsoLink[];
  /** network==='HPC'인 artifact에서만 쓴다 — 여러 개 가능(사용자 요청). */
  paths: CalypsoPathEntry[];
  /** 짧은 한 줄 메모 — 필수, 서식 없는 텍스트. */
  versionNote: string;
  /** 서식 있는(HTML) 긴 설명 — 선택. 렌더링 전 반드시 sanitize한다. */
  description: string;
  createdBy: string;
  createdAt: string;
}

export interface CalypsoGrant {
  type: 'user' | 'department';
  knoxId: string | null;
  department: string | null;
  grantedBy: string;
  grantedAt: string;
}

export type CalypsoGrantInput =
  | { type: 'user'; knoxId: string }
  | { type: 'department'; department: string };

export interface CalypsoArtifact {
  id: string;
  projectId: string;
  department: string;
  name: string;
  description: string;
  /** 'OA' | 'HPC' — 언제든 edit 권한자가 바꿀 수 있다(사용자 요청, `setCalypsoNetwork`).
   * 기존 버전들의 콘텐츠는 그대로 남는다. null은 마이그레이션 전의 예전 문서에만 남는다. */
  network: 'OA' | 'HPC' | null;
  createdBy: string;
  /** 'edit'이면 업로드/릴리스/권한관리 가능, 'view'면 released 버전만 열람. */
  myAccess: 'edit' | 'view';
  versionCount: number;
  latestVersion: CalypsoVersionView | null;
  releasedVersion: CalypsoVersionView | null;
  versions?: CalypsoVersionView[];
  editors: CalypsoGrant[];
  viewGrants: CalypsoGrant[];
  /** false(기본) — project member 누구나 view 가능. true면 viewGrants로만 제한. */
  restrictView: boolean;
  /** 'sheet'면 엑셀처럼 편집하는 표(설계서 11장) — 버전은 sheet 편집기로만 만든다. */
  contentKind: 'file' | 'sheet';
  /** sheet를 만들 때 불러온 template과 그 개정본. 없으면 빈 시트에서 시작했다. */
  templateKey: string | null;
  templateRevision: number | null;
}

export async function listCalypsoArtifacts(query: {
  projectId: string; department?: string; mine?: boolean;
}): Promise<CalypsoArtifact[]> {
  const params: Record<string, string> = { projectId: query.projectId };
  if (query.department) params.department = query.department;
  if (query.mine) params.mine = 'true';
  const { data } = await apiClient.get<ApiEnvelope<CalypsoArtifact[]>>('/calypso-artifacts', { params });
  return data.data;
}

export async function getCalypsoArtifact(id: string, projectId: string): Promise<CalypsoArtifact> {
  const { data } = await apiClient.get<ApiEnvelope<CalypsoArtifact>>(`/calypso-artifacts/${id}`, { params: { projectId } });
  return data.data;
}

export async function createCalypsoArtifact(input: {
  projectId: string; department: string; name: string; description?: string; network: 'OA' | 'HPC';
  contentKind?: 'file' | 'sheet'; templateKey?: string;
}): Promise<CalypsoArtifact> {
  const { data } = await apiClient.post<ApiEnvelope<CalypsoArtifact>>('/calypso-artifacts', input);
  return data.data;
}

/**
 * 새 버전 추가 — 파일은 network와 무관하게 항상 올릴 수 있고, 그 위에 network에 맞는
 * 위치 정보(OA면 links, HPC면 paths)도 몇 개든 같이 붙일 수 있다(사용자 요청, §3.9).
 * links/paths는 파일 업로드와 같은 multipart 요청 안에 JSON 문자열로 실어 보낸다.
 */
export async function addCalypsoVersion(
  id: string,
  projectId: string,
  input: { files?: File[]; links?: CalypsoLink[]; paths?: CalypsoPathEntry[] },
  versionNote: string,
  description?: string,
): Promise<CalypsoArtifact> {
  const form = new FormData();
  (input.files ?? []).forEach((f) => form.append('files', f));
  if (input.links?.length) form.append('linksJson', JSON.stringify(input.links));
  if (input.paths?.length) form.append('pathsJson', JSON.stringify(input.paths));
  form.append('versionNote', versionNote);
  if (description) form.append('description', description);
  const { data } = await apiClient.post<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/versions`, form, { params: { projectId } },
  );
  return data.data;
}

/**
 * sourceVersionRef를 안 주면 지금까지처럼 최신 minor를 승격한다. 주면 그 minor(released
 * 아니어야 함)의 콘텐츠로 새 released 버전을 만든다 — version tree에서 과거 작업본을
 * 골라 publish하는 경로(사용자 요청).
 */
export async function releaseCalypsoArtifact(
  id: string, projectId: string, versionNote: string, description?: string, sourceVersionRef?: string,
): Promise<CalypsoArtifact> {
  const { data } = await apiClient.post<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/release`, { versionNote, description, sourceVersionRef }, { params: { projectId } },
  );
  return data.data;
}

/**
 * 파일이 하나면 그대로, 여러 개면 zip으로 묶여서 내려온다 — Calypso가 그 판정을 한다
 * (설계서 04장 §2, §6). 파일명은 응답의 `Content-Disposition`에서 그대로 읽는다 —
 * 단일 파일이면 원래 이름, zip이면 Calypso가 붙인 `{artifact명}-{major}.{minor}.zip`이다.
 */
export async function downloadCalypsoVersion(
  id: string, projectId: string, versionRef: string,
): Promise<{ blob: Blob; filename: string | null }> {
  const res = await apiClient.get<Blob>(
    `/calypso-artifacts/${id}/download/${encodeURIComponent(versionRef)}`,
    { params: { projectId }, responseType: 'blob' },
  );
  const disposition = res.headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename="?([^";]+)"?/);
  const filename = match ? decodeURIComponent(match[1]) : null;
  return { blob: res.data, filename };
}

export async function addCalypsoEditor(id: string, projectId: string, grant: CalypsoGrantInput): Promise<CalypsoArtifact> {
  const { data } = await apiClient.post<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/editors`, grant, { params: { projectId } },
  );
  return data.data;
}

export async function removeCalypsoEditor(id: string, projectId: string, grant: CalypsoGrantInput): Promise<CalypsoArtifact> {
  const { data } = await apiClient.delete<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/editors`, { params: { projectId }, data: grant },
  );
  return data.data;
}

export async function addCalypsoViewGrant(id: string, projectId: string, grant: CalypsoGrantInput): Promise<CalypsoArtifact> {
  const { data } = await apiClient.post<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/view-grants`, grant, { params: { projectId } },
  );
  return data.data;
}

export async function removeCalypsoViewGrant(id: string, projectId: string, grant: CalypsoGrantInput): Promise<CalypsoArtifact> {
  const { data } = await apiClient.delete<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/view-grants`, { params: { projectId }, data: grant },
  );
  return data.data;
}

/** SIREN 과제의 부서 하나 — `id`가 grant/필터에 쓰는 값이고, `name`은 그 순간의
 *  표시 이름이다(설계서 02장 §9). SIREN을 거쳐 오므로 이름은 항상 최신이다. */
export interface CalypsoDepartment {
  id: string;
  name: string;
}

export interface CalypsoDepartmentRoster {
  departments: CalypsoDepartment[];
  /** departments는 각 멤버가 속한 부서 **id** 목록이다. */
  members: { knoxId: string; departments: string[] }[];
}

/**
 * Access 패널의 부서/멤버 로스터 — 일부러 Calypso를 한 번 거쳐 SIREN에게 되묻는다
 * (사용자 결정, Calypso가 나중에 독립 서비스로 분리될 때를 대비한 경로).
 */
export async function getCalypsoDepartmentRoster(projectId: string): Promise<CalypsoDepartmentRoster> {
  const { data } = await apiClient.get<ApiEnvelope<CalypsoDepartmentRoster>>(
    '/calypso-artifacts/department-roster', { params: { projectId } },
  );
  return data.data;
}

export async function setCalypsoRestrictView(id: string, projectId: string, restrictView: boolean): Promise<CalypsoArtifact> {
  const { data } = await apiClient.patch<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/restrict-view`, { restrictView }, { params: { projectId } },
  );
  return data.data;
}

/**
 * network를 언제든 바꿀 수 있게 한다(사용자 요청) — 기존 버전들의 콘텐츠는 그대로
 * 둔다, 호출부가 변경 전에 그 영향을 경고한다.
 */
export async function setCalypsoNetwork(id: string, projectId: string, network: 'OA' | 'HPC'): Promise<CalypsoArtifact> {
  const { data } = await apiClient.patch<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/network`, { network }, { params: { projectId } },
  );
  return data.data;
}

// ── Sheet (설계서 11장) ────────────────────────────────────────────────

/** 시트 병합 범위 — 0부터 센다. */
export interface SheetMerge {
  row: number;
  col: number;
  rowCount: number;
  colCount: number;
}

/** 소비자(HPC 등)가 받는 셀 값 격자 — 화면에 보이는 문자열 그대로. */
export interface SheetGrid {
  format: 'siren-sheet-grid';
  version: 1;
  sheets: { name: string; rows: string[][]; merges: SheetMerge[] }[];
}

/** SpreadJS 문서 JSON — 내용은 SpreadJS 형식이라 SIREN은 들여다보지 않는다. */
export type SheetDocument = Record<string, unknown>;

/** 기본 template의 중립 명세 — 편집기(sheet-host)가 워크북으로 만든다. */
export type SheetSeed = Record<string, unknown>;

export interface SheetStart {
  source: 'version' | 'template' | 'empty';
  versionLabel: string | null;
  templateKey: string | null;
  templateRevision: number | null;
  document: SheetDocument | null;
  seed: SheetSeed | null;
}

export interface SheetVersionContent {
  versionRef: string;
  versionLabel: string;
  isReleased: boolean;
  document: SheetDocument;
  grid: SheetGrid;
}

/** 다음 편집의 시작 시트 — 최신 버전, 없으면 template, 그것도 없으면 빈 시트. edit 권한자만. */
export async function getCalypsoSheetStart(id: string, projectId: string): Promise<SheetStart> {
  const { data } = await apiClient.get<ApiEnvelope<SheetStart>>(`/calypso-artifacts/${id}/sheet`, { params: { projectId } });
  return data.data;
}

export async function getCalypsoSheetVersion(id: string, projectId: string, versionRef: string): Promise<SheetVersionContent> {
  const { data } = await apiClient.get<ApiEnvelope<SheetVersionContent>>(
    `/calypso-artifacts/${id}/sheet/${encodeURIComponent(versionRef)}`, { params: { projectId } },
  );
  return data.data;
}

/** 파일 이름에 못 쓰는 글자를 걸러낸다 — 버전 파일 이름은 artifact 이름에서 온다. */
export function sheetFileBase(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'sheet';
}

/**
 * sheet 새 버전 — 편집기가 돌려준 문서 JSON·격자(·엑셀)를 보통 버전 업로드와 같은 경로로
 * 올린다. Calypso가 .ssjson/.grid.json 한 개씩 있는지만 본다(내용 검사 없음).
 */
export async function addCalypsoSheetVersion(
  a: Pick<CalypsoArtifact, 'id' | 'name'>,
  projectId: string,
  content: { document: SheetDocument; grid: SheetGrid; xlsx: Blob | null },
  versionNote: string,
  description?: string,
): Promise<CalypsoArtifact> {
  const base = sheetFileBase(a.name);
  const files: File[] = [
    new File([JSON.stringify(content.document)], `${base}.ssjson`, { type: 'application/json' }),
    new File([JSON.stringify(content.grid)], `${base}.grid.json`, { type: 'application/json' }),
  ];
  if (content.xlsx) {
    files.push(new File([content.xlsx], `${base}.xlsx`, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));
  }
  return addCalypsoVersion(a.id, projectId, { files }, versionNote, description);
}

export interface SheetTemplate {
  key: string;
  name: string;
  description: string;
  currentRevision: number;
  revisions: { revision: number; kind: 'document' | 'seed'; note: string; createdBy: string; createdAt: string }[];
  updatedBy: string;
  updatedAt: string | null;
}

export async function listSheetTemplates(): Promise<SheetTemplate[]> {
  const { data } = await apiClient.get<ApiEnvelope<SheetTemplate[]>>('/calypso-sheet-templates');
  return data.data;
}

/** 삭제 — 되살릴 수 없다. 이미 만든 artifact는 영향이 없다(설계서 11장 §3). */
export async function deleteSheetTemplate(key: string): Promise<void> {
  await apiClient.delete(`/calypso-sheet-templates/${encodeURIComponent(key)}`);
}

export async function getSheetTemplateStart(key: string, revision?: number): Promise<{
  key: string; name: string; revision: number; document: SheetDocument | null; seed: SheetSeed | null;
}> {
  const { data } = await apiClient.get(`/calypso-sheet-templates/${encodeURIComponent(key)}/start`, {
    params: revision ? { revision: String(revision) } : {},
  });
  return data.data;
}

export async function createSheetTemplate(input: {
  key: string; name: string; description?: string; fromKey?: string;
}): Promise<SheetTemplate> {
  const { data } = await apiClient.post<ApiEnvelope<SheetTemplate>>('/calypso-sheet-templates', input);
  return data.data;
}

export async function updateSheetTemplate(key: string, input: {
  name?: string; description?: string;
}): Promise<SheetTemplate> {
  const { data } = await apiClient.patch<ApiEnvelope<SheetTemplate>>(`/calypso-sheet-templates/${encodeURIComponent(key)}`, input);
  return data.data;
}

/** Admin이 편집기로 저장한 시트를 새 개정본으로 — 이미 만든 artifact에는 영향이 없다. */
export async function addSheetTemplateRevision(key: string, document: SheetDocument, note: string): Promise<SheetTemplate> {
  const form = new FormData();
  form.append('document', new File([JSON.stringify(document)], 'template.ssjson', { type: 'application/json' }));
  if (note) form.append('note', note);
  const { data } = await apiClient.post<ApiEnvelope<SheetTemplate>>(
    `/calypso-sheet-templates/${encodeURIComponent(key)}/revisions`, form,
  );
  return data.data;
}
