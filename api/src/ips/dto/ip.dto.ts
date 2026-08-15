import { IpDocument } from '../schemas/ip.schema';
import { UserDocument } from '../../users/schemas/user.schema';
import { toUserDto, UserDto } from '../../users/dto/user.dto';

export interface IpDto {
  id: string;
  projectId: string;
  name: string;
  description: string;
  color: string;
  owners: UserDto[];
  viewGrants: { user: UserDto; department: string; grantedAt: Date }[];
  myAccess: 'edit' | 'view';
}

/**
 * ip.owners / ip.viewGrants.userId가 populate된 문서를 받는다고 가정.
 * 설계서 5.1 - "권한별 필드 마스킹은 6.1 참조": 현재 접근 가능한 사용자(edit 또는 view)라면
 * owners/viewGrants 목록 자체는 동일하게 노출한다 (담당자 chip 표시, 권한 dialog에 필요).
 */
export function toIpDto(ip: IpDocument, me: UserDocument): IpDto {
  const meId = me._id.toString();
  const owners = (ip.owners as unknown as UserDocument[]).filter(Boolean);
  const isEdit = owners.some((o) => o._id.toString() === meId);

  return {
    id: ip._id.toString(),
    projectId: ip.projectId.toString(),
    name: ip.name,
    description: ip.description,
    color: ip.color,
    owners: owners.map(toUserDto),
    viewGrants: (ip.viewGrants as any[])
      .filter((g) => g.userId)
      .map((g) => ({
        user: toUserDto(g.userId as UserDocument),
        department: g.department,
        grantedAt: g.grantedAt,
      })),
    myAccess: isEdit ? 'edit' : 'view',
  };
}
