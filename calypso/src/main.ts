// 반드시 첫 import - 다른 모듈의 데코레이터가 평가되기 전에 .env를 process.env로 올린다.
import { ENV_FILE, ENV_PATH } from './config/env';
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
   * dev는 CORS_ORIGIN에 나열된 오리진들을 허용한다. 쉼표로 여러 오리진도 지정할 수 있다.
   *
   * dev 전용 예비 포트 대역: 이 모노레포에는 vite dev server가 여러 개 뜬다(SIREN web,
   * Calypso web 등) - vite는 5173부터 시작해 이미 점유돼 있으면 +1씩 밀리므로, 로컬마다
   * 그리고 띄울 때마다 실제 포트가 달라진다. 그때마다 CORS_ORIGIN을 손으로 늘리지 않도록,
   * dev에서는 CORS_ORIGIN에 명시된 오리진에 더해 localhost/127.0.0.1의 5170~5199 대역을
   * 통째로 허용해 넉넉한 예비 포트를 미리 열어둔다. prod는 이 예비 대역을 타지 않고
   * CORS_ORIGIN 설정을 그대로 따른다.
   *
   * allowedHeaders는 '*' 대신 명시한다 - credentials와 와일드카드를 함께 쓰면
   * 브라우저가 preflight를 거부하므로, 실제로 쓰는 헤더만 나열한다. Artifact 권한
   * 모델(actor.ts)이 쓰는 X-User-Group/X-Acting-As/X-User-Departments도 여기 없으면
   * 프리플라이트에서 막힌다 — 헤더를 보내는 쪽(calypsoClient.ts)만 고치고 여기를
   * 빠뜨리면 CORS 에러로만 보여서 원인을 찾기 어렵다.
   */
  const corsOrigin = config.get<string>('corsOrigin')?.trim() ?? '';
  const isDev = ENV_FILE === '.env.development';
  const DEV_RESERVED_PORTS = /^https?:\/\/(localhost|127\.0\.0\.1):51[7-9]\d$/;
  const explicitOrigins = corsOrigin.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: !corsOrigin || corsOrigin === '*'
      ? true
      : isDev
        ? (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
            cb(null, !origin || explicitOrigins.includes(origin) || DEV_RESERVED_PORTS.test(origin))
        : explicitOrigins,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, X-Knox-Id, X-User-Group, X-Acting-As, X-User-Departments',
  });

  // TLS는 앞단(IIS/nginx)에서 종료한다 - api는 평문 HTTP로만 리스닝한다.
  /**
   * IIS(iisnode)는 PORT에 TCP 포트 대신 명명된 파이프 문자열을 주입하고, 그 파이프로
   * 들어온 요청을 프록시한다. 파이프에는 host를 함께 넘길 수 없다 - Node의
   * `server.listen`은 첫 인수가 경로일 때 두 번째 인수를 backlog로 해석하므로
   * '0.0.0.0'을 붙이면 리스닝이 깨진다. 그래서 타입으로 분기한다.
   * (숫자/문자열 판별은 config/configuration.ts의 resolvePort가 담당한다.)
   */
  const port = config.get<string | number>('port') ?? 3000;
  if (typeof port === 'string') {
    await app.listen(port);
  } else {
    await app.listen(port, '0.0.0.0');
  }
  // 배포 사고의 대부분이 "어떤 .env를 읽었는가"에서 갈리므로 실제 읽은 경로와
  // 적용된 CORS 오리진을 함께 찍는다. iisnode 로그(iisnode/*.txt)에서 바로 확인된다.
  // eslint-disable-next-line no-console
  console.log(
    `Calypso API (${ENV_FILE} <- ${ENV_PATH ?? 'NOT FOUND, 기본값 사용'}) ` +
      `listening on http://0.0.0.0:${port}/${config.get<string>('apiPrefix')} ` +
      `| CORS_ORIGIN=${corsOrigin || '(전면 허용)'}` +
      (isDev && corsOrigin && corsOrigin !== '*' ? ' +dev reserved ports 5170-5199' : ''),
  );
}
bootstrap();
