import { IsString, MaxLength } from 'class-validator';

/**
 * Workflow 하나를 부서(department)에 재배정한다 — 예전 "설계 도메인" 선택이 아니라,
 * 이 workflow를 만든 사람의 프로젝트 소속 부서가 기본값으로 들어간 뒤 나중에 수동으로
 * 고칠 수 있게 하는 창구다(unassigned 상태 수정 포함). 빈 문자열을 허용해야 배정
 * 해제가 되므로 MinLength를 걸지 않는다. 값이 요청한 사람 본인의 부서 목록 안에
 * 있는지는 ProjectsService.updateWorkflowDomain이 검증한다.
 */
export class UpdateWorkflowDomainDto {
  @IsString()
  @MaxLength(40)
  domain: string;
}
