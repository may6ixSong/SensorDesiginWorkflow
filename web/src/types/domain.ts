/**
 * api/는 사용자를 KnoxID 문자열로만 표현한다 — 이름/부서/색 등 사용자 정보는
 * 전사 공통 SDP_COMMON_API의 소유이고, web이 knoxId로 해석한다.
 * app/providers/DirectoryProvider.tsx의 useDirectory()/resolveUser()를 참고.
 */

/**
 * 일정 한 칸. 과제 마일스톤과 workflow phase가 같은 모양을 쓴다 — 다른 것은 소유자와
 * 의미뿐이다(아래 Milestone / WorkflowPhase 주석 참고).
 *
 * ★ order 필드가 없다. 순서는 항상 start 오름차순으로 파생한다(lib/schedule.ts의
 *   sortSchedule) — 일정끼리 겹치는 것을 허용하기 때문에, 손으로 매긴 순서를 저장하면
 *   날짜와 어긋난 순서가 굳어 버린다.
 * ★ name은 화면에 그대로 뜨는 짧은 표기다(예: 'KO', 'ML1', 'AR'). full name은 없다 —
 *   workflow마다 일정을 다르게 잡게 되면서 이 약어가 무엇의 약자인지는 과제/조직마다
 *   달라졌고, 시스템이 추측해서 붙이지 않는다.
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
 * 칸 수·이름·날짜가 전부 다를 수 있고 서로 겹쳐도 된다. 산출물(DeliverableDto.phaseId)이
 * 가리키는 대상이며, 지워지면 그 산출물은 "일정 유실" 상태로 캔버스에 남는다.
 */
export type WorkflowPhase = ScheduleSpan;

export interface ProjectDto {
  _id: string;
  code: string;
  name: string;
  milestones: Milestone[];
  status: string;
}

/** 과제 단위 부서별 팀원 로스터 항목 — workflow owners/viewGrants(접근 권한)와는 별개의 정보성 명단. */
export interface ProjectMemberDto {
  knoxId: string;
  department: string;
  addedAt: string;
}

/** Project Information 페이지용 상세 — 목록용 ProjectDto에 팀원 로스터가 더해진 것. */
export interface ProjectDetailDto extends ProjectDto {
  members: ProjectMemberDto[];
  /**
   * 이 과제의 workflow가 고를 수 있는 설계 도메인 목록 (WorkflowDto.domain에 들어갈 값).
   * 과제마다 편집하는 데이터라 DEPARTMENTS 같은 고정 상수가 아니다
   * (PATCH /projects/:id/workflow-domains).
   */
  workflowDomains: string[];
  /**
   * 산출물 "Received from" 후보 부서 목록 — 과제마다 자유롭게 추가/삭제한다
   * (PATCH /projects/:id/departments). 새 과제는 기본 6개로 시작한다.
   */
  departments: string[];
  /** 마일스톤(공통 일정)을 수정할 수 있는 Project Manager의 knoxId 목록 — Workflow의 owners(Edit 권한)와는 별개 role. */
  managers: string[];
}

export interface ViewGrantDto {
  knoxId: string;
  department: string;
  grantedAt: string;
}

export interface WorkflowDto {
  id: string;
  projectId: string;
  name: string;
  description: string;
  color: string;
  /**
   * workflow가 속한 설계 도메인(예: 'Analog', 'Digital'). Design Workflow view가 이 값으로
   * 화면을 도메인 단위로 갈라 놓는다. 비어 있으면 UNASSIGNED로 묶인다
   * (web/src/lib/domainWorkflow.ts의 domainOf()).
   */
  domain?: string | null;
  /** 이 workflow만의 일정 — 항상 start 오름차순으로 내려온다. */
  phases: WorkflowPhase[];
  /** Edit 권한자의 knoxId 목록 — [0]이 Primary Owner. */
  owners: string[];
  viewGrants: ViewGrantDto[];
  myAccess: 'edit' | 'view';
}

export interface Layout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type VersionKind = 'major' | 'minor';

/** BE가 목업 MV() 모양으로 내려주는 버전 (권한 필터링 완료 — 설계서 6.1) */
export interface DeliverableVersionDto {
  major: number;
  minor: number;
  kind: VersionKind;
  file: string;
  note: string;
  /** 업로드/Release를 수행한 사용자의 knoxId. */
  by: string;
  at: string;
}

/** 산출물 수신 workflow 셀렉트 박스 및 Incoming 카드용 최소 정보. */
export interface WorkflowBriefDto {
  id: string;
  name: string;
  color: string;
}

export interface DeliverableDto {
  id: string;
  projectId: string;
  workflowId: string;
  /**
   * 이 산출물이 걸려 있는 phase의 id — 소유 workflow(workflowId)의 phase다.
   * 그 workflow의 phase 목록에 없는 값이면 "일정 유실" 상태로, 캔버스는 좌표를 그대로
   * 두고 유실 표시만 붙인다 (lib/canvasModel.ts의 isOrphanPhase).
   */
  phaseId: string;
  name: string;
  /**
   * name과 분리된 안정적 식별자 — 이름은 언제든 바뀔 수 있어서, 향후 외부 시스템과
   * 연동할 때는 이 값으로 매핑하도록 둔다. 지정하지 않으면 null(설계서 §8.1 로드맵).
   */
  artifactKey: string | null;
  docType: string;
  network: 'OA' | 'HPC';
  series: string | null;
  seriesIdx: number;
  seriesTotal: number;
  layout: Layout;
  recvDept: string | null;
  /** 수신 담당자의 knoxId. */
  recvContact: string | null;
  /** 이 산출물을 받아야 하는 다른 workflow — 설정되면 그 보드에 Incoming으로 노출된다. */
  recvWorkflowId: string | null;
  /**
   * 이 시스템에 없는 외부 부서(파운드리 등)로부터 받았음을 나타내는 자유 텍스트.
   * recvWorkflowId와 달리 이 값이 있어도 여전히 own 산출물 그대로다 — 위치·phase를
   * own처럼 자유롭게(여러 phase 포함) 편집할 수 있다.
   */
  sourceDept: string | null;
  /** 받을 때의 개별 연락처 — 자유 텍스트(이름/이메일/전화 등, 시스템 계정을 전제하지 않음). */
  sourceContact: string | null;
  /** 권한에 맞게 이미 필터링된 버전 목록 */
  versions: DeliverableVersionDto[];
  releasedVersion: DeliverableVersionDto | null;
  workingVersion: DeliverableVersionDto | null;
  canEdit: boolean;
  /** Incoming 목록에서만 채워진다 — 이 산출물을 준 workflow. */
  sourceWorkflow: WorkflowBriefDto | null;
  /**
   * Incoming 목록에서만 채워진다 — 이 산출물이 "주는 쪽 workflow"에서 걸려 있던 phase.
   * phase는 이제 workflow마다 다르므로 phaseId만으로는 받는 쪽 캔버스에서 아무것도 찾을 수
   * 없다. 그래서 날짜 구간을 함께 받아, 받는 쪽 자기 phase 중 날짜가 맞는 칸에 놓는다.
   */
  sourcePhase: WorkflowPhase | null;
}

/** GET /workflows/:workflowId/deliverables 응답 — own은 이 workflow가 주는 산출물, incoming은 받는 산출물. */
export interface DeliverablesListResponse {
  data: DeliverableDto[];
  incoming: DeliverableDto[];
}

export interface MemoDto {
  _id: string;
  workflowId: string;
  phaseId: string;
  text: string;
  layout: Layout;
  createdBy: string;
}

export interface EdgeDto {
  _id: string;
  workflowId: string;
  fromId: string;
  toId: string;
  bidirectional: boolean;
  auto: boolean;
}

export interface HldItemDto {
  version: string;
  file: string | null;
  at: string;
  comment: string;
}

export interface HldReleaseDto {
  _id: string;
  workflowId: string;
  version: string;
  date: string;
  releasedBy: string;
  note: string;
  items: Record<string, HldItemDto>;
}
