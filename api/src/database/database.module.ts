import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { memoryDbState } from './memory-db.state';
import { SeedRunnerService } from './seed-runner.service';

const logger = new Logger('DatabaseModule');

/**
 * mongodb-memory-server가 재노출하는 mongodb 드라이버의 타입 정의가 매우 무거워서
 * (제네릭 Filter<T>/UpdateFilter<T> 등) `import()`로 로드하면 tsc/webpack가 그 타입을
 * 전부 해석하려다 메모리를 과도하게 먹는다(OOM까지 관찰됨). 우리가 쓰는 API는
 * create()/getUri() 두 개뿐이므로, 타입 없는 require()로 우회해 컴파일 비용을 없앤다.
 */
interface MinimalMemoryServer {
  getUri(): string;
}
interface MinimalMemoryServerModule {
  MongoMemoryServer: { create(): Promise<MinimalMemoryServer> };
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), ms)),
  ]);
}

/**
 * MONGODB_URI가 설정되어 있으면 그대로 연결한다.
 * 비어 있으면(초기 개발/DB 미구성 단계) `mongodb-memory-server`로 임시 인메모리
 * MongoDB를 띄우고, SeedRunnerService가 부팅 시점에 목업 데이터를 자동으로 채운다.
 * 재시작하면 데이터가 초기화되므로, 지속되는 데이터가 필요하면 .env의 MONGODB_URI를 설정할 것.
 */
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const configuredUri = config.get<string>('mongodbUri');
        if (configuredUri) {
          return { uri: configuredUri };
        }

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MongoMemoryServer } = require('mongodb-memory-server') as MinimalMemoryServerModule;
        const guidance =
          '인메모리 MongoDB를 준비하지 못했습니다. 최초 실행 시 MongoDB 바이너리를 인터넷에서 ' +
          '내려받는데, 사내망/방화벽/프록시가 이 다운로드를 막고 있을 가능성이 높습니다. ' +
          '이 경우 인메모리 모드 대신 api/.env의 MONGODB_URI에 실제(또는 로컬) MongoDB 주소를 설정하세요.';
        let mem: MinimalMemoryServer;
        try {
          mem = await withTimeout(MongoMemoryServer.create(), 60_000, `${guidance} (60초 타임아웃)`);
        } catch (err) {
          const cause = err instanceof Error ? err.message : String(err);
          throw new Error(`${guidance}\n원인: ${cause}`);
        }
        memoryDbState.active = true;
        logger.warn(
          `MONGODB_URI가 설정되지 않아 임시 인메모리 MongoDB를 사용합니다 (${mem.getUri()}). ` +
            '목업 데이터가 자동으로 시드되며, 재시작하면 초기화됩니다. ' +
            '실제 DB를 쓰려면 api/.env의 MONGODB_URI를 설정하세요.',
        );
        return { uri: mem.getUri() };
      },
    }),
  ],
  providers: [SeedRunnerService],
})
export class DatabaseModule {}
