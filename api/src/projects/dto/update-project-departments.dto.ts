import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

/**
 * 목록 전체 교체 방식(PUT 의미) - update-workflow-domains.dto.ts와 같은 패턴이다.
 * 빈 배열도 허용한다(부서를 전부 지우는 것도 사용자가 선택할 수 있다).
 * 공백 제거·중복 제거는 ProjectsService.updateDepartments가 한다.
 */
export class UpdateProjectDepartmentsDto {
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  departments: string[];
}
