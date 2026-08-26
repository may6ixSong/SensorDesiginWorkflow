import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

/**
 * 목록 전체 교체 방식(PUT 의미) - milestones와 같은 패턴이다. 빈 배열은 허용한다
 * (도메인을 다 지우는 것 = 모든 workflow를 UNASSIGNED로 두겠다는 뜻).
 * 공백 제거·중복 제거는 ProjectsService.updateIpDomains가 한다.
 */
export class UpdateWorkflowDomainsDto {
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  workflowDomains: string[];
}
