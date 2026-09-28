import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TemplateColumn } from './table-validation';

/**
 * template 생성/수정 몸체. 컬럼 정의의 세부 검사는 `templateProblems()`가 한다(FE와 같은
 * 규칙) — 여기서는 모양만 본다.
 */
export class TemplateInputDto {
  @IsString()
  @MinLength(2)
  @MaxLength(63)
  key: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(31)
  sheetName: string;

  @IsArray()
  columns: TemplateColumn[];

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
