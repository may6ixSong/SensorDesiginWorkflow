import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ArtifactServiceDocument, Tier } from '../schemas/artifact-service.schema';

/**
 * Service Manage 등록 — OA Service/HPC Service 화면 공통(설계서 07장 §3). Tier 선택 필드는
 * 없다 — 어느 화면(OA/HPC)에서 등록했는지로 이미 결정된다. 한 baseURL에 여러 artifact
 * 종류를 등록할 수 있으므로, **한 번 호출 = artifact 종류 하나**다(구 "Add artifact type"
 * 방식 폐지) — 같은 baseURL로 다시 부르면 기존 서비스에 종류만 추가된다.
 */
export class RegisterArtifactTypeDto {
  /** 'A' = OA Service, 'C' = HPC Service. 이 값이 여기서 유일하게 tier를 결정한다. */
  @IsIn(['A', 'C'])
  tier: Extract<Tier, 'A' | 'C'>;

  /** Service명. 이미 등록된 baseUrl이면 이 값은 무시되고 기존 Service명이 유지된다. */
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  /** Artifact명 — 이 baseURL이 낼 수 있는 산출물 종류 하나. */
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  artifactName: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsString()
  @MinLength(1)
  baseUrl: string;

  /** favicon — base64 data URI. 400,000자 ≈ 원본 파일 약 290KB(FE가 그보다 큰 파일은 거절). */
  @IsOptional()
  @IsString()
  @MaxLength(400000)
  icon?: string;
}

/** artifactTypes 항목 하나의 name/description만 고칠 때 쓴다 — key로 기존 항목을 찾아 맞춘다(새로 추가/삭제는 안 됨). */
export class UpdateArtifactTypeEntryDto {
  @IsString()
  @MinLength(1)
  key: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;
}

/**
 * key/token/tier는 없다 — 불변이거나 별도 경로로만 바뀐다(token=폐기·재발급). artifactTypes는
 * **이미 있는 항목의 name/description만** 여기서 고칠 수 있다(key로 매칭) — 새 종류 추가는
 * registerArtifactType 재호출로만 한다.
 */
export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400000)
  icon?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  /** false로 바뀌면 토큰을 즉시 폐기한다(§3.4). true로 되돌리면 새 토큰을 발급한다. */
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateArtifactTypeEntryDto)
  artifactTypes?: UpdateArtifactTypeEntryDto[];
}

/** 일반 사용자용 — "새 Artifact 추가" 다이얼로그의 서비스 드롭다운 등에서 쓴다. token은 뺀다. */
export function toArtifactServiceDto(s: ArtifactServiceDocument) {
  return {
    key: s.key,
    name: s.name,
    description: s.description ?? '',
    icon: s.icon ?? '',
    contractVersion: s.contractVersion,
    defaultTier: s.defaultTier,
    transport: s.transport,
    baseUrl: s.baseUrl ?? null,
    isBuiltIn: s.isBuiltIn === true,
    enabled: s.enabled !== false,
    artifactTypes: (s.artifactTypes ?? []).map((t) => ({
      key: t.key,
      name: t.name,
      description: t.description ?? '',
    })),
  };
}

/** Admin 전용 — Service Manage 화면과 등록/재등록 응답에서만 쓴다. token을 포함한다(§3.2). */
export function toArtifactServiceAdminDto(s: ArtifactServiceDocument) {
  return { ...toArtifactServiceDto(s), token: s.token ?? null };
}
