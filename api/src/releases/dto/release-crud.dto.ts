import { ArrayMaxSize, IsArray, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateReleaseDto {
  /** release 전체에 1개. **필수**다(설계서 05장 §4.3). */
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  note: string;

  /**
   * nodeId → (sourceNodeId → versionRef | null).
   *
   * **changed:true 인 항목에 대해서만** 보낸다 — 바뀌지 않은 산출물은 직전 release의
   * 선택을 서버가 그대로 이어받으므로 클라이언트가 보낼 필요가 없고, 보내도 무시된다
   * (설계서 05장 §4.2).
   */
  @IsOptional()
  @IsObject()
  sources?: Record<string, Record<string, string | null>>;

  /**
   * 겨냥할 부서(`Project.departments[].id`). **비우거나 생략하면 All** — 그 workflow가
   * 전달하는 전 부서를 겨냥한 것으로 본다(스펙 §2).
   *
   * 타겟이 아닌 부서도 recipient가 겹치는 산출물은 함께 받는다 — 그건 서버가
   * `items[].recipients`를 보존하는 것으로 자동 처리되므로 여기 담지 않는다.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  targetDepartments?: string[];
}
