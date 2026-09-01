import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Deliverable, DeliverableDocument } from './schemas/deliverable.schema';
import { Workflow, WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { Actor } from '../common/actor';
import { sortSchedule } from '../common/schedule';
import { AuditService } from '../audit/audit.service';
import { EdgesService } from '../edges/edges.service';
import { RECEIVABLE_DEPARTMENT_IDS } from '../common/constants/departments';
import {
  AddVersionDto,
  CreateDeliverableDto,
  ReleaseDto,
  UpdateDeliverableDto,
  UpdateRecvDto,
} from './dto/deliverable-crud.dto';

@Injectable()
export class DeliverablesService {
  constructor(
    @InjectModel(Deliverable.name) private readonly model: Model<DeliverableDocument>,
    @InjectModel(Workflow.name) private readonly workflowModel: Model<WorkflowDocument>,
    private readonly audit: AuditService,
    private readonly edges: EdgesService,
  ) {}

  listForWorkflow(workflowId: string) {
    return this.model.find({ workflowId }).sort({ phaseId: 1, 'layout.x': 1 }).exec();
  }

  /**
   * 다른 workflow가 recvWorkflowId로 이 workflowId를 지정한 산출물들 = "Incoming from other workflows".
   * 각 산출물을 준 Workflow(sourceWorkflow) 문서를 함께 묶어 반환한다 (설계서에 없는 신규 기능).
   */
  async listIncomingForWorkflow(workflowId: string): Promise<{ deliverable: DeliverableDocument; sourceWorkflow: WorkflowDocument }[]> {
    const list = await this.model.find({ recvWorkflowId: workflowId }).sort({ phaseId: 1, 'layout.x': 1 }).exec();
    if (!list.length) return [];

    const sourceWorkflowIds = Array.from(new Set(list.map((d) => d.workflowId.toString())));
    const sourceWorkflows = await this.workflowModel.find({ _id: { $in: sourceWorkflowIds } }).exec();
    const ipById = new Map(sourceWorkflows.map((workflow) => [workflow._id.toString(), workflow]));

    const result: { deliverable: DeliverableDocument; sourceWorkflow: WorkflowDocument }[] = [];
    for (const deliverable of list) {
      const sourceWorkflow = ipById.get(deliverable.workflowId.toString());
      if (sourceWorkflow) result.push({ deliverable, sourceWorkflow });
    }
    return result;
  }

  async findOrThrow(id: string) {
    const d = await this.model.findById(id).exec();
    if (!d) throw new NotFoundException('Deliverable not found.');
    return d;
  }

  /** 다음 업로드가 받을 버전 문자열(스토리지 키 경로용) - 업로드는 minor +1이다 (설계서 3.5). */
  nextVersionLabel(d: DeliverableDocument): string {
    const latest = d.versions[0];
    return latest ? `${latest.major}.${latest.minor + 1}` : '0.1';
  }

  /**
   * 다운로드 대상 버전을 찾는다. Edit 권한이 없으면 Release(major) 버전만 볼 수 있으므로
   * 작업중(minor) 버전은 존재조차 하지 않는 것으로 취급한다 (설계서 6.1).
   */
  findVersionOrThrow(d: DeliverableDocument, major: number, minor: number, isEditor: boolean) {
    const visible = isEditor ? d.versions : d.versions.filter((v) => v.kind === 'major');
    const version = visible.find((v) => v.major === major && v.minor === minor);
    if (!version) throw new NotFoundException('Version not found.');
    return version;
  }

  async create(workflow: WorkflowDocument, dto: CreateDeliverableDto, actor: Actor) {
    const d = await this.model.create({
      projectId: workflow.projectId,
      workflowId: workflow._id,
      phaseId: dto.phaseId,
      name: dto.name,
      docType: dto.docType,
      network: dto.network,
      series: null,
      seriesIdx: 1,
      seriesTotal: 1,
      recvDept: null,
      recvContact: null,
      sourceWorkflowId: null,
      sourceContact: null,
      layout: { x: 0, y: 0, w: 160, h: 82 },
      versions: [],
      createdBy: actor.knoxId,
      // 목업 workflow 아래 산출물은 목업으로 남긴다 - 플래그를 끌 때 workflow와 함께 정리된다.
      isMock: workflow.isMock,
    });
    await this.audit.log(actor.knoxId, 'DELIVERABLE_CREATE', 'deliverable', d._id, { name: dto.name });
    return d;
  }

  async update(id: string, dto: UpdateDeliverableDto) {
    const d = await this.findOrThrow(id);
    if (dto.name !== undefined) d.name = dto.name;
    if (dto.docType !== undefined) d.docType = dto.docType;
    if (dto.network !== undefined) d.network = dto.network;
    await d.save();
    return d;
  }

  async remove(id: string, actor: Actor) {
    const d = await this.findOrThrow(id);
    await this.edges.deleteByDeliverableIds([d._id]);
    await d.deleteOne();
    await this.audit.log(actor.knoxId, 'DELIVERABLE_DELETE', 'deliverable', id, { name: d.name });
  }

  /**
   * recvDept는 Analog 제외 5개 중 하나 (설계서 3.4, 4.6, BE 검증).
   * recvContact는 KnoxID 문자열이며 "그 부서 소속인지"는 api가 조회할 수 없으므로
   * recvDept가 함께 지정되었는지까지만 검증한다 - 소속 판정은 web(공통 플랫폼 조회)의 몫이다.
   */
  async updateRecv(id: string, dto: UpdateRecvDto, actor: Actor) {
    const d = await this.findOrThrow(id);

    if (dto.recvDept) {
      if (!(RECEIVABLE_DEPARTMENT_IDS as string[]).includes(dto.recvDept)) {
        throw new BadRequestException('Recipient department must be a department other than Analog.');
      }
    }

    if (dto.recvContact && !dto.recvDept) {
      throw new BadRequestException('A recipient department is required when a recipient contact is set.');
    }

    if (dto.recvWorkflowId) {
      if (dto.recvWorkflowId === d.workflowId.toString()) {
        throw new BadRequestException('A deliverable cannot list its own Workflow as the recipient Workflow.');
      }
      const targetIp = await this.workflowModel.findById(dto.recvWorkflowId).exec();
      if (!targetIp) throw new NotFoundException('Recipient Workflow not found.');
      if (targetIp.projectId.toString() !== d.projectId.toString()) {
        throw new BadRequestException('Recipient Workflow must belong to the same project.');
      }
    }

    if (dto.sourceWorkflowId) {
      if (dto.sourceWorkflowId === d.workflowId.toString()) {
        throw new BadRequestException('A deliverable cannot list its own Workflow as the source Workflow.');
      }
      const sourceIp = await this.workflowModel.findById(dto.sourceWorkflowId).exec();
      if (!sourceIp) throw new NotFoundException('Source Workflow not found.');
      if (sourceIp.projectId.toString() !== d.projectId.toString()) {
        throw new BadRequestException('Source Workflow must belong to the same project.');
      }
    }

    d.recvDept = dto.recvDept ?? null;
    d.recvContact = dto.recvContact ?? null;
    d.recvWorkflowId = dto.recvWorkflowId ? new Types.ObjectId(dto.recvWorkflowId) : null;
    d.sourceDept = dto.sourceDept?.trim() || null;
    d.sourceWorkflowId = dto.sourceWorkflowId ? new Types.ObjectId(dto.sourceWorkflowId) : null;
    d.sourceContact = dto.sourceContact?.trim() || null;
    await d.save();
    await this.audit.log(actor.knoxId, 'RECV_UPDATE', 'deliverable', d._id, {
      recvDept: d.recvDept,
      recvContact: d.recvContact,
      recvWorkflowId: d.recvWorkflowId,
      sourceWorkflowId: d.sourceWorkflowId,
    });
    return d;
  }

  /** 업로드 = minor +1 (최초는 v0.1) (설계서 3.5). */
  async addVersion(id: string, dto: AddVersionDto, actor: Actor) {
    const d = await this.findOrThrow(id);
    if (d.network === 'OA' && !dto.storageKey) {
      throw new BadRequestException('OA-network deliverables require a storageKey.');
    }
    if (d.network === 'HPC' && !dto.hpcPath) {
      throw new BadRequestException('HPC-network deliverables require an hpcPath.');
    }

    const latest = d.versions[0];
    const major = latest ? latest.major : 0;
    const minor = latest ? latest.minor + 1 : 1;

    const version = {
      major,
      minor,
      kind: 'minor' as const,
      fileName: dto.fileName,
      storageKey: dto.storageKey ?? null,
      hpcPath: dto.hpcPath ?? null,
      note: dto.note ?? '',
      createdBy: actor.knoxId,
      createdAt: new Date(),
    };
    d.versions.unshift(version as any);
    await d.save();
    await this.audit.log(actor.knoxId, 'VERSION_UPLOAD', 'deliverable', d._id, { major, minor });
    return d;
  }

  /** Release = major +1 · minor 0, 최신 업로드분을 그대로 릴리스로 승격 (설계서 3.5, 5.4). */
  async release(id: string, dto: ReleaseDto, actor: Actor) {
    const d = await this.findOrThrow(id);
    const latest = d.versions[0];
    if (!latest) {
      throw new BadRequestException('There is no uploaded version to release.');
    }
    const major = latest.major + 1;
    const version = {
      major,
      minor: 0,
      kind: 'major' as const,
      fileName: latest.fileName,
      storageKey: latest.storageKey,
      hpcPath: latest.hpcPath,
      note: dto.note ?? '',
      createdBy: actor.knoxId,
      createdAt: new Date(),
    };
    d.versions.unshift(version as any);
    await d.save();
    await this.audit.log(actor.knoxId, 'RELEASE', 'deliverable', d._id, { major });
    return d;
  }

  /**
   * Release 일정(series) 갱신 (설계서 3.6). 선택된 phaseIds에 맞춰 인스턴스를
   * 생성/삭제하고, 최초 생성 시에만 회차 순서대로 auto edge를 연결한다.
   * phaseId는 이 workflow가 자기 것으로 가진 phase여야 한다 — 과제 마일스톤이 아니다.
   *
   * ★ 원본(origin)의 phaseId가 요청 목록에 없으면 원본을 **첫 번째 phase로 옮긴다**.
   *   이게 "일정을 잃은 산출물을 다시 배치하는" 유일한 경로다: 유실된 산출물은 원본의
   *   phaseId가 사라진 phase를 가리키는 상태라, 원본을 그대로 두고 인스턴스만 만들면
   *   원본은 영원히 유실로 남고 같은 이름의 산출물만 하나 더 생긴다(실측 확인).
   *   좌표(layout)는 건드리지 않는다 — 옮긴 것은 일정이지 캔버스 위치가 아니다.
   */
  async updateSchedule(
    workflow: WorkflowDocument,
    originId: string,
    phaseIds: string[],
    actor: Actor,
  ) {
    const origin = await this.findOrThrow(originId);
    const validPhaseIds = new Set((workflow.phases ?? []).map((p) => p.id));
    // 유실된(=지금 목록에 없는) phase는 새 일정으로 고를 수 없다. 원본이 지금 유실
    // 상태라면 그 phaseId는 그대로 두는 것만 허용한다 — 유실 표시를 유지한 채
    // 다른 회차만 손볼 수 있어야 하기 때문이다.
    for (const id of phaseIds) {
      if (!validPhaseIds.has(id) && id !== origin.phaseId) {
        throw new BadRequestException(`Unknown phase: ${id}`);
      }
    }
    if (origin.series) {
      throw new BadRequestException('The release schedule can only be set on the original deliverable, not a series instance.');
    }

    // 요청 목록을 이 workflow의 일정 순서(시작일 오름차순)로 세운다 — 원본이 가져갈
    // "첫 번째 phase"가 그 순서의 맨 앞이어야 회차 번호와 캔버스의 좌→우가 일치한다.
    const order = new Map(sortSchedule(workflow.phases ?? []).map((p, i) => [p.id, i]));
    const requested = Array.from(new Set(phaseIds)).sort(
      (a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER),
    );

    if (requested.length && !requested.includes(origin.phaseId)) {
      origin.phaseId = requested[0];
      await origin.save();
    }

    const existing = await this.model.find({ series: origin._id }).sort({ seriesIdx: 1 }).exec();
    const existingByPhase = new Map(existing.map((e) => [e.phaseId, e]));
    // 원본(origin) 자신이 이미 자신의 phaseId를 차지하고 있으므로, 그 phase는
    // series 인스턴스로 다시 만들면 안 된다 - 그렇지 않으면 원본과 같은 phase에
    // 중복 인스턴스가 생긴다(실측 확인된 버그).
    const uniquePhaseKeys = requested.filter((k) => k !== origin.phaseId);

    // 선택 해제된 Phase의 인스턴스 삭제 + 관련 edge 정리
    const toDelete = existing.filter((e) => !uniquePhaseKeys.includes(e.phaseId));
    if (toDelete.length) {
      await this.edges.deleteByDeliverableIds(toDelete.map((e) => e._id));
      await this.model.deleteMany({ _id: { $in: toDelete.map((e) => e._id) } }).exec();
    }

    const wasEmpty = existing.length === toDelete.length; // 이번에 처음 회차가 생기는지
    const created: DeliverableDocument[] = [];
    for (const phaseId of uniquePhaseKeys) {
      if (!existingByPhase.has(phaseId)) {
        const instance = await this.model.create({
          projectId: origin.projectId,
          workflowId: origin.workflowId,
          phaseId,
          name: origin.name,
          docType: origin.docType,
          network: origin.network,
          series: origin._id,
          seriesIdx: 0, // 아래에서 회차 순서대로 재계산
          seriesTotal: uniquePhaseKeys.length,
          recvDept: origin.recvDept,
          recvContact: origin.recvContact,
          recvWorkflowId: origin.recvWorkflowId,
          sourceDept: origin.sourceDept,
          sourceWorkflowId: origin.sourceWorkflowId,
          sourceContact: origin.sourceContact,
          layout: {
            x: origin.layout.x + 40,
            y: origin.layout.y + 40,
            w: origin.layout.w,
            h: origin.layout.h,
          },
          versions: [],
          createdBy: actor.knoxId,
          isMock: origin.isMock,
        });
        created.push(instance);
      }
    }

    // 원본은 항상 1회차 - 인스턴스는 2회차부터 이어서 번호를 매긴다(원본과 번호가
    // 겹치던 실측 확인된 버그: 이전엔 원본 seriesTotal엔 원본을 포함하고 인스턴스
    // seriesTotal엔 포함하지 않아 서로 다른 값이 표시됐다).
    const remaining = await this.model.find({ series: origin._id }).sort({ createdAt: 1 }).exec();
    const total = remaining.length + 1;
    let idx = 2;
    for (const inst of remaining) {
      inst.seriesIdx = idx++;
      inst.seriesTotal = total;
      await inst.save();
    }
    origin.seriesIdx = 1;
    origin.seriesTotal = total;
    await origin.save();

    if (wasEmpty && created.length > 0) {
      const chain = [origin._id, ...remaining.map((r) => r._id)];
      await this.edges.createAutoChain(origin.workflowId, chain, origin.isMock);
    }

    return this.model.find({ $or: [{ _id: origin._id }, { series: origin._id }] }).exec();
  }
}
