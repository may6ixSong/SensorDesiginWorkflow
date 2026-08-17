import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsString, MinLength, ValidateNested } from 'class-validator';

/**
 * key/order는 포함하지 않는다 - 산출물 phaseKey·레이아웃이 참조하는 식별자라
 * 이 API로 바꾸지 않고, label/start/end(마일스톤 일정)만 수정 대상이다.
 */
export class PhaseScheduleItemDto {
  @IsString()
  @MinLength(1)
  key: string;

  @IsString()
  @MinLength(1)
  label: string;

  @IsString()
  start: string;

  @IsString()
  end: string;
}

export class UpdatePhasesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PhaseScheduleItemDto)
  phases: PhaseScheduleItemDto[];
}
