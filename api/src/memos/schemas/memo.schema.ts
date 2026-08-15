import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Layout, LayoutSchema } from '../../deliverables/schemas/deliverable.schema';

export type MemoDocument = Memo & Document;

/** 버전 관리 대상이 아닌 설명용 블록. Edit 권한자에게만 노출 (설계서 4.7, 6.3). */
@Schema({ timestamps: true })
export class Memo {
  @Prop({ type: Types.ObjectId, ref: 'Ip', required: true, index: true })
  ipId: Types.ObjectId;

  @Prop({ required: true })
  phaseKey: string;

  @Prop({ required: true })
  text: string;

  @Prop({ type: LayoutSchema, required: true })
  layout: Layout;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  _id: Types.ObjectId;
}

export const MemoSchema = SchemaFactory.createForClass(Memo);
