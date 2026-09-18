import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

export type ReleaseItemFeedbackDocument = ReleaseItemFeedback & Document;

/** 초록/노랑/빨강 dot 세 개 — 순서대로 전부 수용, 일부만 수용, 현재는 수용 불가능(사용자 확정). */
export const RELEASE_ITEM_FEEDBACK_STATUSES = ['accepted', 'partial', 'blocked'] as const;
export type ReleaseItemFeedbackStatus = (typeof RELEASE_ITEM_FEEDBACK_STATUSES)[number];

/**
 * release 안의 한 산출물(item)에 대해, 그걸 받은 한 부서가 남기는 상태/코멘트 이력
 * (설계서 09장 §4.2). 부서마다 독립된 이력이고, 다른 부서에는 절대 보이지 않는다 —
 * 추후 workflow 쪽에서 부서별 release status를 모아보는 화면의 바탕 데이터다.
 *
 * ★ Release 자체처럼 append-only다 — "언제든 계속 추가할 수 있다"(사용자 확정)는 새
 *   항목을 쌓는다는 뜻이지 기존 항목을 고친다는 뜻이 아니다. update/delete 라우트를
 *   두지 않는다(release.schema.ts의 철회 불가 원칙과 같은 이유).
 */
@Schema({ timestamps: true })
export class ReleaseItemFeedback {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Release', required: true, index: true })
  releaseId: Types.ObjectId;

  /** release.items[].blockId — 그 release 안의 어느 산출물에 대한 것인지. */
  @Prop({ required: true, index: true })
  blockId: string;

  /** 이 이력이 속한 부서. 다른 부서 조회에는 절대 섞이지 않는다(canonicalDepartmentLabel 원문 키). */
  @Prop({ required: true, trim: true, index: true })
  department: string;

  @Prop({ type: String, required: true, enum: RELEASE_ITEM_FEEDBACK_STATUSES })
  status: ReleaseItemFeedbackStatus;

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

export const ReleaseItemFeedbackSchema = SchemaFactory.createForClass(ReleaseItemFeedback);
ReleaseItemFeedbackSchema.index({ releaseId: 1, blockId: 1, department: 1, createdAt: 1 });
