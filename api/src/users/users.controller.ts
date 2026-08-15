import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { toUserDto } from './dto/user.dto';
import { isValidDepartment } from '../common/constants/departments';
import { BadRequestException } from '@nestjs/common';

/**
 * 조직도/HR API 연동 전까지 users 컬렉션을 직접 관리한다 (킥오프 [A] 지시사항).
 * TODO: 조직도/HR API 연동 지점 - 실제 연동 시 이 컨트롤러를 프록시로 교체하거나 동기화 배치로 대체.
 */
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(@Query('department') department?: string) {
    if (department) {
      if (!isValidDepartment(department)) {
        throw new BadRequestException('알 수 없는 부서입니다.');
      }
      const users = await this.users.findByDepartment(department);
      return { data: users.map(toUserDto) };
    }
    const users = await this.users.findAll();
    return { data: users.map(toUserDto) };
  }
}
