import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Deliverable, DeliverableDocument } from './schemas/deliverable.schema';
import { Ip, IpDocument } from '../ips/schemas/ip.schema';
import { UserDocument } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
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
    @InjectModel(Ip.name) private readonly ipModel: Model<IpDocument>,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly edges: EdgesService,
  ) {}

  listForIp(ipId: string) {
    return this.model.find({ ipId }).sort({ phaseKey: 1, 'layout.x': 1 }).exec();
  }

  /**
   * 다른 IP가 recvIpId로 이 ipId를 지정한 산출물들 = "Incoming from other IPs".
   * 각 산출물을 준 IP(sourceIp) 문서를 함께 묶어 반환한다 (설계서에 없는 신규 기능).
   */
  async listIncomingForIp(ipId: string): Promise<{ deliverable: DeliverableDocument; sourceIp: IpDocument }[]> {
    const list = await this.model.find({ recvIpId: ipId }).sort({ phaseKey: 1, 'layout.x': 1 }).exec();
    if (!list.length) return [];

    const sourceIpIds = Array.from(new Set(list.map((d) => d.ipId.toString())));
    const sourceIps = await this.ipModel.find({ _id: { $in: sourceIpIds } }).exec();
    const ipById = new Map(sourceIps.map((ip) => [ip._id.toString(), ip]));

    const result: { deliverable: DeliverableDocument; sourceIp: IpDocument }[] = [];
    for (const deliverable of list) {
      const sourceIp = ipById.get(deliverable.ipId.toString());
      if (sourceIp) result.push({ deliverable, sourceIp });
    }
    return result;
  }

  async findOrThrow(id: string) {
    const d = await this.model.findById(id).exec();
    if (!d) throw new NotFoundException('Deliverable not found.');
    return d;
  }

  async create(ip: IpDocument, dto: CreateDeliverableDto, actor: UserDocument) {
    const d = await this.model.create({
      projectId: ip.projectId,
      ipId: ip._id,
      phaseKey: dto.phaseKey,
      name: dto.name,
      docType: dto.docType,
      network: dto.network,
      series: null,
      seriesIdx: 1,
      seriesTotal: 1,
      recvDept: null,
      recvContact: null,
      layout: { x: 0, y: 0, w: 160, h: 82 },
      versions: [],
      createdBy: actor._id,
    });
    await this.audit.log(actor._id, 'DELIVERABLE_CREATE', 'deliverable', d._id, { name: dto.name });
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

  async remove(id: string, actor: UserDocument) {
    const d = await this.findOrThrow(id);
    await this.edges.deleteByDeliverableIds([d._id]);
    await d.deleteOne();
    await this.audit.log(actor._id, 'DELIVERABLE_DELETE', 'deliverable', id, { name: d.name });
  }

  /** recvDept는 Analog 제외 5개 중 하나, recvContact는 반드시 그 부서 소속 (설계서 3.4, 4.6, BE 검증). */
  async updateRecv(id: string, dto: UpdateRecvDto, actor: UserDocument) {
    const d = await this.findOrThrow(id);

    if (dto.recvDept) {
      if (!(RECEIVABLE_DEPARTMENT_IDS as string[]).includes(dto.recvDept)) {
        throw new BadRequestException('Recipient department must be a department other than Analog.');
      }
    }

    if (dto.recvContact) {
      const contact = await this.users.findById(dto.recvContact);
      if (!dto.recvDept || contact.department !== dto.recvDept) {
        throw new BadRequestException('Recipient contact must belong to the recipient department.');
      }
    }

    if (dto.recvIpId) {
      if (dto.recvIpId === d.ipId.toString()) {
        throw new BadRequestException('A deliverable cannot list its own IP as the recipient IP.');
      }
      const targetIp = await this.ipModel.findById(dto.recvIpId).exec();
      if (!targetIp) throw new NotFoundException('Recipient IP not found.');
      if (targetIp.projectId.toString() !== d.projectId.toString()) {
        throw new BadRequestException('Recipient IP must belong to the same project.');
      }
    }

    d.recvDept = dto.recvDept ?? null;
    d.recvContact = dto.recvContact ? new Types.ObjectId(dto.recvContact) : null;
    d.recvIpId = dto.recvIpId ? new Types.ObjectId(dto.recvIpId) : null;
    await d.save();
    await this.audit.log(actor._id, 'RECV_UPDATE', 'deliverable', d._id, {
      recvDept: d.recvDept,
      recvContact: d.recvContact,
      recvIpId: d.recvIpId,
    });
    return d;
  }

  /** 업로드 = minor +1 (최초는 v0.1) (설계서 3.5). */
  async addVersion(id: string, dto: AddVersionDto, actor: UserDocument) {
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
      createdBy: actor._id,
      createdAt: new Date(),
    };
    d.versions.unshift(version as any);
    await d.save();
    await this.audit.log(actor._id, 'VERSION_UPLOAD', 'deliverable', d._id, { major, minor });
    return d;
  }

  /** Release = major +1 · minor 0, 최신 업로드분을 그대로 릴리스로 승격 (설계서 3.5, 5.4). */
  async release(id: string, dto: ReleaseDto, actor: UserDocument) {
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
      createdBy: actor._id,
      createdAt: new Date(),
    };
    d.versions.unshift(version as any);
    await d.save();
    await this.audit.log(actor._id, 'RELEASE', 'deliverable', d._id, { major });
    return d;
  }

  /**
   * Release 일정(series) 갱신 (설계서 3.6). 선택된 phaseKeys에 맞춰 인스턴스를
   * 생성/삭제하고, 최초 생성 시에만 회차 순서대로 auto edge를 연결한다.
   */
  async updateSchedule(originId: string, phaseKeys: string[], actor: UserDocument) {
    const origin = await this.findOrThrow(originId);
    if (origin.series) {
      throw new BadRequestException('The release schedule can only be set on the original deliverable, not a series instance.');
    }

    const existing = await this.model.find({ series: origin._id }).sort({ seriesIdx: 1 }).exec();
    const existingByPhase = new Map(existing.map((e) => [e.phaseKey, e]));
    // 원본(origin) 자신이 이미 자신의 phaseKey를 차지하고 있으므로, 그 Phase는
    // series 인스턴스로 다시 만들면 안 된다 - 그렇지 않으면 원본과 같은 Phase에
    // 중복 인스턴스가 생긴다(실측 확인된 버그).
    const uniquePhaseKeys = Array.from(new Set(phaseKeys)).filter((k) => k !== origin.phaseKey);

    // 선택 해제된 Phase의 인스턴스 삭제 + 관련 edge 정리
    const toDelete = existing.filter((e) => !uniquePhaseKeys.includes(e.phaseKey));
    if (toDelete.length) {
      await this.edges.deleteByDeliverableIds(toDelete.map((e) => e._id));
      await this.model.deleteMany({ _id: { $in: toDelete.map((e) => e._id) } }).exec();
    }

    const wasEmpty = existing.length === toDelete.length; // 이번에 처음 회차가 생기는지
    const created: DeliverableDocument[] = [];
    for (const phaseKey of uniquePhaseKeys) {
      if (!existingByPhase.has(phaseKey)) {
        const instance = await this.model.create({
          projectId: origin.projectId,
          ipId: origin.ipId,
          phaseKey,
          name: origin.name,
          docType: origin.docType,
          network: origin.network,
          series: origin._id,
          seriesIdx: 0, // 아래에서 회차 순서대로 재계산
          seriesTotal: uniquePhaseKeys.length,
          recvDept: origin.recvDept,
          recvContact: origin.recvContact,
          recvIpId: origin.recvIpId,
          layout: {
            x: origin.layout.x + 40,
            y: origin.layout.y + 40,
            w: origin.layout.w,
            h: origin.layout.h,
          },
          versions: [],
          createdBy: actor._id,
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
      await this.edges.createAutoChain(origin.ipId, chain);
    }

    return this.model.find({ $or: [{ _id: origin._id }, { series: origin._id }] }).exec();
  }
}
