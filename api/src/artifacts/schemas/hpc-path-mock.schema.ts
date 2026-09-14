import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type HpcPathMockDocument = HpcPathMock & Document;

/**
 * Tier C("HPC Path") 미리보기 전용 mock 데이터 (설계서 04장 §6.4).
 *
 * HPC망 서비스와의 실연동은 아직 구체화되지 않았다 — 그래서 이 tier는 캔버스에서
 * **선택 자체가 잠겨 있다.** 그래도 화면이 완전히 빈 채로는 "이 옵션이 왜 있는지" 알 수
 * 없으므로, project code+revision으로 필터된 가짜 경로 몇 개를 목록에만 띄운다.
 *
 * ★ 실제 매핑에는 전혀 쓰이지 않는다 — `pickable`은 이 컬렉션을 조회하는 서비스 쪽에서
 *   항상 false로 내려준다. isMock 플래그로 시딩되고, 운영 데이터로 취급하지 않는다.
 */
@Schema({ timestamps: true })
export class HpcPathMock {
  @Prop({ required: true, trim: true, index: true })
  projectCode: string;

  @Prop({ required: true, trim: true })
  projectRevision: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  path: string;

  @Prop({ default: true, index: true })
  isMock: boolean;

  _id: Types.ObjectId;
}

export const HpcPathMockSchema = SchemaFactory.createForClass(HpcPathMock);
HpcPathMockSchema.index({ projectCode: 1, projectRevision: 1 });
