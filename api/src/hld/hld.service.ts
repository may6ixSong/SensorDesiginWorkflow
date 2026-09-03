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
   * 현재 시점 Release된 산출물만 스냅샷으로 저장한다 (v2 §3.10, Hub 설계서 §6.3).
   * "현재 산출물 전체 목록과의 조인(공란 처리)"은 FE가 수행한다.
   *
   * ★ 버전을 **얼린다**: 그 시점의 versionRef를 그대로 박아두므로, 그 뒤로 서비스가
   *   버전을 더 올려도 이 Release는 계속 그때 그 버전을 가리킨다. 그래서 각 서비스는
   *   이미 참조된 버전을 삭제·덮어쓰기하지 않아야 한다(최소 soft-delete).
   *
   * ★ tier와 confidence를 함께 저장한다: C/D 티어 항목은 시스템이 확인한 게 아니라
   *   담당자가 수동 입력한 것이므로, 몇 달 뒤에 이 Release를 다시 열어도 그 사실이
   *   남아 있어야 한다(§6.3).
   */
  async createRelease(workflow: WorkflowDocument, note: string | undefined, actor: Actor) {
    const deliverables = await this.deliverableModel.find({ workflowId: workflow._id }).exec();
    const items: Record<string, unknown> = {};
    const pinnedAt = new Date();
    for (const d of deliverables) {
      const released = d.versions.find((v) => v.isReleased === true);
      if (!released) continue;
      items[d._id.toString()] = {
        version: released.versionLabel,
        versionRef: released.versionRef ?? null,
        versionLabel: released.versionLabel,
        tier: released.tier,
        confidence: released.tier === 'A' || released.tier === 'B' ? 'verified' : 'asserted',
        pinnedAt,
        file: released.hpcPath ?? released.viewUrl ?? null,
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
