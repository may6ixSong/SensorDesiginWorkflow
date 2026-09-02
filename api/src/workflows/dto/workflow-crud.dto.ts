import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsHexColor, IsOptional, IsString, MaxLength, MinLength, ValidateNested,
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

  /**
   * 만든 사람이 이 과제에서 속한 부서 중 하나여야 한다(ProjectsService.createWorkflow가
   * 검증). 빈 문자열이면 도메인 미지정 — 소속 부서가 없는 admin만 가능하다.
   */
  @IsString()
  @MaxLength(40)
  domain: string;

  /**
   * 만드는 사람이 admin인지 — api는 이를 독립적으로 확인할 수 없어(Actor에는 knoxId만
   * 있다) FE가 보낸 값을 신뢰한다(WorkflowsService.addOwner의 department 신뢰와 같은
   * 패턴). 소속 부서가 하나도 없는 사람이 workflow를 만들 때만 의미가 있다 — true면
   * unassigned로 허용하고, 그렇지 않으면 거부된다.
   */
  @IsOptional()
  @IsBoolean()
  creatorIsAdmin?: boolean;

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
