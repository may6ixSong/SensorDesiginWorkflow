import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { memoryDbState } from './memory-db.state';
import { seedDatabase } from './seed-data';

/** MONGODB_URI 미설정으로 인메모리 DB가 뜬 경우에만, 부팅 시점에 목업 데이터를 자동 시드한다. */
@Injectable()
export class SeedRunnerService implements OnModuleInit {
  private readonly logger = new Logger(SeedRunnerService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onModuleInit() {
    if (!memoryDbState.active) return;
    this.logger.log('인메모리 DB 목업 데이터 시드 중...');
    await seedDatabase(this.connection);
    this.logger.log('시드 완료. (컨테이너/프로세스를 재시작하면 초기화됩니다)');
  }
}
