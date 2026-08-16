import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

/**
 * Bearer 토큰을 검증하고 req.user에 User 도큐먼트를 붙인다.
 * TODO: SSO 연동 지점 - 현재는 dev-login이 발급한 자체 서명 JWT만 검증한다.
 * 실제 IdP 연동 시 토큰 발급처만 여기서 교체하면 되도록 인터페이스를 유지했다.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('No authentication token provided.');
    }
    const token = header.slice('Bearer '.length);
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      const user = await this.users.findByIdOrNull(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive.');
      }
      req.user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token.');
    }
  }
}
