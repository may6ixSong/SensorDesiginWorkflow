import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Deliverable, DeliverableDocument } from '../deliverables/schemas/deliverable.schema';
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { Actor } from '../common/actor';
import { MemosService } from '../memos/memos.service';
import { EdgesService } from '../edges/edges.service';
import { AuditService } from '../audit/audit.service';
import { PutCanvasDto } from './dto/put-canvas.dto';

/**
 * 캔버스(레이아웃/연결) 일괄 PUT (설계서 5.5). 배치·series 일정 변경은
 * 전부 FE 메모리에서 계산되고, BE는 좌표의 최소 유효성만 검사한 뒤 신뢰하고 저장한다.
 * 단 phaseKey가 실제 프로젝트 Phase 목록에 존재하는지는 검증한다.
 */
@Injectable()
export class CanvasService {
  constructor(
    @InjectModel(Deliverable.name) private readonly deliverableModel: Model<DeliverableDocument>,
    private readonly memos: MemosService,
    private readonly edges: EdgesService,
    private readonly audit: AuditService,
  ) {}

  async apply(workflow: WorkflowDocument, dto: PutCanvasDto, actor: Actor) {
    // ★ phaseId 검증은 이 workflow의 phase 목록 기준이다(더 이상 과제 마일스톤이 아니다).
    //   단, "지금 목록에 없는 phaseId"를 무조건 거절하면 안 된다 — phase를 지우면 그걸
    //   가리키던 산출물은 일부러 그대로 남겨 두는 설계라(사용자 요청: 유실 표시), 그 산출물이
    //   포함된 캔버스는 영영 저장할 수 없게 된다. 그래서 "이미 저장돼 있던 값 그대로면"
    //   통과시키고, 새로 지정하는 phaseId만 실재 여부를 따진다.
    const validPhaseIds = new Set((workflow.phases ?? []).map((p) => p.id));

    this.assertValidLayouts(dto);

    const stored = await this.deliverableModel
      .find({ workflowId: workflow._id }, { phaseId: 1 })
      .exec();
    const storedPhaseId = new Map(stored.map((d) => [d._id.toString(), d.phaseId]));

    for (const d of dto.deliverables) {
      if (validPhaseIds.has(d.phaseId)) continue;
      if (storedPhaseId.get(d.id) === d.phaseId) continue; // 유실된 채로 그대로 둔 산출물
      throw new BadRequestException(`Unknown phase: ${d.phaseId}`);
    }
    // 메모는 산출물과 달리 유실을 표시할 이유가 없다 — 사라진 phase에 붙어 있던 메모는
    // FE가 저장 직전에 남아 있는 첫 phase로 옮겨 보낸다.
    for (const m of dto.memos) {
      if (!validPhaseIds.has(m.phaseId)) {
        throw new BadRequestException(`Unknown phase: ${m.phaseId}`);
      }
    }

    await Promise.all(
      dto.deliverables.map((d) =>
        this.deliverableModel
          .updateOne(
            { _id: d.id, workflowId: workflow._id },
            { $set: { layout: d.layout, phaseId: d.phaseId } },
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

    await this.audit.log(actor.knoxId, 'LAYOUT_UPDATE', 'workflow', workflow._id, {
      deliverableCount: dto.deliverables.length,
      memoCount: dto.memos.length,
      edgeCount: dto.edges.length,
    });

    return {
      deliverables: await this.deliverableModel.find({ workflowId: workflow._id }).exec(),
      memos: await this.memos.listForWorkflow(workflow._id.toString()),
      edges: await this.edges.listForWorkflow(workflow._id.toString()),
    };
  }

  private assertValidLayouts(dto: PutCanvasDto) {
    // y는 위 방향 벽(top wall)을 없애 자유롭게 음수로 드래그할 수 있으므로 하한을
    // 두지 않는다 - x(phase 레인 좌측 경계)는 여전히 0 이상이어야 한다.
    const isValid = (l: { x: number; y: number; w: number; h: number }) =>
      l && l.x >= 0 && Number.isFinite(l.y) && l.w > 0 && l.h > 0;
    for (const d of dto.deliverables) {
      if (!isValid(d.layout)) throw new BadRequestException(`Invalid coordinates: ${d.id}`);
    }
    for (const m of dto.memos) {
      if (!isValid(m.layout)) throw new BadRequestException('Memo coordinates are invalid.');
      if (!m.text || m.text.length > 2000) throw new BadRequestException('Memo text length is invalid.');
    }
  }
}
