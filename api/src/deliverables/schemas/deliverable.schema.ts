import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VersionKind = 'major' | 'minor';
export type NetworkKind = 'OA' | 'HPC';

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

@Schema({ _id: false, timestamps: false })
export class DeliverableVersion {
  @Prop({ required: true })
  major: number;

  @Prop({ required: true })
  minor: number;

  @Prop({ type: String, required: true, enum: ['major', 'minor'] })
  kind: VersionKind;

  @Prop({ required: true })
  fileName: string;

  @Prop({ type: String, default: null })
  storageKey: string | null;

  @Prop({ type: String, default: null })
  hpcPath: string | null;

  @Prop({ default: '' })
  note: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}
export const DeliverableVersionSchema = SchemaFactory.createForClass(DeliverableVersion);

export type DeliverableDocument = Deliverable & Document;

@Schema({ timestamps: true })
export class Deliverable {
  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Ip', required: true, index: true })
  ipId: Types.ObjectId;

  @Prop({ required: true })
  phaseKey: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true })
  docType: string;

  @Prop({ type: String, required: true, enum: ['OA', 'HPC'] })
  network: NetworkKind;

  /** null이면 원본. 회차 인스턴스는 원본의 _id를 담는다 (설계서 3.6, 4.6). */
  @Prop({ type: Types.ObjectId, ref: 'Deliverable', default: null })
  series: Types.ObjectId | null;

  @Prop({ default: 1 })
  seriesIdx: number;

  @Prop({ default: 1 })
  seriesTotal: number;

  /** DEPARTMENTS 중 "analog" 제외 값만 허용 (BE 검증, 설계서 3.4, 4.6). */
  @Prop({ type: String, default: null })
  recvDept: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  recvContact: Types.ObjectId | null;

  @Prop({ type: LayoutSchema, required: true })
  layout: Layout;

  /** 최신 버전이 배열 앞(index 0)에 오도록 유지한다 (unshift). */
  @Prop({ type: [DeliverableVersionSchema], default: [] })
  versions: DeliverableVersion[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  _id: Types.ObjectId;
}

export const DeliverableSchema = SchemaFactory.createForClass(Deliverable);
DeliverableSchema.index({ ipId: 1, phaseKey: 1 });
DeliverableSchema.index({ series: 1 });
