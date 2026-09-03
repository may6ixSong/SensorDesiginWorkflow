import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ArtifactServiceDocument, Tier, Transport } from '../schemas/artifact-service.schema';

export class RegisterServiceDto {
  /** 불변 식별자 - 등록 후에는 바꿀 수 없다 (Hub 설계서 §3.2). */
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Service key may only contain lowercase letters, numbers and hyphens.',
  })
  key: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  contractVersion?: string;

  @IsOptional()
  @IsIn(['A', 'B', 'C', 'D'])
  defaultTier?: Tier;

  @IsOptional()
  @IsIn(['http', 'shared-db', 'none'])
  transport?: Transport;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  viewUrlTemplate?: string;

  @IsOptional()
  @IsString()
  embedUploadUrlTemplate?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/** key는 없다 - 불변이라 수정 대상이 아니다. */
export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  contractVersion?: string;

  @IsOptional()
  @IsIn(['A', 'B', 'C', 'D'])
  defaultTier?: Tier;

  @IsOptional()
  @IsIn(['http', 'shared-db', 'none'])
  transport?: Transport;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  viewUrlTemplate?: string;

  @IsOptional()
  @IsString()
  embedUploadUrlTemplate?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export function toArtifactServiceDto(s: ArtifactServiceDocument) {
  return {
    key: s.key,
    name: s.name,
    contractVersion: s.contractVersion,
    defaultTier: s.defaultTier,
    transport: s.transport,
    baseUrl: s.baseUrl ?? null,
    viewUrlTemplate: s.viewUrlTemplate ?? null,
    embedUploadUrlTemplate: s.embedUploadUrlTemplate ?? null,
    isBuiltIn: s.isBuiltIn === true,
    enabled: s.enabled !== false,
  };
}
