import { IsString, MaxLength } from 'class-validator';

/**
 * IP 하나의 설계 도메인 배정. 빈 문자열을 허용해야 배정 해제가 되므로 MinLength를 걸지 않는다.
 * 값이 과제의 후보 목록에 있는지는 ProjectsService.updateIpDomain이 검증한다.
 */
export class UpdateIpDomainDto {
  @IsString()
  @MaxLength(40)
  domain: string;
}
