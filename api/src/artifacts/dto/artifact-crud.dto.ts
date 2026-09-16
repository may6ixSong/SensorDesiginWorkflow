import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
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
}
