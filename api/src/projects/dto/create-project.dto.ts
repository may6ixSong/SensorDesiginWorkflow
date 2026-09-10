import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class ProjectMilestoneInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;

  @IsString()
  start: string;

  @IsString()
  end: string;
}

/**
 * 과제 생성 — Admin만(가정 P1).
 *
 * ★ `code`와 `revision`은 이 순간에만 정할 수 있다. 이후 수정 경로가 없으며, 바꿔야 하면
 *   Admin이 DB를 직접 고친다(설계서 README §3.1).
 * ★ revision 형식은 `EVT` + 0 이상의 정수다 — 검증은 common/constants/revision.ts 한 곳에서.
 */
export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  revision: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectMilestoneInputDto)
  milestones?: ProjectMilestoneInputDto[];
}
