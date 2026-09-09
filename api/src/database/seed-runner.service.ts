import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isUsingRealDb } from './model-registration';
import { seedDatabase } from './seed-data';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { DeliverableDocument } from '../deliverables/schemas/deliverable.schema';
import { MemoDocument } from '../memos/schemas/memo.schema';
import { EdgeDocument } from '../edges/schemas/edge.schema';
import { HldReleaseDocument } from '../hld/schemas/hld-release.schema';
import { ArtifactServiceDocument } from '../hub/schemas/artifact-service.schema';

const MOCK_FILTER = { isMock: true };

/**
 * 목업 데이터 수명주기를 MOCKUP_ENABLED 플래그 하나로 관리한다.
 *
 *  MOCKUP_ENABLED=true  - 목업 문서가 하나도 없으면 부팅 시 한 번 시드한다.
 *                         모든 목업 문서에는 isMock:true가 붙는다. 이미 있으면 건너뛴다
 *                         (그래서 화면에서 목업을 수정·삭제한 결과가 재시작 후에도 남는다).
 *  MOCKUP_ENABLED=false - 부팅 시 isMock:true 문서만 일괄 삭제한다.
 *
 * 어느 경로에서도 isMock:false(=사용자가 실제로 만든 데이터)는 건드리지 않는다.
 * 개발이 끝나 목업을 걷어낼 때는 .env에서 플래그만 false로 바꿔 한 번 띄우면 된다.
 *
 * 실제 DB 모드와 인메모리 모드 양쪽에서 동일하게 동작한다 - 인메모리는 매 부팅마다
 * 비어 있으므로 플래그가 true이면 항상 시드된다.
 */
@Injectable()
export class SeedRunnerService implements OnModuleInit {
  private readonly logger = new Logger(SeedRunnerService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(getModelToken('Project')) private readonly projectModel: Model<ProjectDocument>,
    @Inject(getModelToken('Workflow')) private readonly workflowModel: Model<WorkflowDocument>,
    @Inject(getModelToken('Deliverable')) private readonly deliverableModel: Model<DeliverableDocument>,
    @Inject(getModelToken('Memo')) private readonly memoModel: Model<MemoDocument>,
    @Inject(getModelToken('Edge')) private readonly edgeModel: Model<EdgeDocument>,
    @Inject(getModelToken('HldRelease')) private readonly hldReleaseModel: Model<HldReleaseDocument>,
    @Inject(getModelToken('ArtifactService')) private readonly artifactServiceModel: Model<ArtifactServiceDocument>,
  ) {}

  /** 목업 시드가 문서를 만드는 컬렉션 전체. auditlogs는 시드 대상이 아니라 제외한다. */
  private get mockModels(): Model<any>[] {
    return [
      this.projectModel,
      this.workflowModel,
      this.deliverableModel,
      this.memoModel,
      this.edgeModel,
      this.hldReleaseModel,
    ];
  }

  async onModuleInit() {
    const mode = isUsingRealDb() ? '실제 DB' : '인메모리';

    if (!this.config.get<boolean>('mockupEnabled')) {
      const removed = await this.purgeMockDocuments();
      this.logger.log(
        removed > 0
          ? `MOCKUP_ENABLED=false - 목업 문서 ${removed}건을 삭제했습니다 (${mode} 모드). 실제 데이터는 그대로입니다.`
          : `MOCKUP_ENABLED=false - 목업 데이터를 쓰지 않습니다 (${mode} 모드).`,
      );
      return;
    }

    const existing = await this.countMockDocuments();
    if (existing > 0) {
      this.logger.log(
        `목업 문서 ${existing}건이 이미 있어 시드를 건너뜁니다 (${mode} 모드). ` +
          '처음 상태로 되돌리려면 MOCKUP_ENABLED=false로 한 번 띄워 정리한 뒤 true로 되돌리세요.',
      );
      return;
    }

    this.logger.log(`MOCKUP_ENABLED=true - 목업 데이터를 시드합니다 (${mode} 모드)...`);
    try {
      await seedDatabase({
        ArtifactService: this.artifactServiceModel,
        Project: this.projectModel,
        Workflow: this.workflowModel,
        Deliverable: this.deliverableModel,
        Memo: this.memoModel,
        Edge: this.edgeModel,
        HldRelease: this.hldReleaseModel,
      });
      this.logger.log('목업 시드 완료. (isMock:true로 표시되어 있어 플래그를 false로 바꾸면 일괄 삭제됩니다.)');
    } catch (err) {
      // 시드 실패로 앱 부팅 자체를 막지는 않는다 - 실제 데이터가 이미 있는 DB에서
      // code 중복(projects.code unique) 같은 충돌이 날 수 있기 때문이다.
      this.logger.error(
        `목업 시드에 실패했습니다 - 목업 없이 계속 진행합니다: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async countMockDocuments(): Promise<number> {
    const counts = await Promise.all(this.mockModels.map((m) => m.countDocuments(MOCK_FILTER)));
    return counts.reduce((sum, n) => sum + n, 0);
  }

  private async purgeMockDocuments(): Promise<number> {
    const results = await Promise.all(this.mockModels.map((m) => m.deleteMany(MOCK_FILTER)));
    return results.reduce((sum, r: any) => sum + (r?.deletedCount ?? 0), 0);
  }
}
