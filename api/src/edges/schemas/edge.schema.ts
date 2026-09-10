import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
// @Prop의 런타임 type은 반드시 SchemaTypes.ObjectId를 쓴다 - Types.ObjectId(값 클래스)를 주면
// Mongoose가 Mixed 경로를 만들고, Mixed는 캐스팅을 하지 않아 문자열 id 필터가 전부 0건이 된다.
// (필드의 TypeScript 타입으로서의 Types.ObjectId는 그대로 쓴다.)

export type EdgeDocument = Edge & Document;

/**
 * 연결선(Edge/Flow). bidirectional: true인 경우 역방향 edge를 별도로 만들지
 * 않고 이 한 문서로 양방향을 표현한다.
 *
 * release의 source 계산은 이 edge를 **직전 1홉만** 거슬러 올라간다(설계서 05장 §4.2) —
 * A → B → C 에서 C의 source는 B뿐이고, A는 B를 release할 때 이미 기록되므로 release
 * history를 타고 가면 전체 계보가 복원된다.
 */
@Schema({ timestamps: true })
export class Edge {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Workflow', required: true, index: true })
  workflowId: Types.ObjectId;

  /** 캔버스 블록 id. 구 Deliverable이 Block으로 개명되면서 ref만 바뀌었다. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Block', required: true })
  fromId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Block', required: true })
  toId: Types.ObjectId;

  @Prop({ default: false })
  bidirectional: boolean;

  /** series 자동 연결로 생성됨. 사용자가 수동으로 만들거나 수정하면 false로 내린다. */
  @Prop({ default: false })
  auto: boolean;

  /**
   * 목업 시드가 만든 문서 표시 (MOCKUP_ENABLED). 사용자가 실제로 만든 데이터는 항상 false다.
   * MOCKUP_ENABLED=false 로 바꾸고 재시작하면 isMock:true 문서만 일괄 삭제된다
   * (src/database/seed-runner.service.ts) - 실제 데이터는 절대 건드리지 않는다.
   */
  @Prop({ default: false, index: true })
  isMock: boolean;

  _id: Types.ObjectId;
}

export const EdgeSchema = SchemaFactory.createForClass(Edge);
