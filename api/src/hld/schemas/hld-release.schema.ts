import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
// @Prop의 런타임 type은 반드시 SchemaTypes.ObjectId를 쓴다 - Types.ObjectId(값 클래스)를 주면
// Mongoose가 Mixed 경로를 만들고, Mixed는 캐스팅을 하지 않아 문자열 id 필터가 전부 0건이 된다.
// (필드의 TypeScript 타입으로서의 Types.ObjectId는 그대로 쓴다.)

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
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Ip', required: true, index: true })
  ipId: Types.ObjectId;

  @Prop({ required: true })
  version: string;

  @Prop({ required: true })
  date: string;

  /** 릴리스한 사용자의 KnoxID (api에는 users 컬렉션이 없다 - src/common/actor.ts). */
  @Prop({ required: true, trim: true })
  releasedBy: string;

  @Prop({ default: '' })
  note: string;

  /** key = deliverableId (string) */
  @Prop({ type: Map, of: HldItemSchema, default: {} })
  items: Map<string, HldItem>;

  /**
   * 목업 시드가 만든 문서 표시 (MOCKUP_ENABLED). 사용자가 실제로 만든 데이터는 항상 false다.
   * MOCKUP_ENABLED=false 로 바꾸고 재시작하면 isMock:true 문서만 일괄 삭제된다
   * (src/database/seed-runner.service.ts) - 실제 데이터는 절대 건드리지 않는다.
   */
  @Prop({ default: false, index: true })
  isMock: boolean;

  _id: Types.ObjectId;
}

export const HldReleaseSchema = SchemaFactory.createForClass(HldRelease);
