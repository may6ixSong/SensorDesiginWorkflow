import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * 권한 한 벌 — 부서 다중 + 개별 사용자 다중 (설계서 01장 §3.1, §4.3).
 *
 * 이 모양이 시스템 전체에서 반복된다:
 *   - Workflow.editAccess / viewAccess
 *   - Artifact.editAccess / viewAccess   (B/C/D 전용. viewAccess가 곧 recipient)
 *   - Block.recipients.editAccess / viewAccess (A Tier 전용)
 *
 * ★ 부서 단위 권한은 **조회 시점에 실시간으로** 판정한다 — 부여 시점의 멤버를 얼려두지
 *   않는다. 그래야 나중에 그 부서에 합류한 사람도 즉시 권한을 얻는다(설계서 01장 §3.2).
 *   그래서 여기에는 부서 id만 담고, 그 부서에 누가 속하는지는 담지 않는다.
 *
 * ★ users는 KnoxID 문자열만 담는다. 이름은 저장하지 않고 SDPCommonAPI로 조회한다
 *   (설계서 01장 §6). project member가 아닌 사람도 넣을 수 있다 — 실제로 열리는지는
 *   Project 계층이 최종 판정한다(설계서 01장 §2.2).
 */
@Schema({ _id: false })
export class AccessGrant {
  @Prop({ type: [String], default: [] })
  departments: string[];

  @Prop({ type: [String], default: [] })
  users: string[];
}

export const AccessGrantSchema = SchemaFactory.createForClass(AccessGrant);

/** 빈 권한 한 벌. 스키마 default로 쓴다. */
export const emptyAccessGrant = (): AccessGrant => ({ departments: [], users: [] });

/**
 * A Tier block의 recipient — 알림 대상이자 SIREN 쪽 slide 열람 게이트(설계서 04장 §3.3).
 * workflow마다 독립이라 artifact가 아니라 block에 붙는다.
 */
@Schema({ _id: false })
export class RecipientGrants {
  @Prop({ type: AccessGrantSchema, default: emptyAccessGrant })
  editAccess: AccessGrant;

  @Prop({ type: AccessGrantSchema, default: emptyAccessGrant })
  viewAccess: AccessGrant;
}

export const RecipientGrantsSchema = SchemaFactory.createForClass(RecipientGrants);

export const emptyRecipientGrants = (): RecipientGrants => ({
  editAccess: emptyAccessGrant(),
  viewAccess: emptyAccessGrant(),
});
