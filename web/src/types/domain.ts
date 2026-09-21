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

/**
 * 통합 신뢰도 티어 — A→C 신뢰도 내림차순(설계서 04장 §2).
 *
 * ★ Tier D(External/Attested)는 폐기했다 — File Artifacts(B, Calypso)가 OA-link/HPC-path
 *   참조형 콘텐츠까지 갖도록 넓어지면서 D의 역할을 대체했다.
 */
export type Tier = 'A' | 'B' | 'C';

/** 망 구분. tier와 직교하는 별개 축이다 — HPC면 실물 파일 대신 경로 문자열만 갖는다. */
export type NetworkKind = 'OA' | 'HPC' | null;

/**
 * 권한 한 벌 — **부서 다중 + 개별 사용자 다중**(설계서 01장 §3.3).
 * workflow의 editAccess/viewAccess, node.recipients 전부 이 모양을 쓴다.
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
 * 칸 수·이름·날짜가 전부 다를 수 있고 서로 겹쳐도 된다. 노드(NodeDto.phaseId)가 가리키는
 * 대상이며, 지워지면 그 노드는 "일정 유실" 상태로 캔버스에 남는다.
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
  /** myAccess가 null이면 아래 값들은 서버가 비워서 내려준다 — 단 phases/phaseWidths는
   * 예외다(사용자 결정). ProjectTimeline이 권한 없는 workflow도 실제 일정을 그리고
   * 그 위에 잠금 표시만 얹기 위해서다. */
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
  /** 이 버전을 안정적으로 참조하기 위한 식별자 (예: Comment의 versionId). */
  id: string | null;
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
  /** 이 버전에 html preview가 있는가 — Overview의 버전 히스토리에서 클릭 가능/하이라이트 판정. */
  hasHtmlView: boolean;
}

export interface ArtifactHtmlView {
  html: string;
  width: number;
  height: number;
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
  versions: ArtifactVersionDto[];
  createdBy: string;
  masked?: false;
}

export const isMaskedArtifact = (a: ArtifactDto | MaskedArtifactDto | null): a is MaskedArtifactDto =>
  !!a && (a as MaskedArtifactDto).masked === true;

/** Artifact 댓글 — 특정 버전에 대한 것이면 versionId/versionLabelSnapshot이 채워진다. */
export interface CommentDto {
  id: string;
  artifactId: string;
  versionId: string | null;
  versionLabelSnapshot: string;
  /** 대댓글이면 부모 comment의 id. */
  parentCommentId: string | null;
  text: string;
  createdBy: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ *
 * Node (캔버스 위의 자리)
 * ------------------------------------------------------------------ */

/**
 * publish 3상태(설계서 03장 §2.2). 노드에는 **버전 숫자를 쓰지 않고** 이 배지만 그린다.
 *   unpublished    — published 버전이 하나도 없다
 *   published      — 있고, 마지막 release 이후 major 변화가 없다
 *   newlyPublished — 있고, 마지막 release 이후 major가 올라갔다(= 다음 release 대상)
 */
export type PublishState = 'unpublished' | 'published' | 'newlyPublished';

export interface NodeDto {
  id: string;
  workflowId: string;
  phaseId: string;
  name: string;
  layout: { x: number; y: number; w: number; h: number };
  /** 내가 주는 산출물인지 받는 산출물인지 — 생성 시 확정되며 이후 바뀌지 않는다. */
  intent: 'own' | 'received';
  artifactId: string | null;
  /** 열람 권한이 없으면 masked 형태로 온다. 미매핑이면 null. */
  artifact: ArtifactDto | MaskedArtifactDto | null;
  publishState: PublishState;
  /** artifact가 매핑된 node에서만 값이 있다 — A/B/C 전부 공통이다(설계서 04장 §3.2). */
  recipients: AccessGrant | null;
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
  /** Windows 스티키 노트 색상 6종 중 하나. 없으면(기존 데이터) 기본색(yellow)으로 다룬다. */
  color?: string | null;
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
 * ------------------------------------------------------------------ *
 * project 사전 링크 단계(과거 ProjectSearchCandidateDto)는 폐지했다(설계서 07장 §7) —
 * 후보 조회마다 그 workflow가 속한 project의 code+revision을 실시간으로 필터로 쓴다.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Artifact 출처 선택 ("새 Artifact 추가" 다이얼로그, 설계서 04장 §6)
 * ------------------------------------------------------------------ */

/** intent 관점 — 이 workflow가 그 산출물을 주는지(own) 받는지(received). */
export type ArtifactIntent = 'own' | 'received';

/** 사용자에게 보이는 이름. Tier 글자는 화면에 절대 노출하지 않는다. */
export type ArtifactSourceKind = 'live' | 'file' | 'hpc';

export interface ArtifactCandidateDto {
  externalArtifactId: string;
  name: string;
  currentVersionLabel: string | null;
  level: AccessLevel;
  pickable: boolean;
  blockedReason: string | null;
}

export interface CandidateListDto {
  supported: boolean;
  candidates: ArtifactCandidateDto[];
  note?: string;
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
  nodeId: string;
  artifactId: string | null;
  artifactName: string;
  /** null이면 그 source가 아직 한 번도 publish되지 않았다 — "아직 전달되지 않음". */
  selected: ReleasedVersionDto | null;
}

export interface ReleaseItemDto {
  nodeId: string;
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

/** 초록/노랑/빨강 dot 세 개 — 순서대로 전부 수용, 일부만 수용, 현재는 수용 불가능. */
export type ReleaseFeedbackStatus = 'accepted' | 'partial' | 'blocked';

/** release 한 건에 대해, 그걸 받은 한 부서가 남긴 댓글 스레드 한 건(설계서 09장 §4.2~4.3).
 * 산출물 단위가 아니라 release 전체에 대한 것이다 — 다른 부서에는 절대 섞여 오지 않는다.
 * status는 최상위 댓글(`parentId === null`)에만 있다 — 답글은 새 상태를 선언하지 않는다. */
export interface ReleaseFeedbackDto {
  id: string;
  releaseId: string;
  department: string;
  parentId: string | null;
  status: ReleaseFeedbackStatus | null;
  comment: string;
  createdBy: string;
  createdAt: string;
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
  /** 지금 이 사람이 이 과제에서 속한 부서 전체(Admin은 그 과제의 전 부서). "받은 것"
   * 보기의 부서 필터 드롭다운 후보다(설계서 09장 §4.1). */
  viewerDepartments: string[];
}

/** release 다이얼로그가 쓰는 미리보기 한 줄. 실행과 같은 로직으로 계산된다. */
export interface ReleasePreviewItemDto {
  nodeId: string;
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
    nodeId: string;
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

/* ------------------------------------------------------------------ *
 * My Assignment (설계서 09장)
 * ------------------------------------------------------------------ */

export interface PageMetaDto {
  page: number;
  size: number;
  total: number;
  hasMore: boolean;
}

export interface PagedDto<T> {
  items: T[];
  meta: PageMetaDto;
}

/**
 * release 목록 한 줄.
 *
 * ★ 버전 라벨·링크·경로가 **없다.** 그 값들은 산출물별 열람 권한을 그 서비스에 라이브로
 *   물어봐야 정해지는데(01장 §4.2), 목록 한 페이지를 그리자고 산출물 수만큼 외부 호출을
 *   낼 수는 없기 때문이다. 행을 누르면 `GET /releases/:id`가 그 한 건에 대해서만 판정한다.
 */
export interface MyReleaseRowDto {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  workflowId: string;
  seq: number;
  label: string;
  releasedAt: string;
  releasedBy: string;
  note: string;
  workflowAt: { name: string; department: string };
  itemCount: number;
  changedCount: number;
  /** 이 release의 수신 부서 중 내가 속한 것만. */
  myRecipientDepartments: string[];
  received: boolean;
  published: boolean;
}

/** 내 부서가 주는 산출물 한 자리. 행의 정체성은 artifact가 아니라 node이다. */
export interface MyArtifactRowDto {
  nodeId: string;
  nodeName: string;
  workflowId: string;
  workflowName: string;
  workflowDepartment: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  phaseId: string;

  artifactId: string;
  artifactName: string;
  tier: Tier;
  network: NetworkKind;
  serviceKey: string | null;

  latestVersion: {
    versionLabel: string;
    isPublished: boolean;
    versionRef: string | null;
    occurredAt: string;
    viewUrl: string | null;
    hpcPath: string | null;
    giverKnoxId: string | null;
  } | null;
  versionCount: number;
  publishedVersionCount: number;

  recipientDepartments: string[];
  recipientUserCount: number;

  updatedAt: string;
}

/** 달력의 artifact 버전 발행 event 하나. */
export interface VersionEventDto {
  artifactId: string;
  artifactName: string;
  tier: Tier;
  network: NetworkKind;
  versionLabel: string;
  versionRef: string | null;
  /** false면 SIREN이 기록은 했지만 그 서비스가 아직 공식 확정하지 않은 작업중 버전이다. */
  isPublished: boolean;
  occurredAt: string;
  giverKnoxId: string | null;
  giverDept: string | null;
  viewUrl: string | null;
  hpcPath: string | null;
  projectId: string;
  projectCode: string;
  projectName: string;
  placements: { workflowId: string; workflowName: string; department: string; nodeId: string }[];
}

export interface CalendarDto {
  from: string;
  to: string;
  versionEvents: VersionEventDto[];
  releaseEvents: MyReleaseRowDto[];
}
