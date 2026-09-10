import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
// @Prop의 런타임 type은 반드시 SchemaTypes.ObjectId를 쓴다 - Types.ObjectId(값 클래스)를 주면
// Mongoose가 Mixed 경로를 만들고, Mixed는 캐스팅을 하지 않아 문자열 id 필터가 전부 0건이 된다.
import {
  RecipientGrants,
  RecipientGrantsSchema,
  emptyRecipientGrants,
} from '../../common/schemas/access-grant.schema';

@Schema({ _id: false })
export class Layout {
  @Prop({ required: true, default: 0 })
  x: number;

  @Prop({ required: true, default: 0 })
  y: number;

  @Prop({ required: true, default: 160 })
  w: number;

  @Prop({ required: true, default: 82 })
  h: number;
}
export const LayoutSchema = SchemaFactory.createForClass(Layout);

export type BlockDocument = Block & Document;

/**
 * 캔버스 위의 **자리(placement)**다 — 산출물 그 자체가 아니다(설계서 04장 §1).
 * 버전도, B/C/D의 권한도 갖지 않는다. 전부 Artifact로 옮겼다.
 *
 * 구 `deliverables` 컬렉션이 이것과 `artifacts` 둘로 쪼개진 결과물이다.
 */
@Schema({ timestamps: true })
export class Block {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Project', required: true, index: true })
  projectId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Workflow', required: true, index: true })
  workflowId: Types.ObjectId;

  @Prop({ required: true })
  phaseId: string;

  /**
   * null = 아직 출처가 정해지지 않은 **정상 빈 상태**다 — 자리는 캔버스에 잡아두고
   * 출처는 나중에 지정한다. 이 상태의 블록은 release 대상에서 제외되고, recipient UI도
   * 표시하지 않는다(설계서 05장 §2.2).
   *
   * ★ 매핑 시 artifact.projectId === this.projectId 인지 반드시 검증한다 —
   *   다른 과제(code/revision이 다른)의 산출물은 끌어올 수 없다(설계서 04장 §1.1).
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Artifact', default: null, index: true })
  artifactId: Types.ObjectId | null;

  /** artifact 미매핑 상태의 임시 표기. 매핑되면 artifact.name이 우선한다. */
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: LayoutSchema, required: true })
  layout: Layout;

  /**
   * 지금은 항상 'own'이다 — "새 Artifact 추가" 버튼이 하나로 통합되어 내가 주는 산출물만
   * 만든다(설계서 03장 §5.2). 받는 산출물 UX는 TODO T2에서 되살릴 예정이라 필드는 남겨둔다.
   *
   * TODO(T2): 받는 산출물 UI를 붙일 때 이 필드를 다시 쓴다. 그때의 선택 가능 범위 규칙은
   *   이미 확정되어 있다(설계서 04장 §6) — A는 그 서비스의 view 권한, B/C는 주는 쪽
   *   편집 권한자가 view 권한을 준 것만, D는 자유.
   */
  @Prop({ type: String, default: 'own', enum: ['own', 'received'] })
  intent: 'own' | 'received';

  /**
   * ★ A Tier artifact가 매핑된 block에서만 의미가 있다.
   *
   * A Tier는 그 서비스가 권한을 관리하므로 SIREN은 recipient를 따로 들고 있는데, 이 구성은
   * **workflow마다 독립**이다 — 같은 artifact가 workflow X와 Y에 놓여도 X는 AA·BB 부서에,
   * Y는 CC 부서에만 갈 수 있다. 그래서 artifact가 아니라 여기(block)에 붙는다.
   *
   * B/C/D는 항상 비워둔다 — 그 경우 recipient는 artifact.viewAccess에서 파생하며,
   * 모든 workflow에 동일하게 적용된다(설계서 01장 §4.1, 04장 §3).
   *
   * 이 목록은 release 알림 대상이자 **slide 열람의 첫 번째 게이트**다(설계서 04장 §4.1).
   */
  @Prop({ type: RecipientGrantsSchema, default: emptyRecipientGrants })
  recipients: RecipientGrants;

  /** null이면 원본. 회차 인스턴스는 원본의 _id를 담는다(반복 릴리스 일정). */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Block', default: null })
  series: Types.ObjectId | null;

  @Prop({ default: 1 })
  seriesIdx: number;

  @Prop({ default: 1 })
  seriesTotal: number;

  @Prop({ required: true, trim: true })
  createdBy: string;

  @Prop({ default: false, index: true })
  isMock: boolean;

  _id: Types.ObjectId;
}

export const BlockSchema = SchemaFactory.createForClass(Block);
BlockSchema.index({ workflowId: 1, phaseId: 1 });
BlockSchema.index({ series: 1 });
