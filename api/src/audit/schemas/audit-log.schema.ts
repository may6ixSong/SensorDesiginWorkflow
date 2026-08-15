import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const AUDIT_ACTIONS = [
  'DELIVERABLE_CREATE',
  'DELIVERABLE_DELETE',
  'VERSION_UPLOAD',
  'RELEASE',
  'IP_OWNER_ADD',
  'IP_OWNER_REMOVE',
  'IP_VIEW_GRANT_ADD',
  'IP_VIEW_GRANT_REMOVE',
  'RECV_UPDATE',
  'LAYOUT_UPDATE',
  'EDGE_ADD',
  'EDGE_DELETE',
  'HLD_RELEASE',
  'FILE_DOWNLOAD',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: false })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: AUDIT_ACTIONS })
  action: AuditAction;

  @Prop({ required: true })
  targetType: string;

  @Prop({ type: Types.ObjectId, required: true })
  targetId: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  meta: Record<string, unknown>;

  @Prop({ default: () => new Date() })
  at: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
