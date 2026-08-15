import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsMongoId } from 'class-validator';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { toUserDto } from '../users/dto/user.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { UserDocument } from '../users/schemas/user.schema';

class DevLoginDto {
  @IsMongoId()
  userId: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  /** 사용자 스위처 목록 (로그인 화면 없이 목업 사용자 중 선택). 인증 불필요. */
  @Get('switchable-users')
  async switchableUsers() {
    const list = await this.users.findAll();
    return { data: list.map(toUserDto) };
  }

  // TODO: SSO 연동 지점 - 실제 서비스에서는 이 엔드포인트 대신 IdP 리다이렉트/콜백을 사용한다.
  @Post('dev-login')
  async devLogin(@Body() body: DevLoginDto) {
    const result = await this.auth.devLogin(body.userId);
    return { data: result };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: UserDocument) {
    return { data: toUserDto(user) };
  }
}
