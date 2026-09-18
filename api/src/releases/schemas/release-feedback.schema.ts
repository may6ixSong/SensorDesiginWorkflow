import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

export type ReleaseFeedbackDocument = ReleaseFeedback & Document;

/** 초록/노랑/빨강 dot 세 개 — 순서대로 전부 수용, 일부만 수용, 현재는 수용 불가능(사용자 확정). */
export const RELEASE_FEEDBACK_STATUSES = ['accepted', 'partial', 'blocked'] as const;
export type ReleaseFeedbackStatus = (typeof RELEASE_FEEDBACK_STATUSES)[number];

/**
 * release 한 건에 대해, 그걸 받은 한 부서가 남기는 댓글 스레드(설계서 09장 §4.2~4.3).
 * **산출물(item) 단위가 아니라 release 전체에 대한 것**이다(사용자 확정) — 부서마다
 * 독립된 스레드이고, 다른 부서에는 절대 보이지 않는다. 추후 workflow 쪽에서 부서별
 * release status를 모아보는 화면의 바탕 데이터다.
 *
 * ★ Release 자체처럼 append-only다 — "언제든 계속 추가할 수 있다"(사용자 확정)는 새
 *   항목을 쌓는다는 뜻이지 기존 항목을 고친다는 뜻이 아니다. update/delete 라우트를
 *   두지 않는다(release.schema.ts의 철회 불가 원칙과 같은 이유).
 * ★ status는 **최상위 댓글에만** 있다 — 답글은 "이 상태에 대한 대화"일 뿐 새 상태를
 *   선언하지 않는다(사용자 확정: "comment의 답글은 status가 없어도 돼"). "지금 상태"는
 *   그 부서의 최상위 댓글 중 가장 최근 것으로 본다.
 */
@Schema({ timestamps: true })
export class ReleaseFeedback {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Release', required: true, index: true })
  releaseId: Types.ObjectId;

  /** 이 스레드가 속한 부서. 다른 부서 조회에는 절대 섞이지 않는다. */
  @Prop({ required: true, trim: true, index: true })
  department: string;

  /** 답글이면 부모 댓글의 _id. 최상위 댓글이면 null. */
  @Prop({ type: SchemaTypes.ObjectId, default: null, index: true })
  parentId: Types.ObjectId | null;

  /** 최상위 댓글만 채운다 — 명시적으로 고르지 않으면 accepted(초록)가 기본이다(사용자 확정).
   *  답글은 항상 null이다. */
  @Prop({ type: String, enum: [...RELEASE_FEEDBACK_STATUSES, null], default: null })
  status: ReleaseFeedbackStatus | null;

  @Prop({ required: true, trim: true })
  comment: string;

  /** 작성자의 KnoxID (api에는 users 컬렉션이 없다 - src/common/actor.ts). */
  @Prop({ required: true, trim: true })
  createdBy: string;

  @Prop({ default: false, index: true })
  isMock: boolean;

  _id: Types.ObjectId;
  /** @Schema({timestamps:true})가 채운다 - 타입 선언만 있고 별도 @Prop은 없다. */
  createdAt: Date;
  updatedAt: Date;
}

export const ReleaseFeedbackSchema = SchemaFactory.createForClass(ReleaseFeedback);
ReleaseFeedbackSchema.index({ releaseId: 1, department: 1, createdAt: 1 });
