import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSheetTemplateDto {
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

  /** 이 template의 지금 개정본을 시작점으로 복사한다. */
  @IsOptional()
  @IsString()
  fromKey?: string;
}

export class UpdateSheetTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

/** multipart — 파일 필드 `document`(SpreadJS 문서 JSON) + 이 필드. */
export class AddSheetTemplateRevisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
