import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Phase는 이 시스템에서 읽기 전용 참조 (설계서 3.2, 4.4).
 * 이번 개발 범위에는 phases를 쓰는 API가 없다 - 향후 별도 "프로젝트 설정" 서비스가 채운다는 가정.
 */
@Schema({ _id: false })
export class PhaseRef {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  start: string;

  @Prop({ required: true })
  end: string;

  @Prop({ required: true })
  order: number;
}
export const PhaseRefSchema = SchemaFactory.createForClass(PhaseRef);

export type ProjectDocument = Project & Document;

@Schema({ timestamps: true })
export class Project {
  @Prop({ required: true, unique: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: 'ANALOG' })
  domain: string;

  @Prop({ type: [PhaseRefSchema], default: [] })
  phases: PhaseRef[];

  @Prop({ default: 'ACTIVE' })
  status: string;

  _id: Types.ObjectId;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
