import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { toUserDto } from '../users/dto/user.dto';

/**
 * 사내 SSO 연동 전제 (설계서 1.3) - 목업 단계는 "사용자 스위처"로 대체한다.
 * TODO: SSO 연동 지점 - devLogin()을 실제 IdP 콜백/토큰 교환 로직으로 교체.
 * 그때까지 FE는 로그인 화면 대신 사용자 목록에서 골라 /auth/dev-login을 호출한다.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async devLogin(userId: string) {
    const user = await this.users.findById(userId);
    if (!user.isActive) throw new UnauthorizedException('This user is inactive.');
    const accessToken = await this.jwt.signAsync({ sub: user._id.toString() });
    return { accessToken, user: toUserDto(user) };
  }
}
