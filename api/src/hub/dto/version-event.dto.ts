import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * SIREN이 모든 산출물 서비스 — OA Service/File Artifacts/HPC Service — 로부터 동일하게
 * 수신하는 version 발행 이벤트(설계서 07장 §4.1).
 *
 * ★ 이 모양을 조금이라도 벗어나면(필수 필드 누락·타입 불일치·정의 안 된 필드 포함) 그
 *   요청 전체를 거부한다 — 일부만 기록하는 부분 반영은 하지 않는다. 그래서 이 DTO만은
 *   전역 ValidationPipe(main.ts, forbidNonWhitelisted:false)를 쓰지 않고, 이 라우트에서만
 *   `forbidNonWhitelisted:true`로 덮어쓴다(HubEventsController).
 */
export class VersionPublishedEventDto {
  /** Service Manage에서 SIREN이 발급한 값 — 어떤 종류의 산출물인지(§3.2) */
  @IsString()
  @MinLength(1)
  artifactTypeKey: string;

  /** 그 서비스 안에서 이 산출물 인스턴스를 가리키는 값 — 서비스 전체에서 유일해야 한다(§4.3) */
  @IsString()
  @MinLength(1)
  externalArtifactId: string;

  /** 이 버전 엔트리를 마지막으로 갱신한 사람의 knox id */
  @IsString()
  @MinLength(1)
  updatedUserId: string;

  /** 이 버전 엔트리가 그 서비스에서 마지막으로 갱신된 시각 (ISO 8601) */
  @IsISO8601()
  updatedAt: string;

  /** 표시용이자 사실상의 불변 참조 — 같은 artifact에서 절대 재사용하면 안 된다 */
  @IsString()
  @MinLength(1)
  versionLabel: string;

  /**
   * 그 서비스가 발급한 진짜 불변 참조(있으면) — source 계보(sourceRefs) 연결에 쓴다(문제 4).
   * 모든 서비스가 갖고 있는 건 아니므로 nullable/optional이다.
   */
  @IsOptional()
  @IsString()
  versionRef: string | null;

  /** artifact를 받는 user가(view 권한) 볼 수 있는 버전인지 — 가시성 판정의 유일한 근거 */
  @IsBoolean()
  isPublished: boolean;

  /** OA Service 전용. 없으면 null */
  @IsOptional()
  @IsString()
  viewUrl: string | null;

  /** HPC Service 전용 (vwp path). 없으면 null */
  @IsOptional()
  @IsString()
  path: string | null;

  /**
   * release note/update note 같은 자유 텍스트 — 이 버전에 대한 설명. SIREN 상세 slide의
   * 버전 목록에서 버전별로 그대로 보여준다. 모든 서비스가 이런 note를 갖고 있는 건
   * 아니므로 nullable이다.
   */
  @IsOptional()
  @IsString()
  note: string | null;

  /**
   * 이 버전이 Auto Run trigger의 결과로 만들어졌으면 그 trigger의 id(설계서 10장 §6.4) —
   * SIREN이 그 실행 기록에 결과 버전으로 남긴다. 사람이 만든 버전이면 보내지 않는다.
   */
  @IsOptional()
  @IsString()
  triggerRunId?: string | null;
}

/**
 * Auto Run trigger를 받은 서비스가 진행 상태를 알리는 콜백(설계서 08장 §2.3).
 * version 이벤트와 같이 `forbidNonWhitelisted:true`로 엄격하게 검증한다.
 */
export class AutoRunStatusEventDto {
  @IsString()
  @MinLength(1)
  triggerRunId: string;

  @IsIn(['running', 'succeeded', 'failed'])
  status: 'running' | 'succeeded' | 'failed';

  /** 실패 사유·진행 설명 등 사람이 읽을 한 줄. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string | null;

  /** 이 실행으로 만든 버전이 있으면 그 라벨(temporary로 두고 발행하지 않았으면 비운다). */
  @IsOptional()
  @IsString()
  versionLabel?: string | null;

  /** 그 서비스 쪽 작업 id(선택). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalJobId?: string | null;
}
