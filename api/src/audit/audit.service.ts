import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditAction, AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditLog.name) private readonly model: Model<AuditLogDocument>) {}

  /** actor는 X-Knox-Id 헤더에서 온 KnoxID다 (api에는 users 컬렉션이 없다). */
  log(
    actorKnoxId: string,
    action: AuditAction,
    targetType: string,
    targetId: Types.ObjectId | string,
    meta: Record<string, unknown> = {},
  ) {
    return this.model.create({ actorKnoxId, action, targetType, targetId, meta, at: new Date() });
  }
}
