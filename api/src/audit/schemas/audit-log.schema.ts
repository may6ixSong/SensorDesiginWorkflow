import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
// @Prop의 런타임 type은 반드시 SchemaTypes.ObjectId를 쓴다 - Types.ObjectId(값 클래스)를 주면
// Mongoose가 Mixed 경로를 만들고, Mixed는 캐스팅을 하지 않아 문자열 id 필터가 전부 0건이 된다.
// (필드의 TypeScript 타입으로서의 Types.ObjectId는 그대로 쓴다.)

export const AUDIT_ACTIONS = [
  'DELIVERABLE_CREATE',
  'DELIVERABLE_DELETE',
  'VERSION_UPLOAD',
  'RELEASE',
  'WORKFLOW_CREATE',
  'WORKFLOW_UPDATE',
  'WORKFLOW_PHASES_UPDATE',
  'WORKFLOW_OWNER_ADD',
  'WORKFLOW_OWNER_REMOVE',
  'WORKFLOW_VIEW_GRANT_ADD',
  'WORKFLOW_VIEW_GRANT_REMOVE',
  'RECV_UPDATE',
  'LAYOUT_UPDATE',
  'EDGE_ADD',
  'EDGE_DELETE',
  'HLD_RELEASE',
  'FILE_DOWNLOAD',
  'PROJECT_MEMBER_ADD',
  'PROJECT_MEMBER_REMOVE',
  'PROJECT_UPDATE',
  'PROJECT_MILESTONES_UPDATE',
  'PROJECT_WORKFLOW_DOMAINS_UPDATE',
  'WORKFLOW_DOMAIN_SET',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: false })
export class AuditLog {
  /** 행위자의 KnoxID (api에는 users 컬렉션이 없다 - src/common/actor.ts). */
  @Prop({ required: true, trim: true, index: true })
  actorKnoxId: string;

  @Prop({ type: String, required: true, enum: AUDIT_ACTIONS })
  action: AuditAction;

  @Prop({ required: true })
  targetType: string;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  targetId: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  meta: Record<string, unknown>;

  @Prop({ default: () => new Date() })
  at: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
