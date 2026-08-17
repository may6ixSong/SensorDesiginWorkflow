import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Ip, IpDocument } from './schemas/ip.schema';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class IpsService {
  constructor(
    @InjectModel(Ip.name) private readonly model: Model<IpDocument>,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 접근 가능한(edit 또는 view) IP만 반환 (설계서 5.1).
   * 정렬하지 않고 등록 순서를 유지한다 — 목업의 IPS 배열 순서(PLL_MAIN, LDO_CORE, ADC_RAMP)가
   * 곧 화면상의 IP select 순서이자 기본 선택 IP다.
   */
  async listAccessibleForProject(projectId: string, userId: string) {
    return this.model
      .find({
        projectId,
        $or: [{ owners: userId }, { 'viewGrants.userId': userId }],
      })
      .exec();
  }

  /** GET /projects 에서 "접근 가능한 과제"를 판정하기 위해 사용 (설계서 5.1). */
  async distinctAccessibleProjectIds(userId: string) {
    const ids = await this.model.distinct('projectId', {
      $or: [{ owners: userId }, { 'viewGrants.userId': userId }],
    });
    return ids as Types.ObjectId[];
  }

  /** 과제 상세(Project Info) 조회 권한 — 그 과제의 IP 중 하나라도 edit/view 권한이 있으면 된다. */
  async hasAnyAccessToProject(projectId: string, userId: string) {
    const count = await this.model.countDocuments({
      projectId,
      $or: [{ owners: userId }, { 'viewGrants.userId': userId }],
    });
    return count > 0;
  }

  /** 과제 팀원 명단 관리 권한 — 그 과제의 IP 중 하나라도 Edit(owner) 권한이 있어야 한다. */
  async hasEditAccessToProject(projectId: string, userId: string) {
    const count = await this.model.countDocuments({ projectId, owners: userId });
    return count > 0;
  }

  async findPopulatedOrThrow(ipId: string) {
    const ip = await this.model
      .findById(ipId)
      .populate('owners')
      .populate('viewGrants.userId')
      .exec();
    if (!ip) throw new NotFoundException('IP not found.');
    return ip;
  }

  async findRawOrThrow(ipId: string) {
    const ip = await this.model.findById(ipId).exec();
    if (!ip) throw new NotFoundException('IP not found.');
    return ip;
  }

  /** Edit 권한(owners)은 반드시 Analog 부서 소속만 가능 (설계서 3.3, 4.5, 7.2). */
  async addOwner(ipId: string, userId: string, actor: UserDocument) {
    const user = await this.users.findById(userId);
    if (user.department !== 'analog') {
      throw new BadRequestException('Only Analog department members can have Edit access.');
    }
    const ip = await this.findRawOrThrow(ipId);
    if (!ip.owners.some((o) => o.toString() === userId)) {
      ip.owners.push(new Types.ObjectId(userId));
      await ip.save();
      await this.audit.log(actor._id, 'IP_OWNER_ADD', 'ip', ip._id, { userId });
    }
    return this.findPopulatedOrThrow(ipId);
  }

  /** 대표 담당자(owners[0])는 삭제 불가 (설계서 5.2). */
  async removeOwner(ipId: string, userId: string, actor: UserDocument) {
    const ip = await this.findRawOrThrow(ipId);
    if (ip.owners.length > 0 && ip.owners[0].toString() === userId) {
      throw new ForbiddenException('The primary owner cannot be removed.');
    }
    ip.owners = ip.owners.filter((o) => o.toString() !== userId);
    await ip.save();
    await this.audit.log(actor._id, 'IP_OWNER_REMOVE', 'ip', ip._id, { userId });
    return this.findPopulatedOrThrow(ipId);
  }

  async addViewGrant(ipId: string, userId: string, department: string, actor: UserDocument) {
    await this.users.findById(userId); // 존재 검증
    const ip = await this.findRawOrThrow(ipId);
    if (!ip.viewGrants.some((g) => g.userId.toString() === userId)) {
      ip.viewGrants.push({ userId: new Types.ObjectId(userId), department, grantedAt: new Date() });
      await ip.save();
      await this.audit.log(actor._id, 'IP_VIEW_GRANT_ADD', 'ip', ip._id, { userId, department });
    }
    return this.findPopulatedOrThrow(ipId);
  }

  async removeViewGrant(ipId: string, userId: string, actor: UserDocument) {
    const ip = await this.findRawOrThrow(ipId);
    ip.viewGrants = ip.viewGrants.filter((g) => g.userId.toString() !== userId);
    await ip.save();
    await this.audit.log(actor._id, 'IP_VIEW_GRANT_REMOVE', 'ip', ip._id, { userId });
    return this.findPopulatedOrThrow(ipId);
  }
}
