// 반드시 첫 import - 다른 모듈의 데코레이터가 평가되기 전에 .env를 process.env로 올린다.
import { ENV_FILE } from './config/env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix(config.get<string>('apiPrefix') ?? 'api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  /**
   * CORS_ORIGIN이 비어 있거나 '*'이면 요청 오리진을 그대로 반사한다(전면 허용) -
   * SFM_API가 `origin: true`로 열어둔 것과 동일한 사내망 전제다. prod가 이 경로다.
   * dev는 http://localhost:5173만 허용한다. 쉼표로 여러 오리진도 지정할 수 있다.
   *
   * allowedHeaders는 '*' 대신 명시한다 - credentials와 와일드카드를 함께 쓰면
   * 브라우저가 preflight를 거부하므로, 실제로 쓰는 헤더만 나열한다(X-Knox-Id 포함).
   */
  const corsOrigin = config.get<string>('corsOrigin')?.trim() ?? '';
  app.enableCors({
    origin: !corsOrigin || corsOrigin === '*' ? true : corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, X-Knox-Id',
  });

  // TLS는 앞단(nginx/ingress)에서 종료한다 - api는 평문 HTTP로만 리스닝한다.
  const port = config.get<number>('port') ?? 3000;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(
    `SIREN API (${ENV_FILE}) listening on http://0.0.0.0:${port}/${config.get<string>('apiPrefix')}`,
  );
}
bootstrap();
