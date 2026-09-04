import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ArtifactServiceDocument, Tier, Transport } from '../schemas/artifact-service.schema';

export class RegisterServiceDto {
  // key는 클라이언트가 안 보낸다 - HubService#register가 name을 바탕으로
  // `{8자리 랜덤}_{name 슬러그}` 형태로 직접 만든다 (사용자 요청).

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  /**
   * favicon 이미지 - 업로드한 파일을 브라우저에서 base64 data URI로 인코딩해 보낸다
   * (별도 스토리지 없이 문서에 바로 저장). Service Manage 카드에 <img>로 그리고,
   * 비어 있으면 이니셜로 대체한다. 400,000자 ≈ 원본 파일 약 290KB - FE가 그보다
   * 큰 파일은 인코딩 전에 거절한다(ServiceManagePage.tsx).
   */
  @IsOptional()
  @IsString()
  @MaxLength(400000)
  icon?: string;

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
  @MaxLength(240)
  description?: string;

  /**
   * favicon 이미지 - 업로드한 파일을 브라우저에서 base64 data URI로 인코딩해 보낸다
   * (별도 스토리지 없이 문서에 바로 저장). Service Manage 카드에 <img>로 그리고,
   * 비어 있으면 이니셜로 대체한다. 400,000자 ≈ 원본 파일 약 290KB - FE가 그보다
   * 큰 파일은 인코딩 전에 거절한다(ServiceManagePage.tsx).
   */
  @IsOptional()
  @IsString()
  @MaxLength(400000)
  icon?: string;

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
    description: s.description ?? '',
    icon: s.icon ?? '',
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
