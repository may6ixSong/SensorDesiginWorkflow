import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { TemplateColumn } from '../table-validation';

/** template 한 번의 저장본 — 옛 버전의 표 데이터를 그때의 컬럼 정의로 다시 그릴 수 있게 남긴다. */
@Schema({ _id: false })
export class TemplateRevision {
  @Prop({ required: true })
  version: number;

  @Prop({ required: true })
  sheetName: string;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  columns: TemplateColumn[];

  @Prop({ required: true })
  updatedBy: string;

  @Prop({ type: Date, default: () => new Date() })
  updatedAt: Date;
}
export const TemplateRevisionSchema = SchemaFactory.createForClass(TemplateRevision);

export type TableTemplateDocument = TableTemplate & Document;

/**
 * 표(table) 콘텐츠의 template(SIREN 설계서 11장). Calypso가 소유하고, Admin이 SIREN 화면에서
 * 고친다. 고칠 때마다 version이 오르고 그 정의가 revisions에 쌓인다 — 표 버전은 자기가
 * 저장될 때의 (key, version)을 들고 있으므로 template이 나중에 바뀌어도 그대로 읽힌다.
 */
@Schema({ collection: 'tableTemplates', timestamps: true })
export class TableTemplate {
  @Prop({ required: true, unique: true, trim: true, index: true })
  key: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ required: true, trim: true })
  sheetName: string;

  @Prop({ required: true, default: 1 })
  version: number;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  columns: TemplateColumn[];

  @Prop({ type: [TemplateRevisionSchema], default: [] })
  revisions: TemplateRevision[];

  /** 보관된 template은 새 artifact 생성 목록에서 빠진다(기존 데이터는 그대로 읽힌다). */
  @Prop({ default: false })
  archived: boolean;

  @Prop({ required: true })
  createdBy: string;

  @Prop({ required: true })
  updatedBy: string;

  _id: Types.ObjectId;
}
export const TableTemplateSchema = SchemaFactory.createForClass(TableTemplate);
