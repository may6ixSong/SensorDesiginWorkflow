import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Ip, IpDocument } from './schemas/ip.schema';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../common/actor';

@Injectable()
export class IpsService {
  constructor(
    @InjectModel(Ip.name) private readonly model: Model<IpDocument>,
    private readonly audit: AuditService,
  ) {}

  /**
   * 과제 소속 IP 전체를 반환한다. 개인 접근 권한으로 필터링하지 않는다 -
   * 어떤 IP를 보여줄지는 web이 응답의 owners/viewGrants와 사용자 Group(Admin이면 super)으로
   * 판단한다 (2026-08-25 결정, src/common/guards/ip-access.guard.ts 참고).
   *
   * 정렬하지 않고 등록 순서를 유지한다 — 시드의 IP 배열 순서(PLL_MAIN, LDO_CORE, ATOP …)가
   * 곧 화면상의 IP select 순서이자 기본 선택 IP다.
   */
  async listAccessibleForProject(projectId: string, _knoxId: string) {
    return this.model.find({ projectId }).exec();
  }

  /**
   * 과제 소속 IP 전체를 가볍게(id/name/color) 반환한다 — 산출물 수신 IP(recvIpId)를
   * 지정하는 셀렉트 박스용. listAccessibleForProject와 달리 조회자의 개인 접근
   * 권한으로 필터링하지 않는다: Analog IP 담당자가 이 산출물을 넘겨줄 대상 IP를
   * 고를 때, 자신이 view 권한을 갖지 않은 다른 담당자의 IP도 후보에 있어야 한다.
   */
  async listDirectoryForProject(projectId: string) {
    const ips = await this.model.find({ projectId }).exec();
    return ips.map((ip) => ({ id: ip._id.toString(), name: ip.name, color: ip.color }));
  }

  /**
   * GET /projects 가 반환할 과제 목록 - IP를 하나라도 가진 모든 과제.
   * 개인 접근 권한으로 좁히지 않는다 (위 listAccessibleForProject와 동일한 정책).
   */
  async distinctAccessibleProjectIds(_knoxId: string) {
    const ids = await this.model.distinct('projectId', {});
    return ids as Types.ObjectId[];
  }

  async findOrThrow(ipId: string) {
    const ip = await this.model.findById(ipId).exec();
    if (!ip) throw new NotFoundException('IP not found.');
    return ip;
  }

  /**
   * Edit 권한(owners)은 반드시 Analog 부서 소속만 가능 (설계서 3.3, 4.5, 7.2).
   * api는 사용자의 소속을 조회할 수 없으므로 요청이 함께 보낸 department로 검증한다.
   */
  async addOwner(ipId: string, knoxId: string, department: string, actor: Actor) {
    if (department !== 'analog') {
      throw new BadRequestException('Only Analog department members can have Edit access.');
    }
    const ip = await this.findOrThrow(ipId);
    if (!ip.owners.includes(knoxId)) {
      ip.owners.push(knoxId);
      await ip.save();
      await this.audit.log(actor.knoxId, 'IP_OWNER_ADD', 'ip', ip._id, { knoxId });
    }
    return this.findOrThrow(ipId);
  }

  /** 대표 담당자(owners[0])는 삭제 불가 (설계서 5.2). */
  async removeOwner(ipId: string, knoxId: string, actor: Actor) {
    const ip = await this.findOrThrow(ipId);
    if (ip.owners.length > 0 && ip.owners[0] === knoxId) {
      throw new ForbiddenException('The primary owner cannot be removed.');
    }
    ip.owners = ip.owners.filter((o) => o !== knoxId);
    await ip.save();
    await this.audit.log(actor.knoxId, 'IP_OWNER_REMOVE', 'ip', ip._id, { knoxId });
    return this.findOrThrow(ipId);
  }

  async addViewGrant(ipId: string, knoxId: string, department: string, actor: Actor) {
    const ip = await this.findOrThrow(ipId);
    if (!ip.viewGrants.some((g) => g.knoxId === knoxId)) {
      ip.viewGrants.push({ knoxId, department, grantedAt: new Date() });
      await ip.save();
      await this.audit.log(actor.knoxId, 'IP_VIEW_GRANT_ADD', 'ip', ip._id, { knoxId, department });
    }
    return this.findOrThrow(ipId);
  }

  async removeViewGrant(ipId: string, knoxId: string, actor: Actor) {
    const ip = await this.findOrThrow(ipId);
    ip.viewGrants = ip.viewGrants.filter((g) => g.knoxId !== knoxId);
    await ip.save();
    await this.audit.log(actor.knoxId, 'IP_VIEW_GRANT_REMOVE', 'ip', ip._id, { knoxId });
    return this.findOrThrow(ipId);
  }
}
