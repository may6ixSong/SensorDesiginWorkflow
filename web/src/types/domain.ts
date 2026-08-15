import { DepartmentId } from '@/shared/constants/departments';

export interface UserDto {
  id: string;
  empNo: string;
  name: string;
  email: string;
  department: DepartmentId;
  /** 아바타 배경색 (목업 USERS[].color) */
  color: string;
}

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

export interface ViewGrantDto {
  user: UserDto;
  department: string;
  grantedAt: string;
}

export interface IpDto {
  id: string;
  projectId: string;
  name: string;
  description: string;
  color: string;
  owners: UserDto[];
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
  by: string;
  at: string;
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
  recvContact: string | null;
  /** 권한에 맞게 이미 필터링된 버전 목록 */
  versions: DeliverableVersionDto[];
  releasedVersion: DeliverableVersionDto | null;
  workingVersion: DeliverableVersionDto | null;
  canEdit: boolean;
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
