import { DepartmentId } from '@/shared/constants/departments';

export interface UserDto {
  id: string;
  empNo: string;
  name: string;
  email: string;
  department: DepartmentId;
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

export interface DeliverableVersionDto {
  major: number;
  minor: number;
  kind: VersionKind;
  fileName: string;
  storageKey: string | null;
  hpcPath: string | null;
  note: string;
  createdBy: string;
  createdAt: string;
}

export interface DeliverableDto {
  id: string;
  _id: string;
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
  releasedVersion: DeliverableVersionDto | null;
  /** Edit 권한자에게만 채워진다 (설계서 6.1). */
  workingVersion: DeliverableVersionDto | null;
  canEdit: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
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
