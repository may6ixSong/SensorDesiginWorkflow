import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

/**
 * 과제 마일스톤 목록 전체 교체(PUT 의미). 이제 추가/삭제/개명이 전부 가능하다 —
 * 산출물이 직접 가리키는 것은 workflow의 phase이고 마일스톤이 아니기 때문에,
 * 마일스톤을 지워도 산출물이 고아가 되지 않는다.
 *
 * id를 비워 보내면 서버가 새로 발급한다(=새 마일스톤). 기존 id를 그대로 보내면
 * 그 마일스톤을 수정하는 것으로 본다.
 */
export class MilestoneItemDto {
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

export class UpdateMilestonesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MilestoneItemDto)
  milestones: MilestoneItemDto[];
}
