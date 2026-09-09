import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ENV_FILE } from './config/env';
import configuration from './config/configuration';
import { isUsingRealDb } from './database/model-registration';
import { ArtifactsModule } from './artifacts/artifacts.module';

/**
 * Calypso - SIREN Hub의 파일형 산출물 등록 창구.
 *
 * SIREN api와 같은 레포에 있지만 **별개 배포 단위**다(Hub 설계서 §3.3). SIREN의 코드가
 * 이 서비스의 클래스를 직접 import하지 않고 항상 Observer 계약(HTTP)으로만 호출한다는
 * 규칙이 그 경계를 지킨다 - 그래야 나중에 레포를 떼어낼 때 걷어낼 지름길이 없다.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ENV_FILE, load: [configuration] }),
    ...(isUsingRealDb()
      ? [
          MongooseModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({ uri: config.get<string>('mongodbUri') }),
          }),
        ]
      : []),
    ArtifactsModule,
  ],
})
export class AppModule {}
