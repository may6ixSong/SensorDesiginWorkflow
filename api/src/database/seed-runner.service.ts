import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isUsingRealDb } from './model-registration';
import { seedDatabase } from './seed-data';
import { UserDocument } from '../users/schemas/user.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { IpDocument } from '../ips/schemas/ip.schema';
import { DeliverableDocument } from '../deliverables/schemas/deliverable.schema';
import { MemoDocument } from '../memos/schemas/memo.schema';
import { EdgeDocument } from '../edges/schemas/edge.schema';
import { HldReleaseDocument } from '../hld/schemas/hld-release.schema';

/**
 * MONGODB_URI 미설정(=인메모리 모드)일 때만, 부팅 시점에 목업 데이터를 자동 시드한다.
 * 실제 DB 모드에서는 아무 것도 하지 않는다 - `npm run seed`를 수동으로 실행할 것.
 */
@Injectable()
export class SeedRunnerService implements OnModuleInit {
  private readonly logger = new Logger(SeedRunnerService.name);

  constructor(
    @Inject(getModelToken('User')) private readonly userModel: Model<UserDocument>,
    @Inject(getModelToken('Project')) private readonly projectModel: Model<ProjectDocument>,
    @Inject(getModelToken('Ip')) private readonly ipModel: Model<IpDocument>,
    @Inject(getModelToken('Deliverable')) private readonly deliverableModel: Model<DeliverableDocument>,
    @Inject(getModelToken('Memo')) private readonly memoModel: Model<MemoDocument>,
    @Inject(getModelToken('Edge')) private readonly edgeModel: Model<EdgeDocument>,
    @Inject(getModelToken('HldRelease')) private readonly hldReleaseModel: Model<HldReleaseDocument>,
  ) {}

  async onModuleInit() {
    if (isUsingRealDb()) return;
    this.logger.log('인메모리 모드 - 목업 데이터 시드 중...');
    await seedDatabase({
      User: this.userModel,
      Project: this.projectModel,
      Ip: this.ipModel,
      Deliverable: this.deliverableModel,
      Memo: this.memoModel,
      Edge: this.edgeModel,
      HldRelease: this.hldReleaseModel,
    });
    this.logger.log('시드 완료. (프로세스를 재시작하면 초기화됩니다. DB에 연결하지 않은 순수 인메모리 상태입니다.)');
  }
}
