import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class HldItem {
  @Prop({ required: true })
  version: string;

  @Prop({ type: String, default: null })
  file: string | null;

  @Prop({ required: true })
  at: string;

  @Prop({ default: '' })
  comment: string;
}
export const HldItemSchema = SchemaFactory.createForClass(HldItem);

export type HldReleaseDocument = HldRelease & Document;

/**
 * IP의 특정 시점 산출물 스냅샷. items는 그 시점에 Released 상태였던
 * 산출물만 담는다 - "현재 산출물 전체와의 조인"은 FE에서 수행 (설계서 3.10, 4.9).
 */
@Schema({ timestamps: true })
export class HldRelease {
  @Prop({ type: Types.ObjectId, ref: 'Ip', required: true, index: true })
  ipId: Types.ObjectId;

  @Prop({ required: true })
  version: string;

  @Prop({ required: true })
  date: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  releasedBy: Types.ObjectId;

  @Prop({ default: '' })
  note: string;

  /** key = deliverableId (string) */
  @Prop({ type: Map, of: HldItemSchema, default: {} })
  items: Map<string, HldItem>;

  _id: Types.ObjectId;
}

export const HldReleaseSchema = SchemaFactory.createForClass(HldRelease);
