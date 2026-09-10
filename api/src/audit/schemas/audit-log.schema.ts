import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
// @Prop의 런타임 type은 반드시 SchemaTypes.ObjectId를 쓴다 - Types.ObjectId(값 클래스)를 주면
// Mongoose가 Mixed 경로를 만들고, Mixed는 캐스팅을 하지 않아 문자열 id 필터가 전부 0건이 된다.
// (필드의 TypeScript 타입으로서의 Types.ObjectId는 그대로 쓴다.)

/**
 * 버전과 접근 권한에 관한 것만 남긴다.
 *
 * 워크플로우는 대시보드다 — 노드 하나 만들고 flow 하나 잇는 것까지 전부 남기지는 않는다.
 * 대신 **권한이 바뀌는 순간과 데이터가 사라지는 순간**은 빠짐없이 남긴다: 권한 다툼이
 * 생겼을 때 되짚을 수 있어야 하고, release는 되돌릴 수 없기 때문이다.
 *
 * VERSION_UPLOAD와 FILE_DOWNLOAD는 정책적으로 뺀 게 아니라 **구조상 사라졌다** —
 * 업로드와 다운로드가 모두 각 산출물 서비스에서 일어나므로 SIREN이 관측할 사건이 아니다.
 *
 * 이미 저장된 옛 action 값(예: HLD_RELEASE, DELIVERABLE_DELETE)은 그대로 남는다 —
 * Mongoose enum 제약은 저장 시점에만 걸리고 기존 문서를 다시 검증하지 않으므로
 * 마이그레이션이 필요 없다. 그래서 옛 값도 목록에 남겨 둔다.
 */
export const AUDIT_ACTIONS = [
  // --- Release (workflow → 부서 전달). 철회가 불가능하므로 반드시 남긴다 ---
  'RELEASE_CREATE',

  // --- Publish (산출물의 버전 확정) ---
  /** C/D 티어 수동 버전 입력. 가드레일의 전제다. */
  'ARTIFACT_VERSION_ASSERT',
  /** 산출물이 Hub 서비스에 처음 묶인 시점 — 티어 전환의 표시. */
  'ARTIFACT_SERVICE_LINKED',
  'PROJECT_SERVICE_LINK_CREATE',
  'PROJECT_SERVICE_LINK_DELETE',

  // --- 권한 변경 ---
  'WORKFLOW_ACCESS_REPLACE',
  /** 부서 변경은 editAccess 교체를 동반하므로 사실상 권한 이양이다. */
  'WORKFLOW_DEPARTMENT_CHANGE',
  'ARTIFACT_ACCESS_REPLACE',
  /** A Tier의 recipient — 알림 대상이자 slide 열람 게이트라 권한 변경으로 취급한다. */
  'BLOCK_RECIPIENTS_REPLACE',
  /**
   * 블록이 가리키는 artifact가 바뀌었다. 단순 이름 변경이 아니라 **무엇이 누구에게
   * 전달되는지가 통째로 달라지는** 사건이라(B/C/D는 recipient가 artifact에서 나온다)
   * 권한 변경과 같은 무게로 남긴다.
   */
  'BLOCK_ARTIFACT_REMAP',
  'PROJECT_MANAGER_ADD',
  'PROJECT_MANAGER_REMOVE',
  'PROJECT_MEMBER_ADD',
  'PROJECT_MEMBER_REMOVE',

  // --- 생성 · 소실 ---
  'PROJECT_CREATE',
  'WORKFLOW_CREATE',
  'ARTIFACT_CREATE',
  'BLOCK_CREATE',
  'BLOCK_DELETE',
  'CANVAS_SAVE',
  /** Admin이 남의 편집 세션을 강제로 끊은 순간. */
  'CANVAS_LOCK_FORCE_RELEASE',

  // --- Admin ---
  /** 사용자 시뮬레이션 시작. 실제 행위자와 대상을 구분해 남긴다. */
  'IMPERSONATION_START',
  'ARTIFACT_SERVICE_REGISTER',
  'ARTIFACT_SERVICE_UPDATE',

  // --- 폐기됐지만 과거 문서에 남아 있는 값 (읽기 호환용) ---
  'RELEASE',
  'HLD_RELEASE',
  'MANUAL_VERSION_ASSERT',
  'DELIVERABLE_DELETE',
  'WORKFLOW_OWNER_ADD',
  'WORKFLOW_OWNER_REMOVE',
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
