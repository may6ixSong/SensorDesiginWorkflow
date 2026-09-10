import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { AccessGrantDto } from '../../workflows/dto/workflow-crud.dto';
import { TIERS } from '../../common/constants/tier';

export class CreateArtifactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;

  @IsIn(TIERS as unknown as string[])
  tier: 'A' | 'B' | 'C' | 'D';

  @IsOptional()
  @IsIn(['OA', 'HPC'])
  network?: 'OA' | 'HPC';

  @IsOptional()
  @IsString()
  serviceKey?: string | null;

  @IsOptional()
  @IsString()
  externalArtifactId?: string | null;

  @IsOptional()
  @IsString()
  artifactTypeKey?: string | null;

  @IsOptional()
  @IsString()
  externalUrl?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => AccessGrantDto)
  editAccess?: AccessGrantDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AccessGrantDto)
  viewAccess?: AccessGrantDto;
}

/** B/C/D 전용. A Tier에 보내면 서비스가 400으로 거부한다(설계서 04장 §3). */
export class ReplaceArtifactAccessDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => AccessGrantDto)
  editAccess?: AccessGrantDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AccessGrantDto)
  viewAccess?: AccessGrantDto;
}
