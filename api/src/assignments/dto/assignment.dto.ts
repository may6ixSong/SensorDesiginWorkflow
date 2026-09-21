import { IsISO8601, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Tier } from '../../common/constants/tier';

/* ------------------------------------------------------------------ *
 * 요청
 * ------------------------------------------------------------------ */

export class PageQueryDto {
  /** 1부터. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number;

  /**
   * project 필터(FE의 legend 체크박스, 사용자 요청) — 콤마로 이은 projectId 목록.
   * 생략하면 필터 없이 scope 전체다. 빈 문자열이면 어느 project도 고르지 않은
   * 것이므로 서버가 빈 결과로 응답한다.
   */
  @IsOptional()
  @IsString()
  projectIds?: string;
}

/**
 * 달력 한 화면의 범위.
 *
 * ★ 연/월이 아니라 **from/to를 그대로 받는다** — 달력 격자의 경계는 보는 사람의 로컬
 *   시간대에서 정해지는데, 서버가 연/월만 받아 자기 시간대로 환산하면 월초·월말 하루가
 *   어긋난다. FE가 화면에 실제로 그리는 첫 칸과 마지막 칸을 그대로 보낸다.
 */
export class CalendarRangeDto {
  @IsISO8601()
  from: string;

  @IsISO8601()
  to: string;
}

/* ------------------------------------------------------------------ *
 * 응답
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
 * release 목록 한 줄. **버전 라벨·링크·경로를 담지 않는다** — 그 값들은 산출물별 열람
 * 권한(01장 §4.2, 그 서비스에 라이브로 묻는 게이트 2)을 통과해야 보일 수 있고, 목록
 * 한 페이지를 그리자고 산출물 수만큼 외부 호출을 낼 수는 없다. 상세는 행을 눌렀을 때
 * `GET /releases/:id` 한 건에 대해서만 판정한다(설계서 09장 §4).
 */
export interface MyReleaseRowDto {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  workflowId: string;
  seq: number;
  /** 화면 표기는 항상 `v{seq}`. */
  label: string;
  releasedAt: string;
  releasedBy: string;
  /** 목록에서는 첫 줄만 쓰지만, 자르는 위치는 FE가 정하도록 통째로 보낸다. */
  note: string;
  workflowAt: { name: string; department: string; departmentLabel: string };
  itemCount: number;
  changedCount: number;
  /** 이 release의 수신 부서 중 **내가 속한** 것만. Admin은 전체가 들어온다. */
  myRecipientDepartments: string[];
  /** 내가/내 부서가 받은 건가. */
  received: boolean;
  /** 내가/내 부서가 낸 건가. 둘 다 true일 수 있다(내 부서가 내 부서에 전달). */
  published: boolean;
}

/** 내 부서가 주는 산출물 한 자리(node). 행의 정체성은 artifact가 아니라 node이다. */
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
  network: string | null;
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

  /** 정렬 키 — artifact 문서의 updatedAt과 마지막 버전 사건 중 더 최근 쪽이다. */
  updatedAt: string;
}

/** 달력의 artifact 버전 발행 event 하나. */
export interface VersionEventDto {
  artifactId: string;
  artifactName: string;
  tier: Tier;
  network: string | null;
  versionLabel: string;
  versionRef: string | null;
  /** false면 SIREN이 받아 기록은 했지만 그 서비스가 아직 공식 확정하지 않은 작업중 버전이다. */
  isPublished: boolean;
  occurredAt: string;
  giverKnoxId: string | null;
  giverDept: string | null;
  viewUrl: string | null;
  hpcPath: string | null;
  projectId: string;
  projectCode: string;
  projectName: string;
  /** 이 산출물이 내 scope 안에서 놓여 있는 자리들. */
  placements: { workflowId: string; workflowName: string; department: string; nodeId: string }[];
}

export interface CalendarDto {
  from: string;
  to: string;
  versionEvents: VersionEventDto[];
  releaseEvents: MyReleaseRowDto[];
}
