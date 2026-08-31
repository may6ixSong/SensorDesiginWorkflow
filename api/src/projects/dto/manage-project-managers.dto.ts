import { IsString, MinLength } from 'class-validator';

/** 과제 마일스톤(공통 일정)을 수정할 수 있는 Project Manager 지정. */
export class AddProjectManagerDto {
  @IsString()
  @MinLength(1)
  knoxId: string;
}
