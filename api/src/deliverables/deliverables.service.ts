import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Deliverable, DeliverableDocument } from './schemas/deliverable.schema';
import { IpDocument } from '../ips/schemas/ip.schema';
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
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly edges: EdgesService,
  ) {}

  listForIp(ipId: string) {
    return this.model.find({ ipId }).sort({ phaseKey: 1, 'layout.x': 1 }).exec();
  }

  async findOrThrow(id: string) {
    const d = await this.model.findById(id).exec();
    if (!d) throw new NotFoundException('산출물을 찾을 수 없습니다.');
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
        throw new BadRequestException('전달 부서는 Analog를 제외한 부서 중에서 선택해야 합니다.');
      }
    }

    if (dto.recvContact) {
      const contact = await this.users.findById(dto.recvContact);
      if (!dto.recvDept || contact.department !== dto.recvDept) {
        throw new BadRequestException('전달 담당자는 전달 부서 소속이어야 합니다.');
      }
    }

    d.recvDept = dto.recvDept ?? null;
    d.recvContact = dto.recvContact ? new Types.ObjectId(dto.recvContact) : null;
    await d.save();
    await this.audit.log(actor._id, 'RECV_UPDATE', 'deliverable', d._id, {
      recvDept: d.recvDept,
      recvContact: d.recvContact,
    });
    return d;
  }

  /** 업로드 = minor +1 (최초는 v0.1) (설계서 3.5). */
  async addVersion(id: string, dto: AddVersionDto, actor: UserDocument) {
    const d = await this.findOrThrow(id);
    if (d.network === 'OA' && !dto.storageKey) {
      throw new BadRequestException('OA 망 산출물은 storageKey가 필요합니다.');
    }
    if (d.network === 'HPC' && !dto.hpcPath) {
      throw new BadRequestException('HPC 망 산출물은 hpcPath가 필요합니다.');
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
      throw new BadRequestException('릴리스할 업로드된 버전이 없습니다.');
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
      throw new BadRequestException('회차 인스턴스가 아닌 원본 산출물에서만 일정을 설정할 수 있습니다.');
    }

    const existing = await this.model.find({ series: origin._id }).sort({ seriesIdx: 1 }).exec();
    const existingByPhase = new Map(existing.map((e) => [e.phaseKey, e]));
    const uniquePhaseKeys = Array.from(new Set(phaseKeys));

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

    const remaining = await this.model.find({ series: origin._id }).sort({ createdAt: 1 }).exec();
    let idx = 1;
    for (const inst of remaining) {
      inst.seriesIdx = idx++;
      inst.seriesTotal = remaining.length;
      await inst.save();
    }
    origin.seriesTotal = remaining.length + 1; // origin 자신 포함
    await origin.save();

    if (wasEmpty && created.length > 0) {
      const chain = [origin._id, ...remaining.map((r) => r._id)];
      await this.edges.createAutoChain(origin.ipId, chain);
    }

    return this.model.find({ $or: [{ _id: origin._id }, { series: origin._id }] }).exec();
  }
}
