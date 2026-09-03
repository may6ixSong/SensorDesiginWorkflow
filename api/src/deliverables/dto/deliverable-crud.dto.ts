import {
  IsBoolean, IsIn, IsOptional, IsString, MinLength, MaxLength, IsArray, ArrayUnique,
} from 'class-validator';

export class CreateDeliverableDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  phaseId: string;

  /**
   * 더 이상 생성 화면에서 직접 고르지 않는다(사용자 요청) - 이제 산출물의 출처는
   * Hub 서비스 선택(serviceKey)으로 표현하고, network은 항상 서버 기본값('OA')을 쓴다.
   * DTO에는 하위 호환을 위해 남겨 두되 선택 필드로 낮춘다.
   */
  @IsOptional()
  @IsIn(['OA', 'HPC'])
  network?: 'OA' | 'HPC';

  /** 'received'면 이 workflow가 받기를 기다리는 자리표시자로 만들어진다 — 생성 후 바뀌지 않는다. */
  @IsOptional()
  @IsIn(['own', 'received'])
  intent?: 'own' | 'received';

  /**
   * Hub 서비스 매핑 (artifactServices.key + 그 서비스 안에서의 식별자). 생성 시점에 정하지
   * 않아도 된다 - 둘 다 비우면 "출처 미등록"인 정상 빈 상태로 만들어진다(Hub 설계서 §11).
   */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  serviceKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalArtifactId?: string;
}

export class UpdateDeliverableDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn(['OA', 'HPC'])
  network?: 'OA' | 'HPC';

  /**
   * Hub 서비스 매핑. 언제든 나중에 걸 수 있고(Hub 설계서 §11), 걸리는 순간
   * ARTIFACT_SERVICE_LINKED가 감사 로그에 남아 티어 전환 시점을 표시한다(§5.3).
   * 빈 문자열을 보내면 매핑을 지운다.
   */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  serviceKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalArtifactId?: string;
}

/**
 * recvWorkflowId(시스템 내 다른 workflow를 전달 대상으로 지정)와 sourceDept/sourceContact
 * ("받는 곳" — 외부 출처 메모)는 더 이상 이 엔드포인트로 고칠 수 없다(사용자 요청 — 전달
 * 탭은 전달 받을 부서만 남긴다). 이미 저장된 값은 건드리지 않고 그대로 둔다
 * (DeliverablesService.updateRecv 참고) — 이 DTO는 새로 쓰지 않을 필드를 아예 받지 않는다.
 */
export class UpdateRecvDto {
  @IsOptional()
  @IsString()
  recvDept: string | null;

  /** 수신 담당자의 KnoxID (api에는 users 컬렉션이 없다). */
  @IsOptional()
  @IsString()
  recvContact: string | null;
}

export class UpdateScheduleDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  phaseIds: string[];
}

/**
 * C/D 티어 수동 버전 기록 (Hub 설계서 §9). A/B 티어는 그 서비스가 버전을 갖고 SIREN은
 * 관측만 하므로 이 DTO를 쓰지 않는다.
 *
 * versionLabel과 hpcPath 중 최소 하나는 있어야 한다 - 버전 개념이 없는 HPC 경로형
 * 산출물은 경로가 라벨을 대신하고, versionRef는 `path@registeredAt`으로 합성된다(§5.2.1).
 */
export class AssertVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  versionLabel?: string;

  /** 가시성 판정의 유일한 근거 (§6.2). 생략하면 false(작업중). */
  @IsOptional()
  @IsBoolean()
  isReleased?: boolean;

  @IsOptional()
  @IsIn(['A', 'B', 'C', 'D'])
  tier?: 'A' | 'B' | 'C' | 'D';

  @IsOptional()
  @IsString()
  hpcPath?: string;

  @IsOptional()
  @IsString()
  giverDept?: string;

  @IsOptional()
  @IsString()
  viewUrl?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ReleaseDto {
  @IsOptional()
  @IsString()
  note?: string;
}
