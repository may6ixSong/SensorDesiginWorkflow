import { IpDocument } from '../schemas/ip.schema';
import { Actor } from '../../common/actor';

export interface IpDto {
  id: string;
  projectId: string;
  /** IP가 속한 설계 도메인. 권한과 무관하게 view 권한자에게도 그대로 보인다. */
  domain: string;
  name: string;
  description: string;
  color: string;
  /** KnoxID 목록 - 이름/부서/아바타는 web이 공통 플랫폼에서 조회한다. */
  owners: string[];
  viewGrants: { knoxId: string; department: string; grantedAt: Date }[];
  myAccess: 'edit' | 'view';
}

/**
 * 설계서 5.1 - "권한별 필드 마스킹은 6.1 참조": 현재 접근 가능한 사용자(edit 또는 view)라면
 * owners/viewGrants 목록 자체는 동일하게 노출한다 (담당자 chip 표시, 권한 dialog에 필요).
 */
export function toIpDto(ip: IpDocument, me: Actor): IpDto {
  return {
    id: ip._id.toString(),
    projectId: ip.projectId.toString(),
    domain: ip.domain,
    name: ip.name,
    description: ip.description,
    color: ip.color,
    owners: [...ip.owners],
    viewGrants: ip.viewGrants.map((g) => ({
      knoxId: g.knoxId,
      department: g.department,
      grantedAt: g.grantedAt,
    })),
    myAccess: ip.owners.includes(me.knoxId) ? 'edit' : 'view',
  };
}
