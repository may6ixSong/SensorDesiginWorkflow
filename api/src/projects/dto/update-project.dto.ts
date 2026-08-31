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

  @IsOptional()
  @IsString()
  status?: string;
}
