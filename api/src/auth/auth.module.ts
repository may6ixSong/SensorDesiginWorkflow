import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UsersModule } from '../users/users.module';

/**
 * @Global() - JwtAuthGuard는 9개 컨트롤러에서 @UseGuards(JwtAuthGuard)로 쓰인다.
 * 그 각각의 모듈이 AuthModule을 직접 import하게 하면 UsersModule↔AuthModule처럼
 * 순환 참조가 생기므로, 대신 AuthModule을 전역으로 등록해 JwtAuthGuard의 의존성
 * (JwtService)이 어디서든 해석되게 한다. app.module.ts에 한 번만 import하면 된다.
 */
@Global()
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('auth.devJwtSecret'),
        signOptions: { expiresIn: config.get<string>('auth.devJwtExpiresIn') },
      }),
    }),
  ],
  providers: [AuthService, JwtAuthGuard],
  controllers: [AuthController],
  // UsersModule도 재-export한다 - JwtAuthGuard 생성자가 UsersService도 필요로 하기 때문.
  exports: [JwtAuthGuard, JwtModule, UsersModule],
})
export class AuthModule {}
