import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
// @Prop의 런타임 type은 반드시 SchemaTypes.ObjectId를 쓴다 - Types.ObjectId(값 클래스)를 주면
// Mongoose가 Mixed 경로를 만들고, Mixed는 캐스팅을 하지 않아 문자열 id 필터가 전부 0건이 된다.
import { AccessGrant, AccessGrantSchema, emptyAccessGrant } from '../../common/schemas/access-grant.schema';

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
 * 버전도, A/B/C의 권한도 갖지 않는다. 전부 Artifact로 옮겼다.
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
   * "새 Artifact 추가" 다이얼로그의 첫 질문이다(설계서 03장 §5.2, 04장 §6) — 내가 주는
   * 산출물(own)인지 받는 산출물(received)인지. 생성 후에는 바뀌지 않는다.
   *
   * 선택 가능 범위 규칙(설계서 04장 §6.2) — A/C는 그 서비스의 edit(own)/view(received)
   * 권한, B(File Artifacts)는 Calypso의 myAccess가 그대로 같은 역할을 한다.
   */
  @Prop({ type: String, default: 'own', enum: ['own', 'received'] })
  intent: 'own' | 'received';

  /**
   * artifact가 매핑된 block에서만 의미가 있다 — A/B/C 전부 공통이다(설계서 04장 §3).
   *
   * SIREN은 여기서 "누가 이 자리의 산출물을 받는가"만 관리한다. 이 구성은
   * **workflow마다 독립**이다 — 같은 artifact가 workflow X와 Y에 놓여도 X는 AA·BB 부서에,
   * Y는 CC 부서에만 갈 수 있다. 그래서 artifact가 아니라 여기(block)에 붙는다.
   *
   * ★ edit/view로 나뉘지 않는다 — recipient는 오직 "볼 수 있는가"의 게이트 1일 뿐이고,
   *   실제 edit 여부는 그 서비스가 최종 판정한다(그래서 recipient를 편집하는 권한과
   *   recipient에 속하는 것은 여전히 별개다).
   *
   * 이 목록은 release 알림 대상이자 **slide 열람의 첫 번째 게이트**다(설계서 04장 §4.1).
   */
  @Prop({ type: AccessGrantSchema, default: emptyAccessGrant })
  recipients: AccessGrant;

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
// My Assignment는 "내 부서 workflow의 own block 중 artifact가 매핑된 것"을 과제 경계를
// 넘어 모은다 — workflow 묶음으로 한 번에 긁는 그 조회를 위한 인덱스다(설계서 09장).
BlockSchema.index({ workflowId: 1, intent: 1, artifactId: 1 });
