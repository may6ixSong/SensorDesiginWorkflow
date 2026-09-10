import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Block, BlockDocument } from './schemas/block.schema';
import { Actor } from '../common/actor';
import { AuditService } from '../audit/audit.service';
import { ArtifactsService } from '../artifacts/artifacts.service';
import { normalizeGrant } from '../common/access';
import { isServiceGovernedTier } from '../common/constants/tier';
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';

@Injectable()
export class BlocksService {
  constructor(
    @InjectModel(Block.name) private readonly model: Model<BlockDocument>,
    private readonly artifacts: ArtifactsService,
    private readonly audit: AuditService,
  ) {}

  listForWorkflow(workflowId: string | Types.ObjectId) {
    return this.model.find({ workflowId }).exec();
  }

  async findOrThrow(blockId: string): Promise<BlockDocument> {
    const block = await this.model.findById(blockId).exec();
    if (!block) throw new NotFoundException('Block not found.');
    return block;
  }

  countForWorkflow(workflowId: string | Types.ObjectId) {
    return this.model.countDocuments({ workflowId }).exec();
  }

  /**
   * 새 블록. artifactId 없이 만들 수 있다 — 자리는 캔버스에 잡아두고 출처는 나중에
   * 지정하는 것이 **정상 빈 상태**다(설계서 03장 §2.3).
   *
   * intent는 항상 'own'이다 — "새 Artifact 추가" 버튼이 하나로 통합되어 내가 주는
   * 산출물만 만든다(설계서 03장 §5.2). 받는 산출물 UX는 TODO T2.
   */
  async create(
    workflow: WorkflowDocument,
    input: {
      name: string;
      phaseId: string;
      layout: { x: number; y: number; w: number; h: number };
      artifactId?: string | null;
    },
    actor: Actor,
  ): Promise<BlockDocument> {
    if (!(workflow.phases ?? []).some((p) => p.id === input.phaseId)) {
      throw new BadRequestException(`Unknown phase: ${input.phaseId}`);
    }

    let artifactId: Types.ObjectId | null = null;
    if (input.artifactId) {
      const artifact = await this.artifacts.findOrThrow(input.artifactId);
      // 같은 과제 안에서만 매핑할 수 있다(설계서 04장 §1.1).
      this.artifacts.assertSameProject(artifact, workflow.projectId);
      artifactId = artifact._id;
    }

    const block = await this.model.create({
      projectId: workflow.projectId,
      workflowId: workflow._id,
      phaseId: input.phaseId,
      artifactId,
      name: input.name.trim(),
      layout: input.layout,
      intent: 'own',
      recipients: { editAccess: { departments: [], users: [] }, viewAccess: { departments: [], users: [] } },
      series: null,
      seriesIdx: 1,
      seriesTotal: 1,
      createdBy: actor.knoxId,
      isMock: false,
    });
    await this.audit.log(actor.knoxId, 'BLOCK_CREATE', 'block', block._id, {
      workflowId: workflow._id.toString(),
      artifactId: artifactId?.toString() ?? null,
    });
    return block;
  }

  /** 블록 이름 변경 / artifact 매핑 변경. */
  async update(
    blockId: string,
    input: { name?: string; artifactId?: string | null },
    actor: Actor,
  ): Promise<BlockDocument> {
    const block = await this.findOrThrow(blockId);

    if (input.name !== undefined) block.name = input.name.trim();

    if (input.artifactId !== undefined) {
      const before = block.artifactId?.toString() ?? null;

      if (input.artifactId === null) {
        block.artifactId = null;
        // 매핑을 풀면 recipient도 의미가 없다 — 남겨두면 다른 산출물에 잘못 붙는다.
        block.recipients = {
          editAccess: { departments: [], users: [] },
          viewAccess: { departments: [], users: [] },
        };
      } else {
        const artifact = await this.artifacts.findOrThrow(input.artifactId);
        this.artifacts.assertSameProject(artifact, block.projectId);
        block.artifactId = artifact._id;
      }

      const after = block.artifactId?.toString() ?? null;
      if (before !== after) {
        // 무엇이 누구에게 전달되는지가 통째로 달라지는 사건이라 반드시 남긴다.
        await this.audit.log(actor.knoxId, 'BLOCK_ARTIFACT_REMAP', 'block', block._id, {
          workflowId: block.workflowId.toString(),
          from: before,
          to: after,
        });
      }
    }

    await block.save();
    return this.findOrThrow(blockId);
  }

  async remove(blockId: string, actor: Actor): Promise<void> {
    const block = await this.findOrThrow(blockId);
    await this.model.findByIdAndDelete(blockId).exec();
    await this.audit.log(actor.knoxId, 'BLOCK_DELETE', 'block', block._id, {
      workflowId: block.workflowId.toString(),
    });
  }

  /**
   * A Tier block의 recipient 교체 (설계서 04장 §3.3).
   *
   * ★ A Tier에서만 허용한다. B/C/D는 artifact.viewAccess가 곧 recipient이고 그건 artifact
   *   단위로 중앙 관리되므로, block에 따로 넣으면 진실이 둘로 갈린다.
   * ★ 편집 권한은 그 workflow의 Edit Access다 — 컨트롤러가 이미 검증하고 들어온다.
   *   recipient에 **속하는 것**과 recipient를 **편집하는 것**은 별개다(설계서 01장 §4.2).
   */
  async replaceRecipients(
    blockId: string,
    input: {
      editAccess?: { departments?: string[]; users?: string[] };
      viewAccess?: { departments?: string[]; users?: string[] };
    },
    actor: Actor,
  ): Promise<BlockDocument> {
    const block = await this.findOrThrow(blockId);
    if (!block.artifactId) {
      throw new BadRequestException('This block has no artifact mapped yet.');
    }
    const artifact = await this.artifacts.findOrThrow(block.artifactId.toString());
    if (!isServiceGovernedTier(artifact.tier)) {
      throw new BadRequestException(
        'Recipients are only set on the block for Tier A. For B/C/D, edit the artifact view access instead.',
      );
    }
    block.recipients = {
      editAccess: normalizeGrant(input.editAccess),
      viewAccess: normalizeGrant(input.viewAccess),
    };
    await block.save();
    await this.audit.log(actor.knoxId, 'BLOCK_RECIPIENTS_REPLACE', 'block', block._id, {
      recipients: block.recipients,
    });
    return this.findOrThrow(blockId);
  }

  /**
   * 이 workflow의 블록 중 **release 대상**만 (설계서 05장 §2).
   * artifact가 매핑된 것 전부다 — 미매핑 블록은 전달할 실체가 없어 제외된다.
   */
  async releasableForWorkflow(workflowId: string | Types.ObjectId): Promise<BlockDocument[]> {
    const blocks = await this.model.find({ workflowId }).exec();
    return blocks.filter((b) => Boolean(b.artifactId));
  }

  async deleteForWorkflow(workflowId: string | Types.ObjectId): Promise<void> {
    await this.model.deleteMany({ workflowId }).exec();
  }
}
