import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsHexColor, IsOptional, IsString, MaxLength, MinLength, ValidateNested,
} from 'class-validator';

/**
 * workflow 생성. phase는 받지 않는다 — 생성 시점엔 반드시 과제 마일스톤의 복사본으로
 * 시작하고(사용자 요청: "default로는 과제의 milestone이 들어가고"), 그 뒤에 PATCH
 * /workflows/:id/phases로 자유롭게 고친다.
 */
export class CreateWorkflowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  /** 과제의 workflowDomains 중 하나. 빈 문자열이면 도메인 미지정. */
  @IsString()
  @MaxLength(40)
  domain: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;
}

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;
}

/**
 * workflow phase 목록 전체 교체(PUT 의미).
 *
 * id를 비워 보내면 새 phase, 기존 id면 그 phase 수정, 보내지 않은 기존 id는 삭제다.
 * 삭제된 phase를 가리키던 산출물은 서버가 건드리지 않는다 — phaseId가 그대로 남아
 * FE가 "일정 유실" 상태로 표시한다(사용자 요청).
 */
export class WorkflowPhaseItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(24)
  name: string;

  @IsString()
  start: string;

  @IsString()
  end: string;
}

export class UpdateWorkflowPhasesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WorkflowPhaseItemDto)
  phases: WorkflowPhaseItemDto[];
}
