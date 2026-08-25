/**
 * api/는 사용자를 KnoxID 문자열로만 표현한다 — 이름/부서/색 등 사용자 정보는
 * 전사 공통 플랫폼(USER_GROUP_API)의 소유이고, web이 knoxId로 해석한다.
 * shared/constants/mock-users.ts의 findDirectoryUser()를 참고.
 */

export interface PhaseRef {
  key: string;
  label: string;
  start: string;
  end: string;
  order: number;
}

export interface ProjectDto {
  _id: string;
  code: string;
  name: string;
  domain: string;
  phases: PhaseRef[];
  status: string;
}

/** 과제 단위 부서별 팀원 로스터 항목 — IP owners/viewGrants(접근 권한)와는 별개의 정보성 명단. */
export interface ProjectMemberDto {
  knoxId: string;
  department: string;
  addedAt: string;
}

/** Project Information 페이지용 상세 — 목록용 ProjectDto에 팀원 로스터가 더해진 것. */
export interface ProjectDetailDto extends ProjectDto {
  members: ProjectMemberDto[];
  /**
   * 이 과제의 IP가 고를 수 있는 설계 도메인 목록 (IpDto.domain에 들어갈 값).
   * 과제 자신의 분류인 ProjectDto.domain과는 다른 축이다. 과제마다 편집하는 데이터라
   * DEPARTMENTS 같은 고정 상수가 아니다 (PATCH /projects/:id/ip-domains).
   * IP가 하나도 없는 도메인도 Total workflow view에서 빈 항성계로 뜬다.
   */
  ipDomains: string[];
}

export interface ViewGrantDto {
  knoxId: string;
  department: string;
  grantedAt: string;
}

export interface IpDto {
  id: string;
  projectId: string;
  name: string;
  description: string;
  color: string;
  /**
   * IP가 속한 설계 도메인(예: 'PLL', 'POWER', 'ADC'). Total workflow view가 이 값으로
   * 화면 영역 자체를 항성계 단위로 갈라 놓는다. BE가 아직 필드를 안 내려주는 데이터도
   * 있으므로 optional이고, 비어 있으면 UNASSIGNED 도메인으로 묶인다
   * (web/src/lib/domainWorkflow.ts의 domainOf()).
   */
  domain?: string | null;
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

/** 산출물 수신 IP 셀렉트 박스 및 Incoming 카드용 최소 정보. */
export interface IpBriefDto {
  id: string;
  name: string;
  color: string;
}

export interface DeliverableDto {
  id: string;
  projectId: string;
  ipId: string;
  phaseKey: string;
  name: string;
  docType: string;
  network: 'OA' | 'HPC';
  series: string | null;
  seriesIdx: number;
  seriesTotal: number;
  layout: Layout;
  recvDept: string | null;
  /** 수신 담당자의 knoxId. */
  recvContact: string | null;
  /** 이 산출물을 받아야 하는 다른 Analog IP — 설정되면 그 IP 보드에 Incoming으로 노출된다. */
  recvIpId: string | null;
  /**
   * 이 시스템에 없는 외부 부서(파운드리 등)로부터 받았음을 나타내는 자유 텍스트.
   * recvIpId와 달리 이 값이 있어도 여전히 own 산출물 그대로다 — 위치·Phase를
   * own처럼 자유롭게(여러 Phase 포함) 편집할 수 있다.
   */
  sourceDept: string | null;
  /** 권한에 맞게 이미 필터링된 버전 목록 */
  versions: DeliverableVersionDto[];
  releasedVersion: DeliverableVersionDto | null;
  workingVersion: DeliverableVersionDto | null;
  canEdit: boolean;
  /** Incoming 목록(GET .../deliverables의 incoming[])에서만 채워진다 — 이 산출물을 준 IP. */
  sourceIp: IpBriefDto | null;
}

/** GET /ips/:ipId/deliverables 응답 — own은 이 IP가 주는 산출물, incoming은 다른 IP로부터 받는 산출물. */
export interface DeliverablesListResponse {
  data: DeliverableDto[];
  incoming: DeliverableDto[];
}

export interface MemoDto {
  _id: string;
  ipId: string;
  phaseKey: string;
  text: string;
  layout: Layout;
  createdBy: string;
}

export interface EdgeDto {
  _id: string;
  ipId: string;
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
  ipId: string;
  version: string;
  date: string;
  releasedBy: string;
  note: string;
  items: Record<string, HldItemDto>;
}
