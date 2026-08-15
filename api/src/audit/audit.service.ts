import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditAction, AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditLog.name) private readonly model: Model<AuditLogDocument>) {}

  log(
    actorId: Types.ObjectId | string,
    action: AuditAction,
    targetType: string,
    targetId: Types.ObjectId | string,
    meta: Record<string, unknown> = {},
  ) {
    return this.model.create({ actorId, action, targetType, targetId, meta, at: new Date() });
  }
}
