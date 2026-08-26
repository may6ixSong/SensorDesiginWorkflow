import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HldRelease, HldReleaseDocument } from './schemas/hld-release.schema';
import { Deliverable, DeliverableDocument } from '../deliverables/schemas/deliverable.schema';
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { Actor } from '../common/actor';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class HldService {
  constructor(
    @InjectModel(HldRelease.name) private readonly hldModel: Model<HldReleaseDocument>,
    @InjectModel(Deliverable.name) private readonly deliverableModel: Model<DeliverableDocument>,
    private readonly audit: AuditService,
  ) {}

  listForWorkflow(workflowId: string) {
    return this.hldModel.find({ workflowId }).sort({ createdAt: -1 }).exec();
  }

  /**
   * 현재 시점 Released(major) 산출물만 스냅샷으로 저장한다 (설계서 3.10, 4.9).
   * "현재 산출물 전체 목록과의 조인(공란 처리)"은 FE가 수행한다.
   */
  async createRelease(workflow: WorkflowDocument, note: string | undefined, actor: Actor) {
    const deliverables = await this.deliverableModel.find({ workflowId: workflow._id }).exec();
    const items: Record<string, unknown> = {};
    for (const d of deliverables) {
      const released = d.versions.find((v) => v.kind === 'major');
      if (!released) continue;
      items[d._id.toString()] = {
        version: `${released.major}.${released.minor}`,
        file: released.fileName ?? released.hpcPath ?? null,
        at: released.createdAt.toISOString(),
        comment: released.note ?? '',
      };
    }

    const prevCount = await this.hldModel.countDocuments({ workflowId: workflow._id }).exec();
    const version = `${prevCount + 1}.0`;

    const hld = await this.hldModel.create({
      workflowId: workflow._id,
      version,
      date: new Date().toISOString().slice(0, 10),
      releasedBy: actor.knoxId,
      note: note ?? '',
      items,
      isMock: workflow.isMock,
    });

    await this.audit.log(actor.knoxId, 'HLD_RELEASE', 'workflow', workflow._id, { version });
    return hld;
  }
}
