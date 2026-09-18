import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Actor } from '../common/actor';
import { AuditAction, AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditLog.name) private readonly model: Model<AuditLogDocument>) {}

  /**
   * actor는 X-Knox-Id 헤더에서 온 KnoxID다 (api에는 users 컬렉션이 없다).
   *
   * ★ `Actor`를 통째로 넘기면 **실제 호출자(realKnoxId)**가 행위자로 남는다 — 사용자
   *   시뮬레이터로 다른 사람 신원을 쓰고 있어도 그 쓰기를 실제로 실행한 사람은 Admin
   *   본인이기 때문이다(common/actor.ts의 약속). 시뮬레이션 중이었다는 사실과 그때의
   *   유효 신원은 `meta.actingAs`에 함께 남겨 나중에 되짚을 수 있게 한다.
   *   예전엔 호출부마다 `actor.knoxId`를 직접 넘겨서, 시뮬레이션 중의 쓰기가 대상
   *   사용자가 한 일처럼 기록되고 진짜 행위자는 어디에도 남지 않았다.
   * ★ 문자열 오버로드는 Actor가 없는 자리(배치/이벤트 수신 등)를 위해 남겨 둔다.
   */
  log(
    actor: Actor | string,
    action: AuditAction,
    targetType: string,
    targetId: Types.ObjectId | string,
    meta: Record<string, unknown> = {},
  ) {
    const actorKnoxId = typeof actor === 'string' ? actor : actor.realKnoxId;
    const fullMeta =
      typeof actor !== 'string' && actor.isImpersonating
        ? { ...meta, actingAs: actor.knoxId }
        : meta;
    return this.model.create({ actorKnoxId, action, targetType, targetId, meta: fullMeta, at: new Date() });
  }
}
