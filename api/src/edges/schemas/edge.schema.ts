import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EdgeDocument = Edge & Document;

/**
 * 연결선(Edge/Flow). bidirectional: true인 경우 역방향 edge를 별도로 만들지
 * 않고 이 한 문서로 양방향을 표현한다 (설계서 4.8, 8.2-3 - 플래그 방식 채택).
 */
@Schema({ timestamps: true })
export class Edge {
  @Prop({ type: Types.ObjectId, ref: 'Ip', required: true, index: true })
  ipId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Deliverable', required: true })
  fromId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Deliverable', required: true })
  toId: Types.ObjectId;

  @Prop({ default: false })
  bidirectional: boolean;

  /** series 자동 연결로 생성됨. 사용자가 수동으로 만들거나 수정하면 false로 내린다 (설계서 3.6, 4.8). */
  @Prop({ default: false })
  auto: boolean;

  _id: Types.ObjectId;
}

export const EdgeSchema = SchemaFactory.createForClass(Edge);
