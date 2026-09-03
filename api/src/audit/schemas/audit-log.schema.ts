import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
// @Prop의 런타임 type은 반드시 SchemaTypes.ObjectId를 쓴다 - Types.ObjectId(값 클래스)를 주면
// Mongoose가 Mixed 경로를 만들고, Mixed는 캐스팅을 하지 않아 문자열 id 필터가 전부 0건이 된다.
// (필드의 TypeScript 타입으로서의 Types.ObjectId는 그대로 쓴다.)

/**
 * 버전과 접근 권한에 관한 것만 남긴다 (Hub 설계서 §12).
 *
 * 워크플로우는 대시보드다 - 노드 하나 만들고 flow 하나 잇는 것까지 감사 로그를 남기지
 * 않는다. 그래서 DELIVERABLE_CREATE / LAYOUT_UPDATE / EDGE_ADD / EDGE_DELETE /
 * WORKFLOW_CREATE / WORKFLOW_UPDATE / WORKFLOW_PHASES_UPDATE /
 * WORKFLOW_VIEW_GRANT_* / RECV_UPDATE / PROJECT_UPDATE / PROJECT_MILESTONES_UPDATE /
 * PROJECT_DEPARTMENTS_UPDATE / WORKFLOW_DOMAIN_SET / PROJECT_MEMBER_DEPARTMENT_ADD가 빠졌다.
 *
 * VERSION_UPLOAD와 FILE_DOWNLOAD는 정책적으로 뺀 게 아니라 **구조상 사라졌다** -
 * 업로드와 다운로드가 모두 각 산출물 서비스에서 일어나므로 SIREN이 관측할 사건이 아니다.
 *
 * 이미 저장된 옛 action 값(예: LAYOUT_UPDATE)은 그대로 남는다 - Mongoose enum 제약은
 * 저장 시점에만 걸리고 기존 문서를 다시 검증하지 않으므로 마이그레이션이 필요 없다.
 */
export const AUDIT_ACTIONS = [
  // 버전 · 릴리스
  'RELEASE',
  'HLD_RELEASE',
  /** C/D 티어 수동 버전 입력·수정. 가드레일의 전제다 (§9.2). */
  'MANUAL_VERSION_ASSERT',
  /** 산출물이 Hub 서비스에 처음 묶인 시점 - 티어 전환의 표시 (§5.3). */
  'ARTIFACT_SERVICE_LINKED',

  // 접근 권한 · 데이터 소실
  'DELIVERABLE_DELETE',
  'WORKFLOW_OWNER_ADD',
  'WORKFLOW_OWNER_REMOVE',
  'PROJECT_MANAGER_ADD',
  'PROJECT_MANAGER_REMOVE',
  'PROJECT_MEMBER_ADD',
  'PROJECT_MEMBER_REMOVE',

  // Admin
  /** 사용자 시뮬레이션 시작. 실제 행위자와 대상을 구분해 남긴다 (§13.3 규칙 4). */
  'IMPERSONATION_START',
  'ARTIFACT_SERVICE_REGISTER',
  'ARTIFACT_SERVICE_UPDATE',
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
