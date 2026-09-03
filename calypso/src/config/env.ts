/**
 * .env 로딩은 반드시 다른 어떤 모듈보다 먼저 일어나야 한다.
 *
 * DatabaseModule은 `@Module({ imports: [...] })` 데코레이터 평가 시점에
 * DB_CONNECTION 유무를 보고 MongooseModule 연결 여부를 결정한다. 데코레이터는
 * app.module.ts가 import되는 순간(=ConfigModule.forRoot()가 호출되기 전에) 실행되므로,
 * ConfigModule의 envFilePath에만 의존하면 그 시점에 process.env가 아직 비어 있다.
 * 그래서 main.ts의 첫 import로 이 파일을 두어 dotenv를 선행 로딩한다.
 */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

/** NODE_ENV=production 이면 .env.production, 그 외에는 .env.development. */
export const ENV_FILE = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';

/**
 * 경로를 process.cwd()로만 잡으면 안 된다 - IIS(iisnode)/Windows 서비스로 띄우면
 * 작업 디렉터리가 배포 루트가 아니다(엔트리 스크립트 폴더인 dist\, 심하면
 * C:\Windows\System32\inetsrv). 게다가 dotenv는 파일이 없어도 조용히 성공하므로,
 * 못 찾았다는 사실이 아무 로그도 없이 묻힌다. 그러면 모든 설정이 기본값으로
 * 떨어져서 - CORS_ORIGIN=http://localhost:5173(브라우저 요청 전부 CORS 거부),
 * DB_CONNECTION 빈 값(실제 DB 대신 인메모리 목업) - 원인 찾기 어려운 사고가 난다.
 *
 * 그래서 cwd와 이 파일 위치(__dirname) 기준 상위 경로를 함께 훑는다. 컴파일 후
 * 이 파일은 dist/config/env.js이므로 배포 루트는 보통 resolve(__dirname, '../..')다.
 */
function findEnvFile(): string | null {
  const candidates = [
    resolve(process.cwd(), ENV_FILE),
    ...[1, 2, 3, 4].map((up) => resolve(__dirname, '../'.repeat(up), ENV_FILE)),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

/** 실제로 읽은 .env 절대경로. 못 찾으면 null - main.ts가 부팅 로그에 그대로 찍는다. */
export const ENV_PATH = findEnvFile();

if (ENV_PATH) {
  loadDotenv({ path: ENV_PATH });
} else {
  // 조용히 넘기면 안 된다. 기본값으로 뜨는 순간 CORS/DB가 통째로 어긋난다.
  // eslint-disable-next-line no-console
  console.warn(
    `[env] ${ENV_FILE}을 찾지 못했습니다 (cwd=${process.cwd()}, __dirname=${__dirname}). ` +
      '모든 설정이 기본값으로 동작합니다 - CORS는 http://localhost:5173만 허용하고 DB는 인메모리 목업입니다. ' +
      `배포 루트에 ${ENV_FILE}이 있는지 확인하세요(점으로 시작하는 파일이라 복사 시 누락되기 쉽습니다).`,
  );
}
