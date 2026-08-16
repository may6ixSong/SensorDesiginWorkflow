import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Deliverable, DeliverableDocument } from '../deliverables/schemas/deliverable.schema';
import { IpDocument } from '../ips/schemas/ip.schema';
import { UserDocument } from '../users/schemas/user.schema';
import { ProjectsService } from '../projects/projects.service';
import { MemosService } from '../memos/memos.service';
import { EdgesService } from '../edges/edges.service';
import { AuditService } from '../audit/audit.service';
import { PutCanvasDto } from './dto/put-canvas.dto';

/**
 * 캔버스(레이아웃/연결) 일괄 PUT (설계서 5.5). 배치·Auto Fit·series 일정 변경은
 * 전부 FE 메모리에서 계산되고, BE는 좌표의 최소 유효성만 검사한 뒤 신뢰하고 저장한다.
 * 단 phaseKey가 실제 프로젝트 Phase 목록에 존재하는지는 검증한다.
 */
@Injectable()
export class CanvasService {
  constructor(
    @InjectModel(Deliverable.name) private readonly deliverableModel: Model<DeliverableDocument>,
    private readonly projects: ProjectsService,
    private readonly memos: MemosService,
    private readonly edges: EdgesService,
    private readonly audit: AuditService,
  ) {}

  async apply(ip: IpDocument, dto: PutCanvasDto, actor: UserDocument) {
    const project = await this.projects.findByIdOrThrow(ip.projectId.toString());
    const validPhaseKeys = new Set(project.phases.map((p) => p.key));

    this.assertValidLayouts(dto);
    for (const d of dto.deliverables) {
      if (!validPhaseKeys.has(d.phaseKey)) {
        throw new BadRequestException(`Unknown phase: ${d.phaseKey}`);
      }
    }
    for (const m of dto.memos) {
      if (!validPhaseKeys.has(m.phaseKey)) {
        throw new BadRequestException(`Unknown phase: ${m.phaseKey}`);
      }
    }

    await Promise.all(
      dto.deliverables.map((d) =>
        this.deliverableModel
          .updateOne(
            { _id: d.id, ipId: ip._id },
            { $set: { layout: d.layout, phaseKey: d.phaseKey } },
          )
          .exec(),
      ),
    );

    await this.memos.replaceAllForIp(
      ip._id.toString(),
      dto.memos.map((m) => ({
        id: m.id,
        phaseKey: m.phaseKey,
        text: m.text,
        layout: m.layout,
        createdBy: actor._id.toString(),
      })),
    );

    await this.edges.replaceAllForIp(ip._id.toString(), dto.edges);

    await this.audit.log(actor._id, 'LAYOUT_UPDATE', 'ip', ip._id, {
      deliverableCount: dto.deliverables.length,
      memoCount: dto.memos.length,
      edgeCount: dto.edges.length,
    });

    return {
      deliverables: await this.deliverableModel.find({ ipId: ip._id }).exec(),
      memos: await this.memos.listForIp(ip._id.toString()),
      edges: await this.edges.listForIp(ip._id.toString()),
    };
  }

  private assertValidLayouts(dto: PutCanvasDto) {
    const isValid = (l: { x: number; y: number; w: number; h: number }) =>
      l && l.x >= 0 && l.y >= 0 && l.w > 0 && l.h > 0;
    for (const d of dto.deliverables) {
      if (!isValid(d.layout)) throw new BadRequestException(`Invalid coordinates: ${d.id}`);
    }
    for (const m of dto.memos) {
      if (!isValid(m.layout)) throw new BadRequestException('Memo coordinates are invalid.');
      if (!m.text || m.text.length > 2000) throw new BadRequestException('Memo text length is invalid.');
    }
  }
}
