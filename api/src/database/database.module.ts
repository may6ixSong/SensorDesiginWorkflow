import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from '../users/schemas/user.schema';
import { ProjectSchema } from '../projects/schemas/project.schema';
import { IpSchema } from '../ips/schemas/ip.schema';
import { DeliverableSchema } from '../deliverables/schemas/deliverable.schema';
import { MemoSchema } from '../memos/schemas/memo.schema';
import { EdgeSchema } from '../edges/schemas/edge.schema';
import { HldReleaseSchema } from '../hld/schemas/hld-release.schema';
import { isUsingRealDb, ModelDef, registerModels } from './model-registration';
import { SeedRunnerService } from './seed-runner.service';

const logger = new Logger('DatabaseModule');

const ALL_MODELS: ModelDef[] = [
  { name: 'User', schema: UserSchema },
  { name: 'Project', schema: ProjectSchema },
  { name: 'Ip', schema: IpSchema },
  { name: 'Deliverable', schema: DeliverableSchema },
  { name: 'Memo', schema: MemoSchema },
  { name: 'Edge', schema: EdgeSchema },
  { name: 'HldRelease', schema: HldReleaseSchema },
];

/**
 * MONGODB_URI가 설정되어 있으면 그 실제 DB에 연결한다.
 * 비어 있으면(초기 개발/DB 미구성 단계) 실제 DB에는 전혀 연결하지 않는다 -
 * `MongooseModule.forRootAsync` 자체를 호출하지 않으므로 네트워크 연결 시도가 없다.
 * 대신 순수 인메모리 페이크 모델(src/database/in-memory-driver.ts)을 등록하고,
 * SeedRunnerService가 부팅 시점에 그 인메모리 컬렉션에 목업 데이터를 채운다.
 */
@Module({
  imports: [
    ...(isUsingRealDb()
      ? [
          MongooseModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({ uri: config.get<string>('mongodbUri') }),
          }),
        ]
      : []),
    registerModels(ALL_MODELS),
  ],
  providers: [SeedRunnerService],
})
export class DatabaseModule {
  constructor() {
    if (!isUsingRealDb()) {
      logger.warn(
        'MONGODB_URI가 설정되지 않아 실제 DB에 연결하지 않습니다. 순수 인메모리 목업 데이터로 동작합니다 ' +
          '(프로세스를 재시작하면 초기화됩니다). 지속되는 데이터가 필요하면 api/.env의 MONGODB_URI를 설정하세요.',
      );
    }
  }
}
