import { IsString, MaxLength, MinLength } from 'class-validator';

/** 부서 추가/개명 — 이름 하나만 받는다. id는 서버가 발급/식별한다(설계서 02장 §9.1). */
export class UpsertProjectDepartmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;
}
