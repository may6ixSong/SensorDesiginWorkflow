import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { SheetSeed } from '../sheet-format';

/**
 * template 개정본 하나 — 고치면 항상 새 개정본을 쌓는다(과거 개정본은 바꾸지 않는다). 이미 그
 * 개정본으로 만든 artifact가 어떤 시작 시트를 받았는지 다시 볼 수 있어야 하기 때문이다.
 *
 * `documentKey`(Admin이 편집기로 저장한 SpreadJS 문서, 오브젝트 스토리지)와 `seed`(기본
 * template의 중립 명세) 중 하나만 있다.
 */
@Schema({ _id: false, timestamps: false })
export class SheetTemplateRevision {
  @Prop({ required: true })
  revision: number;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  seed: SheetSeed | null;

  @Prop({ type: String, default: null })
  documentKey: string | null;

  @Prop({ default: '' })
  note: string;

  @Prop({ required: true })
  createdBy: string;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}
export const SheetTemplateRevisionSchema = SchemaFactory.createForClass(SheetTemplateRevision);

export type SheetTemplateDocument = SheetTemplate & Document;

/**
 * Sheet template(SIREN 설계서 11장 §3) — 새 sheet artifact를 만들 때 불러오는 "기본으로 채워진
 * 엑셀 시트". Calypso가 소유하고, 쓰기는 Admin만 한다. template은 시작점일 뿐이다 — artifact가
 * 만들어진 뒤로는 template과 무관하게 사용자가 자유롭게 고친다.
 */
@Schema({ collection: 'sheetTemplates', timestamps: true })
export class SheetTemplate {
  @Prop({ required: true, unique: true, trim: true })
  key: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  /**
   * 삭제(Admin). 목록·생성 화면에서 사라지고 되살릴 수 없다. 문서와 개정본은 남긴다 — 이 template으로
   * 만들고 아직 첫 저장을 안 한 artifact가 고정된 개정본으로 시작해야 하기 때문이다(설계서 11장 §3).
   * 삭제할 때 key를 `deleted~<id>~<key>`로 바꿔 같은 key로 새 template을 만들 수 있게 하고, 원래 key는
   * originalKey에 둔다.
   */
  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  @Prop({ type: String, default: null })
  deletedBy: string | null;

  @Prop({ type: String, default: null })
  originalKey: string | null;

  @Prop({ required: true, default: 1 })
  currentRevision: number;

  @Prop({ type: [SheetTemplateRevisionSchema], default: [] })
  revisions: SheetTemplateRevision[];

  @Prop({ required: true })
  createdBy: string;

  @Prop({ required: true })
  updatedBy: string;

  @Prop({ default: () => new Date() })
  updatedAt: Date;

  _id: Types.ObjectId;
}

export const SheetTemplateSchema = SchemaFactory.createForClass(SheetTemplate);
