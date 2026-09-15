import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ArtifactService, ArtifactServiceDocument } from '../schemas/artifact-service.schema';

export interface HubEventSender {
  serviceKey: string;
  tier: 'A' | 'B' | 'C';
  /** artifactTypeKey 검증 대상 — Calypso는 Service Manage 등록이 없어 항상 빈 배열이다. */
  artifactTypeKeys: string[];
}

/**
 * Version 이벤트 수신 전용 인증(설계서 07장 §3.4, §4.2) — `Authorization: Bearer <token>`
 * 하나로만 검증한다. 주소(요청 source) 매칭 같은 추가 장치는 두지 않기로 했다 — HPC
 * Service도 VM이라 어느 네트워크에서 온 요청인지 SIREN이 구분할 수 없고, 그 외 방안
 * (1회 노출, rate limit, audit log 등)도 지금 UX상 도입하지 않기로 했다. 토큰 자체가
 * 유일한 인증 수단이다.
 *
 * ★ File Artifacts(B, Calypso)도 다른 서비스와 같은 DB 조회 한 경로로 검증한다 — Service
 *   Manage 등록 UI에는 안 나오지만, `isBuiltIn:true` ArtifactService 문서(및 token)는
 *   있다(database/seed-data.ts). 그래서 이 가드에 Calypso 전용 분기가 없다.
 *
 * 통과하면 `HubEventSender`를 `req.hubEventSender_`에 캐시해 컨트롤러가 재조회하지 않게 한다.
 */
@Injectable()
export class HubTokenGuard implements CanActivate {
  constructor(
    @InjectModel(ArtifactService.name) private readonly model: Model<ArtifactServiceDocument>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
    if (!token) throw new UnauthorizedException('Missing Bearer token.');

    // enabled:false면 token이 이미 null로 폐기돼 있으므로 이 조회가 자연히 거절한다(§3.4).
    const svc = await this.model.findOne({ token }).exec();
    if (!svc) throw new UnauthorizedException('Unknown or revoked token.');

    req.hubEventSender_ = {
      serviceKey: svc.key,
      tier: svc.defaultTier as 'A' | 'B' | 'C',
      artifactTypeKeys: (svc.artifactTypes ?? []).map((t) => t.key),
    } as HubEventSender;
    return true;
  }
}
