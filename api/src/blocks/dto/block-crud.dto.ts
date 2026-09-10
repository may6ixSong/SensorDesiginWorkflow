import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { AccessGrantDto } from '../../workflows/dto/workflow-crud.dto';

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

  /** 매핑 없이 만들 수 있다 — 자리만 잡아두는 정상 빈 상태(설계서 03장 §2.3). */
  @IsOptional()
  @IsString()
  artifactId?: string | null;
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
}

/**
 * A Tier block의 recipient 교체 (설계서 04장 §3.3).
 * B/C/D는 artifact.viewAccess가 곧 recipient이므로 이 라우트를 쓰지 않는다.
 */
export class ReplaceRecipientsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => AccessGrantDto)
  editAccess?: AccessGrantDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AccessGrantDto)
  viewAccess?: AccessGrantDto;
}
