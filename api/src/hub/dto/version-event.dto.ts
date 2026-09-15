import { IsBoolean, IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

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

  /** 화면 표시용 이름. 올 때마다 SIREN의 캐시된 이름을 이 값으로 갱신한다 */
  @IsString()
  @MinLength(1)
  artifactName: string;

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
}
