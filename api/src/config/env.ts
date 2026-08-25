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
import { resolve } from 'path';

/** NODE_ENV=production 이면 .env.production, 그 외에는 .env.development. */
export const ENV_FILE = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';

loadDotenv({ path: resolve(process.cwd(), ENV_FILE) });
