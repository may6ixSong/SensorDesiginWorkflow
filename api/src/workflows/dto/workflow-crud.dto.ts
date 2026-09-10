import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsHexColor,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** 권한 한 벌 입력 — 부서 다중 + 사용자 다중(설계서 01장 §3.3). */
export class AccessGrantDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  departments?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(500)
  users?: string[];
}

export class CreateWorkflowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  /**
   * 이 workflow가 소속될 부서. **필수다** — 'unassigned'는 폐지되었다.
   * 후보는 요청자가 그 과제에서 속한 부서뿐이며(Admin은 과제 전체), 검증은
   * ProjectsService가 한다.
   */
  @IsString()
  @MinLength(1)
  department: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;
}

/**
 * Name / Description / Department를 **한 번에** 저장하는 단일 PATCH(설계서 02장 §7.2).
 * 예전처럼 department 변경을 별도 라우트로 빼지 않는다 — 화면의 Save 버튼이 하나이므로
 * API도 하나여야 둘이 어긋나지 않는다.
 */
export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  department?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;
}

export class ReplaceWorkflowAccessDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => AccessGrantDto)
  editAccess?: AccessGrantDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AccessGrantDto)
  viewAccess?: AccessGrantDto;
}

export class WorkflowPhaseItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;

  @IsString()
  start: string;

  @IsString()
  end: string;
}

export class UpdateWorkflowPhasesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowPhaseItemDto)
  phases: WorkflowPhaseItemDto[];
}
