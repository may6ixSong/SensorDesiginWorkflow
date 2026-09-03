import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Deliverable, DeliverableDocument } from './schemas/deliverable.schema';
import { Workflow, WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { Actor } from '../common/actor';
import { sortSchedule } from '../common/schedule';
import { AuditService } from '../audit/audit.service';
import { EdgesService } from '../edges/edges.service';
import { RECEIVABLE_DEPARTMENT_IDS } from '../common/constants/departments';
import {
  AssertVersionDto,
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

  async create(workflow: WorkflowDocument, dto: CreateDeliverableDto, actor: Actor) {
    const d = await this.model.create({
      projectId: workflow.projectId,
      workflowId: workflow._id,
      phaseId: dto.phaseId,
      name: dto.name,
      // 출처는 나중에 지정해도 된다 - serviceKey가 null인 "정상 빈 상태"로 시작한다 (Hub 설계서 §11).
      serviceKey: dto.serviceKey?.trim() || null,
      externalArtifactId: dto.externalArtifactId?.trim() || null,
      network: dto.network ?? 'OA',
      series: null,
      seriesIdx: 1,
      seriesTotal: 1,
      recvDept: null,
      recvContact: null,
      sourceContact: null,
      intent: dto.intent === 'received' ? 'received' : 'own',
      layout: { x: 0, y: 0, w: 160, h: 82 },
      versions: [],
      createdBy: actor.knoxId,
      // 목업 workflow 아래 산출물은 목업으로 남긴다 - 플래그를 끌 때 workflow와 함께 정리된다.
      isMock: workflow.isMock,
    });
    if (d.serviceKey) {
      await this.audit.log(actor.knoxId, 'ARTIFACT_SERVICE_LINKED', 'deliverable', d._id, {
        serviceKey: d.serviceKey,
        externalArtifactId: d.externalArtifactId,
      });
    }
    return d;
  }

  /**
   * 이름·망 변경, 그리고 Hub 서비스 매핑.
   *
   * 매핑(serviceKey + externalArtifactId)은 생성 시점이 아니라 **언제든 나중에** 걸 수 있다
   * (Hub 설계서 §11). 그 전환 시점이 ARTIFACT_SERVICE_LINKED로 남아서, 나중에 이력을 보면
   * "여기서부터 실연동이 시작됐다"를 알 수 있다(§5.3).
   */
  async update(id: string, dto: UpdateDeliverableDto, actor: Actor) {
    const d = await this.findOrThrow(id);
    if (dto.name !== undefined) d.name = dto.name;
    if (dto.network !== undefined) d.network = dto.network;

    const linking =
      (dto.serviceKey !== undefined && (dto.serviceKey?.trim() || null) !== d.serviceKey) ||
      (dto.externalArtifactId !== undefined &&
        (dto.externalArtifactId?.trim() || null) !== d.externalArtifactId);

    if (dto.serviceKey !== undefined) d.serviceKey = dto.serviceKey?.trim() || null;
    if (dto.externalArtifactId !== undefined) {
      d.externalArtifactId = dto.externalArtifactId?.trim() || null;
    }

    await d.save();
    if (linking && d.serviceKey) {
      await this.audit.log(actor.knoxId, 'ARTIFACT_SERVICE_LINKED', 'deliverable', d._id, {
        serviceKey: d.serviceKey,
        externalArtifactId: d.externalArtifactId,
      });
    }
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
   *
   * recvWorkflowId·sourceDept·sourceContact는 더 이상 이 메서드로 고치지 않는다(사용자
   * 요청 — 전달 탭은 전달 받을 부서만 남긴다). UpdateRecvDto에서 이미 걷어냈으므로 여기서는
   * 아예 손대지 않고 기존 저장값을 그대로 둔다 — 이미 연결돼 있던 "Incoming from other
   * workflows"·"받는 곳" 표시는 이 산출물을 다시 저장해도 끊어지지 않는다.
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

    d.recvDept = dto.recvDept ?? null;
    d.recvContact = dto.recvContact ?? null;
    await d.save();
    return d;
  }

  /**
   * 연동된 서비스가 소유한 산출물인지. 이런 산출물의 버전은 그 서비스가 올리고 SIREN은
   * 관측만 하므로(Hub 설계서 §1.2), SIREN에서 직접 버전을 쓰는 것을 막는다.
   */
  private assertManualArtifact(d: DeliverableDocument): void {
    if (d.serviceKey) {
      throw new BadRequestException(
        `This artifact is owned by "${d.serviceKey}" — record versions there, not in SIREN.`,
      );
    }
  }

  /**
   * C/D 티어 수동 버전 기록 (Hub 설계서 §9).
   *
   * A/B 티어는 그 서비스가 버전을 갖고 SIREN은 관측만 하므로 이 경로를 타지 않는다.
   * 여기 남는 기록은 "검증된 사실"이 아니라 **담당자의 주장**이라, 누가 언제 무엇을
   * 주장했는지를 append-only로 남기고(§9.2) MANUAL_VERSION_ASSERT로 감사 로그를 찍는다.
   *
   * 덮어쓰기가 없다 - 정정도 새 엔트리로 쌓인다. 실제 산출물의 진짜 이력은 검증하지
   * 못해도, 주장의 이력만큼은 추적 가능해야 하기 때문이다.
   */
  async assertVersion(id: string, dto: AssertVersionDto, actor: Actor) {
    const d = await this.findOrThrow(id);
    this.assertManualArtifact(d);
    if (d.intent === 'received') {
      throw new BadRequestException(
        'This artifact is a placeholder for something you are waiting to receive — it cannot be recorded here directly.',
      );
    }

    const label = dto.versionLabel?.trim();
    const path = dto.hpcPath?.trim() || null;
    if (!label && !path) {
      throw new BadRequestException('A version label (or an HPC path to stand in for one) is required.');
    }

    const now = new Date();
    // 버전 개념이 없는 HPC 경로형 산출물은 path@registeredAt을 버전 대체값으로 쓴다 (§5.2.1).
    const resolvedLabel = label || (path as string);
    const versionRef = !label && path ? `${path}@${now.toISOString()}` : null;

    d.versions.unshift({
      tier: dto.tier ?? 'C',
      versionLabel: resolvedLabel,
      isReleased: dto.isReleased === true,
      versionRef,
      giverKnoxId: actor.knoxId,
      giverDept: dto.giverDept ?? null,
      sourceRefs: [],
      viewUrl: dto.viewUrl?.trim() || null,
      hpcPath: path,
      note: dto.note ?? '',
      assertedBy: actor.realKnoxId,
      assertedAt: now,
      observedAt: null,
      createdAt: now,
    } as any);
    await d.save();

    await this.audit.log(actor.realKnoxId, 'MANUAL_VERSION_ASSERT', 'deliverable', d._id, {
      versionLabel: resolvedLabel,
      isReleased: dto.isReleased === true,
      tier: dto.tier ?? 'C',
      actingAs: actor.isImpersonating ? actor.knoxId : undefined,
    });
    return d;
  }

  /**
   * 산출물 단위 Release - 가장 최근 기록을 릴리스로 승격한다.
   *
   * 연동된 서비스(A/B)는 릴리스도 그쪽에서 일어나므로 여기로 오지 않는다. 수동 기록
   * (C/D)만 이 경로를 탄다. 새 엔트리를 쌓아 올리는 append-only 규칙은 여기서도 같다 -
   * 기존 엔트리의 isReleased를 뒤집지 않는다.
   */
  async release(id: string, dto: ReleaseDto, actor: Actor) {
    const d = await this.findOrThrow(id);
    this.assertManualArtifact(d);
    const latest = d.versions[0];
    if (!latest) {
      throw new BadRequestException('There is no recorded version to release.');
    }
    if (latest.isReleased) {
      throw new BadRequestException('The latest version is already released.');
    }

    const now = new Date();
    d.versions.unshift({
      tier: latest.tier,
      versionLabel: latest.versionLabel,
      isReleased: true,
      versionRef: latest.versionRef,
      giverKnoxId: latest.giverKnoxId ?? actor.knoxId,
      giverDept: latest.giverDept,
      sourceRefs: latest.sourceRefs ?? [],
      viewUrl: latest.viewUrl,
      hpcPath: latest.hpcPath,
      note: dto.note ?? '',
      assertedBy: actor.realKnoxId,
      assertedAt: now,
      observedAt: null,
      createdAt: now,
    } as any);
    await d.save();

    await this.audit.log(actor.realKnoxId, 'RELEASE', 'deliverable', d._id, {
      versionLabel: latest.versionLabel,
      actingAs: actor.isImpersonating ? actor.knoxId : undefined,
    });
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
          serviceKey: origin.serviceKey,
          externalArtifactId: origin.externalArtifactId,
          network: origin.network,
          series: origin._id,
          seriesIdx: 0, // 아래에서 회차 순서대로 재계산
          seriesTotal: uniquePhaseKeys.length,
          recvDept: origin.recvDept,
          recvContact: origin.recvContact,
          recvWorkflowId: origin.recvWorkflowId,
          sourceDept: origin.sourceDept,
          sourceContact: origin.sourceContact,
          intent: origin.intent,
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
