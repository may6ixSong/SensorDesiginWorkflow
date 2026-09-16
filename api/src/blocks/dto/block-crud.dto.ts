import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { AccessGrantDto } from '../../workflows/dto/workflow-crud.dto';

/**
 * "새 Artifact 추가" 다이얼로그가 기존 artifact를 재사용하지 않고 그 자리에서 출처를
 * 확정할 때 보낸다(설계서 04장 §6). live/file/hpc(OA Service/File Artifacts/HPC Service)는
 * 서버가 pickable을 재검증한 뒤 find-or-create 하고, attested(D)는 검증 없이 새로 만든다.
 */
export class NewArtifactSourceDto {
  @IsIn(['live', 'file', 'hpc', 'attested'])
  source: 'live' | 'file' | 'hpc' | 'attested';

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;

  /** source: 'live' | 'hpc'일 때만. */
  @IsOptional()
  @IsString()
  serviceKey?: string;

  /** source: 'live' | 'file' | 'hpc'일 때만 — 그 서비스 안에서의 산출물 id. */
  @IsOptional()
  @IsString()
  externalArtifactId?: string;
}

export class LayoutDto {
  @IsNumber()
  x: number;

  @IsNumber()
  y: number;

  @IsNumber()
  w: number;

  @IsNumber()
  h: number;
}

export class CreateBlockDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;

  @IsString()
  phaseId: string;

  @ValidateNested()
  @Type(() => LayoutDto)
  layout: LayoutDto;

  /**
   * 이 block이 내가 **주는(own)** 산출물인지 **받는(received)** 산출물인지(설계서 03장
   * §5.2, 04장 §6). 생성 후에는 바꾸지 않는다 — 방향을 바꾸고 싶으면 block을 새로 만든다.
   */
  @IsOptional()
  @IsIn(['own', 'received'])
  intent?: 'own' | 'received';

  /** 이미 있는 artifact를 재사용한다 — 매핑 없이 만들 수도 있다(설계서 03장 §2.3). */
  @IsOptional()
  @IsString()
  artifactId?: string | null;

  /** artifactId 대신 — 그 자리에서 출처를 확정해 find-or-create 한다. */
  @IsOptional()
  @ValidateNested()
  @Type(() => NewArtifactSourceDto)
  newArtifact?: NewArtifactSourceDto;
}

export class UpdateBlockDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  /** null이면 매핑 해제. 매핑 시 같은 과제의 artifact만 허용된다(설계서 04장 §1.1). */
  @IsOptional()
  @IsString()
  artifactId?: string | null;

  /** artifactId 대신 — 그 자리에서 출처를 다시 확정한다(재매핑). */
  @IsOptional()
  @ValidateNested()
  @Type(() => NewArtifactSourceDto)
  newArtifact?: NewArtifactSourceDto;
}

/** block의 recipient 교체 — A/B/C/D 전부 공통이다(설계서 04장 §3.2). */
export class ReplaceRecipientsDto extends AccessGrantDto {}
