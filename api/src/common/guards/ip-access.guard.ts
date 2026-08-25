import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ip, IpDocument } from '../../ips/schemas/ip.schema';
import { Deliverable, DeliverableDocument } from '../../deliverables/schemas/deliverable.schema';
import { IP_ACCESS_KEY, IpAccessLevel } from '../decorators/ip-access.decorator';
import { resolveActor } from '../actor';

/**
 * ★ 접근 차단을 하지 않는다 - IP 문서를 찾아 req.ip_에 캐시하는 역할만 한다.
 *
 * 정책(2026-08-25 결정): api는 요청이 오면 어떤 IP든 그대로 내려주고, 화면에서 무엇을
 * 보여주고 무엇을 편집 가능하게 할지는 web이 결정한다 - web은 ADSSO 사용자의 Group
 * (Admin이면 super 권한)과 응답에 담긴 owners/viewGrants로 판단한다. 그래서 여기서
 * ForbiddenException을 던지면 Admin이 자기 소유가 아닌 IP를 열 수 없게 되므로 던지지 않는다.
 *
 * 단, 응답 마스킹은 그대로 유지된다 - owner가 아니면 작업중(minor) 버전과 메모는
 * 애초에 응답에 담기지 않는다 (설계서 6.1, deliverable.dto.ts / memos.controller.ts).
 * 즉 "무엇을 받을 수 있는지"는 여전히 서버가 정하고, "무엇을 할 수 있는지"만 web에 맡긴다.
 *
 * @IpAccess('view'|'edit') 데코레이터는 의도를 문서화하고, 추후 토큰 인증이 들어올 때
 * 이 가드 한 곳만 고쳐 재차단을 되살릴 수 있도록 그대로 남겨둔다.
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
    resolveActor(req); // X-Knox-Id 헤더 자체는 필수 - 없으면 401
    const ip = await this.resolveIp(req);
    if (!ip) throw new NotFoundException('IP not found.');

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
      if (!deliverable) throw new NotFoundException('Deliverable not found.');
      return this.ipModel.findById(deliverable.ipId).exec();
    }
    return null;
  }
}
