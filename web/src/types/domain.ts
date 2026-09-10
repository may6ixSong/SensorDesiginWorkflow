/**
 * api는 사용자를 **KnoxID 문자열로만** 표현한다 — 이름/부서 등 사용자 정보는 전사 공통
 * SDPCommonAPI가 소유하고 web이 knoxId로 해석한다(설계서 01장 §6).
 * app/providers/DirectoryProvider.tsx의 useDirectory()/resolveUser()를 참고.
 */

/* ------------------------------------------------------------------ *
 * 공통
 * ------------------------------------------------------------------ */

/** 이 사람이 그 대상에 대해 갖는 실효 권한. null이면 접근할 수 없다. */
export type AccessLevel = 'edit' | 'view' | null;

/** 통합 신뢰도 티어 — A→D 신뢰도 내림차순(설계서 04장 §2). */
export type Tier = 'A' | 'B' | 'C' | 'D';

/** 망 구분. tier와 직교하는 별개 축이다 — HPC면 실물 파일 대신 경로 문자열만 갖는다. */
export type NetworkKind = 'OA' | 'HPC';

/**
 * 권한 한 벌 — **부서 다중 + 개별 사용자 다중**(설계서 01장 §3.3).
 * workflow, artifact(B/C/D), block.recipients(A) 전부 이 모양을 쓴다.
 */
export interface AccessGrant {
  departments: string[];
  users: string[];
}

export const emptyGrant = (): AccessGrant => ({ departments: [], users: [] });

/**
 * 일정 한 칸. 과제 마일스톤과 workflow phase가 같은 모양을 쓴다 — 다른 것은 소유자와
 * 의미뿐이다.
 *
 * ★ order 필드가 없다. 순서는 항상 start 오름차순으로 파생한다(lib/schedule.ts) —
 *   일정끼리 겹치는 것을 허용하므로, 손으로 매긴 순서를 저장하면 날짜와 어긋난 순서가
 *   굳어 버린다.
 * ★ name은 화면에 그대로 뜨는 짧은 표기다(예: 'KO', 'ML1'). full name은 없다.
 */
export interface ScheduleSpan {
  id: string;
  name: string;
  /** 'YYYY-MM-DD' */
  start: string;
  /** 'YYYY-MM-DD' */
  end: string;
}

/** 과제 공통 일정. 모든 workflow가 공유하는 큰 축이고, workflow phase의 초기값이다. */
export type Milestone = ScheduleSpan;

/**
 * workflow 하나만의 일정. 생성 시 마일스톤을 복사해 시작하지만 그 뒤로는 완전히 독립이라
 * 칸 수·이름·날짜가 전부 다를 수 있고 서로 겹쳐도 된다. 블록(BlockDto.phaseId)이 가리키는
 * 대상이며, 지워지면 그 블록은 "일정 유실" 상태로 캔버스에 남는다.
 */
export type WorkflowPhase = ScheduleSpan;

/* ------------------------------------------------------------------ *
 * Project
 * ------------------------------------------------------------------ */

export interface ProjectDto {
  _id: string;
  code: string;
  /**
   * `EVT` + 0 이상의 정수(`EVT0`, `EVT1`, …). 같은 code라도 revision이 다르면 완전히
   * 다른 과제다.
   *
   * ★ code와 함께 **생성 후 수정 절대 불가**다. Edit Project Info에서 두 필드는
   *   disabled이며(Admin도 동일), 서버도 400으로 거부한다(설계서 README §3.1).
   */
  revision: string;
  name: string;
  milestones: Milestone[];
  status: string;
  /** 화면 표시 전용 부가 필드. 다른 시스템 연동에 쓰지 않는다. */
  meta?: Record<string, string>;
}

/**
 * 과제 단위 부서별 팀원 로스터.
 *
 * ★ 이 명단이 **시스템 전체의 최종 관문**이다 — 여기 없는 사람은 workflow/artifact 권한을
 *   받았더라도 그 과제의 무엇도 볼 수 없다(설계서 01장 §2.2).
 * ★ departments가 배열인 이유는 한 사람이 여러 부서에 동시에 속할 수 있어서다. 이 값이
 *   "내가 이 과제에서 속한 부서"이자 부서 단위 권한의 판정 기준이다.
 */
export interface ProjectMemberDto {
  knoxId: string;
  departments: string[];
  addedAt: string;
}

export interface ProjectDetailDto extends ProjectDto {
  members: ProjectMemberDto[];
  /**
   * 이 과제가 인정하는 부서 목록. 새 과제는 기본 6개로 시작한다.
   * workflow/artifact의 Edit·View Access에 넣을 수 있는 부서 후보이자,
   * workflow가 소속될 수 있는 부서 후보다.
   */
  departments: string[];
  /** 마일스톤을 수정할 수 있는 Project Manager. workflow Edit Access와는 별개 role. */
  managers: string[];
}

/* ------------------------------------------------------------------ *
 * Workflow
 * ------------------------------------------------------------------ */

/** 캔버스 편집 단독 점유 상태(설계서 03장 §3). 만료된 lock은 서버가 null로 내려준다. */
export interface CanvasLockDto {
  holderKnoxId: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface WorkflowDto {
  id: string;
  projectId: string;
  name: string;
  description: string;
  /** 이 workflow가 소속된 부서. 반드시 하나이며 'unassigned'는 없다. */
  department: string;
  color: string;
  /**
   * 이 사람의 실효 권한. **null이어도 목록에는 실린다** — Information page가 "존재는
   * 보여주되 disabled로 잠근다"를 그려야 하기 때문이다(설계서 01장 §3.7).
   * app bar의 select는 null인 항목을 option에서 뺀다.
   */
  myAccess: AccessLevel;
  /** myAccess가 null이면 아래 값들은 서버가 비워서 내려준다. */
  ownerKnoxId: string | null;
  editAccess: AccessGrant | null;
  viewAccess: AccessGrant | null;
  phases: WorkflowPhase[];
  phaseWidths: Record<string, number>;
  releaseSeq: number;
  canvasLock: CanvasLockDto | null;
}

/* ------------------------------------------------------------------ *
 * Artifact
 * ------------------------------------------------------------------ */

export interface ArtifactVersionDto {
  tier: Tier;
  versionLabel: string;
  /**
   * 산출물이 자기 서비스 안에서 **공식 버전으로 확정**되었는가(publish).
   * workflow가 부서에 전달하는 release와는 다른 층위다.
   */
  isPublished: boolean;
  versionRef: string | null;
  giverKnoxId: string | null;
  giverDept: string | null;
  viewUrl: string | null;
  hpcPath: string | null;
  note: string;
  publishedAt: string | null;
  observedAt: string | null;
  createdAt: string;
}

/** 열람 권한이 없는 산출물 — 존재만 알리고 버전·링크·경로는 응답에서 빠진다. */
export interface MaskedArtifactDto {
  id: string;
  name: string;
  tier: Tier;
  network: NetworkKind;
  myAccess: null;
  masked: true;
}

export interface ArtifactDto {
  id: string;
  projectId: string;
  name: string;
  tier: Tier;
  network: NetworkKind;
  serviceKey: string | null;
  externalArtifactId: string | null;
  artifactTypeKey: string | null;
  externalUrl: string | null;
  myAccess: AccessLevel;
  /**
   * B/C/D만 값이 있다. A는 그 서비스가 권한을 판정하므로 항상 null이다(설계서 04장 §3).
   */
  editAccess: AccessGrant | null;
  viewAccess: AccessGrant | null;
  /**
   * B/C/D는 viewAccess가 곧 recipient이며 서버가 그 값을 복사해 채워 준다(읽기 전용).
   * **A Tier의 recipient는 artifact가 아니라 block에 있다** — workflow마다 다르기 때문이다.
   */
  recipients: AccessGrant | null;
  versions: ArtifactVersionDto[];
  createdBy: string;
  masked?: false;
}

export const isMaskedArtifact = (a: ArtifactDto | MaskedArtifactDto | null): a is MaskedArtifactDto =>
  !!a && (a as MaskedArtifactDto).masked === true;

/* ------------------------------------------------------------------ *
 * Block (캔버스 위의 자리)
 * ------------------------------------------------------------------ */

/**
 * publish 3상태(설계서 03장 §2.2). 블록에는 **버전 숫자를 쓰지 않고** 이 배지만 그린다.
 *   unpublished    — published 버전이 하나도 없다
 *   published      — 있고, 마지막 release 이후 major 변화가 없다
 *   newlyPublished — 있고, 마지막 release 이후 major가 올라갔다(= 다음 release 대상)
 */
export type PublishState = 'unpublished' | 'published' | 'newlyPublished';

export interface BlockDto {
  id: string;
  workflowId: string;
  phaseId: string;
  name: string;
  layout: { x: number; y: number; w: number; h: number };
  /** 지금은 항상 'own'이다 — 받는 산출물 UX는 TODO T2. */
  intent: 'own' | 'received';
  artifactId: string | null;
  /** 열람 권한이 없으면 masked 형태로 온다. 미매핑이면 null. */
  artifact: ArtifactDto | MaskedArtifactDto | null;
  publishState: PublishState;
  /**
   * **A Tier에서만** 값이 있다 — 같은 artifact라도 workflow마다 recipient 구성이 다를 수
   * 있어 block에 붙는다(설계서 01장 §4.1). B/C/D는 null이고 artifact.recipients를 본다.
   */
  recipients: { editAccess: AccessGrant; viewAccess: AccessGrant } | null;
  series: string | null;
  seriesIdx: number;
  seriesTotal: number;
}

export interface MemoDto {
  _id: string;
  workflowId: string;
  phaseId: string;
  text: string;
  layout: { x: number; y: number; w: number; h: number };
}

export interface EdgeDto {
  _id: string;
  workflowId: string;
  fromId: string;
  toId: string;
  bidirectional: boolean;
  auto: boolean;
}

/* ------------------------------------------------------------------ *
 * Hub (외부 산출물 서비스 연동)
 * ------------------------------------------------------------------ */

/**
 * 과제(code+revision)를 외부 서비스의 프로젝트와 이을 때 그 서비스가 돌려주는 후보.
 * 자동으로 잇지 않고 사람이 확정한다 — 코드 체계가 서비스마다 미묘하게 다르기 때문이다.
 */
export interface ProjectSearchCandidateDto {
  externalProjectId: string;
  displayName: string;
  code: string;
  revision: string | null;
}

/* ------------------------------------------------------------------ *
 * Release
 * ------------------------------------------------------------------ */

/** release 기록에 얼려둔 버전 사실. 이후 서비스가 버전을 더 올려도 이 값은 안 바뀐다. */
export interface ReleasedVersionDto {
  versionLabel: string;
  versionRef: string | null;
  majorKey: string | null;
  publishedAt: string | null;
  viewUrl: string | null;
  hpcPath: string | null;
  giverKnoxId: string | null;
}

export interface ReleaseItemSourceDto {
  blockId: string;
  artifactId: string | null;
  artifactName: string;
  /** null이면 그 source가 아직 한 번도 publish되지 않았다 — "아직 전달되지 않음". */
  selected: ReleasedVersionDto | null;
}

export interface ReleaseItemDto {
  blockId: string;
  artifactId: string;
  artifactName: string;
  tier: Tier;
  network: NetworkKind;
  phaseId: string;
  phaseName: string;
  /** null이면 한 번도 publish된 적 없음 — 표에 `Not published`로 표기한다. */
  published: ReleasedVersionDto | null;
  /** 직전 release 대비 major가 달라졌는가 — 표에서 highlight되는 행이다. */
  changed: boolean;
  firstTime: boolean;
  lookupFailed: boolean;
  recipients: AccessGrant;
  sources: ReleaseItemSourceDto[];
  /** 지금 이 사람이 그 산출물을 볼 수 없으면 true — 버전·링크가 비어서 온다. */
  masked: boolean;
}

export interface ReleaseDto {
  id: string;
  projectId: string;
  workflowId: string;
  seq: number;
  /** 화면 표기는 항상 `v{seq}` — 단일 정수 시퀀스다(major.minor가 아니다). */
  label: string;
  releasedAt: string;
  releasedBy: string;
  note: string;
  workflowAt: { name: string; department: string };
  recipientDepartments: string[];
  items: ReleaseItemDto[];
}

/** release 다이얼로그가 쓰는 미리보기 한 줄. 실행과 같은 로직으로 계산된다. */
export interface ReleasePreviewItemDto {
  blockId: string;
  artifactId: string;
  artifactName: string;
  tier: Tier;
  network: NetworkKind;
  phaseId: string;
  phaseName: string;
  published: ReleasedVersionDto | null;
  changed: boolean;
  firstTime: boolean;
  lookupFailed: boolean;
  recipients: AccessGrant;
  /**
   * `changed: true`인 항목만 후보가 채워진다 — 그 경우에만 화면에 picker를 띄운다.
   * 나머지는 직전 release의 선택을 그대로 이어받으므로 다시 묻지 않는다(설계서 05장 §4.2).
   */
  sources: {
    blockId: string;
    artifactId: string;
    artifactName: string;
    candidates: ReleasedVersionDto[];
    defaultVersionRef: string | null;
    selected: ReleasedVersionDto | null;
  }[];
}

export interface ReleasePreviewDto {
  workflowId: string;
  nextSeq: number;
  items: ReleasePreviewItemDto[];
  changedCount: number;
}
