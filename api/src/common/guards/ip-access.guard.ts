import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ip, IpDocument } from '../../ips/schemas/ip.schema';
import { Deliverable, DeliverableDocument } from '../../deliverables/schemas/deliverable.schema';
import { IP_ACCESS_KEY, IpAccessLevel } from '../decorators/ip-access.decorator';
import { UserDocument } from '../../users/schemas/user.schema';

/**
 * 권한 재검증 (설계서 6.2) - FE의 canEdit()/hasAccess()는 UX 게이트일 뿐이며,
 * 모든 쓰기 API와 민감 필드 응답은 여기서 다시 검증한다. 이 원칙은 타협하지 않는다.
 *
 * ipId 파라미터가 있는 라우트는 그대로 IP를 조회하고,
 * deliverableId(id) 파라미터만 있는 라우트는 deliverable.ipId로 역추적한다.
 */
@Injectable()
export class IpAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(Ip.name) private readonly ipModel: Model<IpDocument>,
    @InjectModel(Deliverable.name) private readonly deliverableModel: Model<DeliverableDocument>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const level = this.reflector.get<IpAccessLevel>(IP_ACCESS_KEY, ctx.getHandler());
    if (!level) return true;

    const req = ctx.switchToHttp().getRequest();
    const me: UserDocument = req.user;
    const ip = await this.resolveIp(req);
    if (!ip) throw new NotFoundException('IP를 찾을 수 없습니다.');

    const meId = me._id.toString();
    const isOwner = ip.owners.some((o) => o.toString() === meId);
    const hasAccess =
      level === 'edit' ? isOwner : isOwner || ip.viewGrants.some((g) => g.userId.toString() === meId);

    if (!hasAccess) {
      throw new ForbiddenException(
        level === 'edit' ? 'Edit 권한(Analog 담당자)만 가능합니다.' : '이 IP에 대한 접근 권한이 없습니다.',
      );
    }

    req.ip_ = ip; // 컨트롤러/서비스가 재조회하지 않도록 캐시
    return true;
  }

  private async resolveIp(req: any): Promise<IpDocument | null> {
    const params = req.params ?? {};
    if (params.ipId) {
      return this.ipModel.findById(params.ipId).exec();
    }
    if (params.id) {
      const deliverable = await this.deliverableModel.findById(params.id).exec();
      if (!deliverable) throw new NotFoundException('산출물을 찾을 수 없습니다.');
      return this.ipModel.findById(deliverable.ipId).exec();
    }
    return null;
  }
}
