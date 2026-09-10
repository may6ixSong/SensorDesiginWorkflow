import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateReleaseDto {
  /** release 전체에 1개. **필수**다(설계서 05장 §4.3). */
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  note: string;

  /**
   * blockId → (sourceBlockId → versionRef | null).
   *
   * **changed:true 인 항목에 대해서만** 보낸다 — 바뀌지 않은 산출물은 직전 release의
   * 선택을 서버가 그대로 이어받으므로 클라이언트가 보낼 필요가 없고, 보내도 무시된다
   * (설계서 05장 §4.2).
   */
  @IsOptional()
  @IsObject()
  sources?: Record<string, Record<string, string | null>>;
}
