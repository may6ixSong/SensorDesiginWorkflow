import { UserDocument } from '../schemas/user.schema';

export interface UserDto {
  id: string;
  empNo: string;
  name: string;
  email: string;
  department: string;
}

export function toUserDto(u: UserDocument): UserDto {
  return {
    id: u._id.toString(),
    empNo: u.empNo,
    name: u.name,
    email: u.email,
    department: u.department,
  };
}
