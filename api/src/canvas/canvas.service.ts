import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Block, BlockDocument } from '../blocks/schemas/block.schema';
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { Actor } from '../common/actor';
import { MemosService } from '../memos/memos.service';
import { EdgesService } from '../edges/edges.service';
import { AuditService } from '../audit/audit.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { CanvasViewService } from '../blocks/canvas-view.service';
import { PutCanvasDto } from './dto/put-canvas.dto';

/**
 * 캔버스(레이아웃/연결) 일괄 PUT.
 *
 * ★ 캔버스에는 **version 개념이 없다** — 모든 편집은 overwrite이고 스냅샷을 찍지 않는다
 *   (설계서 03장 §1). 그래서 저장 로직이 단순하다: 지금 상태를 그대로 덮어쓴다.
 * ★ **여기서만 canvasLock을 요구한다.** workflow의 name/description/department/phase는
 *   lock과 무관하게 언제든 바뀔 수 있다(설계서 03장 §3.3).
 */
@Injectable()
export class CanvasService {
  constructor(
    @InjectModel(Block.name) private readonly blockModel: Model<BlockDocument>,
    private readonly memos: MemosService,
    private readonly edges: EdgesService,
    private readonly audit: AuditService,
    private readonly workflows: WorkflowsService,
    private readonly canvasView: CanvasViewService,
  ) {}

  async apply(
    workflow: WorkflowDocument,
    project: ProjectDocument | null,
    dto: PutCanvasDto,
    actor: Actor,
  ) {
    // 단독 점유 확인 — 내 편집 세션이 살아 있어야 저장할 수 있다.
    this.workflows.assertCanvasLockHeldBy(workflow, actor);

    // ★ phaseId 검증은 이 workflow의 phase 목록 기준이다. 단 "지금 목록에 없는 phaseId"를
    //   무조건 거절하면 안 된다 — phase를 지우면 그걸 가리키던 블록은 일부러 그대로 남겨
    //   두는 설계라(유실 표시), 그 블록이 포함된 캔버스는 영영 저장할 수 없게 된다.
    //   그래서 "이미 저장돼 있던 값 그대로면" 통과시키고, 새로 지정하는 phaseId만 따진다.
    const validPhaseIds = new Set((workflow.phases ?? []).map((p) => p.id));

    this.assertValidLayouts(dto);

    const stored = await this.blockModel.find({ workflowId: workflow._id }, { phaseId: 1 }).exec();
    const storedPhaseId = new Map(stored.map((b) => [b._id.toString(), b.phaseId]));

    for (const b of dto.blocks) {
      if (validPhaseIds.has(b.phaseId)) continue;
      if (storedPhaseId.get(b.id) === b.phaseId) continue; // 유실된 채로 그대로 둔 블록
      throw new BadRequestException(`Unknown phase: ${b.phaseId}`);
    }
    // 메모는 블록과 달리 유실을 표시할 이유가 없다 — 사라진 phase에 붙어 있던 메모는
    // FE가 저장 직전에 남아 있는 첫 phase로 옮겨 보낸다.
    for (const m of dto.memos) {
      if (!validPhaseIds.has(m.phaseId)) {
        throw new BadRequestException(`Unknown phase: ${m.phaseId}`);
      }
    }

    await Promise.all(
      dto.blocks.map((b) =>
        this.blockModel
          .updateOne(
            { _id: b.id, workflowId: workflow._id },
            { $set: { layout: b.layout, phaseId: b.phaseId } },
          )
          .exec(),
      ),
    );

    await this.memos.replaceAllForWorkflow(
      workflow._id.toString(),
      dto.memos.map((m) => ({
        id: m.id,
        phaseId: m.phaseId,
        text: m.text,
        layout: m.layout,
        createdBy: actor.knoxId,
      })),
      workflow.isMock,
    );

    await this.edges.replaceAllForWorkflow(workflow._id.toString(), dto.edges, workflow.isMock);

    // phaseWidths는 레인 폭 조절이 없었으면 생략되어 온다 — 그때는 기존 저장값을 그대로 둔다.
    if (dto.phaseWidths) {
      workflow.phaseWidths = this.sanitizePhaseWidths(dto.phaseWidths);
      await workflow.save();
    }

    await this.audit.log(actor.knoxId, 'CANVAS_SAVE', 'workflow', workflow._id, {
      blocks: dto.blocks.length,
      edges: dto.edges.length,
      memos: dto.memos.length,
    });

    return {
      blocks: await this.canvasView.assemble(workflow, project, actor),
      memos: await this.memos.listForWorkflow(workflow._id.toString()),
      edges: await this.edges.listForWorkflow(workflow._id.toString()),
    };
  }

  /** 숫자가 아니거나 0 이하인 값은 걷어낸다 — 나머지는 그대로 신뢰한다. */
  private sanitizePhaseWidths(widths: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, w] of Object.entries(widths)) {
      if (Number.isFinite(w) && w > 0) out[id] = w;
    }
    return out;
  }

  private assertValidLayouts(dto: PutCanvasDto) {
    // y는 위 방향 벽을 없애 자유롭게 음수로 드래그할 수 있으므로 하한을 두지 않는다 —
    // x(phase 레인 좌측 경계)는 여전히 0 이상이어야 한다.
    const isValid = (l: { x: number; y: number; w: number; h: number }) =>
      l && l.x >= 0 && Number.isFinite(l.y) && l.w > 0 && l.h > 0;
    for (const b of dto.blocks) {
      if (!isValid(b.layout)) throw new BadRequestException(`Invalid coordinates: ${b.id}`);
    }
    for (const m of dto.memos) {
      if (!isValid(m.layout)) throw new BadRequestException('Memo coordinates are invalid.');
      if (!m.text || m.text.length > 2000) throw new BadRequestException('Memo text length is invalid.');
    }
  }
}
