import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code?: string;

  /** 같은 code라도 다른 프로젝트로 취급하는 리비전 (Hub 설계서 §19). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  revision?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
