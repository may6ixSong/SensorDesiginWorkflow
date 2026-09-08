import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
// @Prop의 런타임 type은 반드시 SchemaTypes.ObjectId를 쓴다 - Types.ObjectId(값 클래스)를 주면
// Mongoose가 Mixed 경로를 만들고, Mixed는 캐스팅을 하지 않아 문자열 id 필터가 전부 0건이 된다.
// (필드의 TypeScript 타입으로서의 Types.ObjectId는 그대로 쓴다.)
import { Layout, LayoutSchema, SourceRef, SourceRefSchema } from '../../deliverables/schemas/deliverable.schema';

/**
 * 스냅샷 한 줄 (Hub 설계서 §10.2). versionRef를 얼려두므로, 그 뒤로 서비스가 버전을
 * 더 올려도 이 항목은 계속 그때 그 버전을 가리킨다.
 *
 * 이 개념이 생기기 전에 찍힌 과거 스냅샷에는 tier/confidence/versionRef가 없다 -
 * 소급해서 채울 방법이 없으므로 비워둔 채로 두고, 화면에서는 배지를 그리지 않는다.
 * giverKnoxId/sourceRefs는 §19.4에서 추가됐다 - 그 전 스냅샷은 둘 다 비어 있다.
 */
@Schema({ _id: false })
export class HldItem {
  @Prop({ required: true })
  version: string;

  @Prop({ type: String, default: null })
  versionLabel: string | null;

  /** 그 시점 서비스가 준 불변 참조. C/D 수동 기록은 참조할 실체가 없어 null이다. */
  @Prop({ type: String, default: null })
  versionRef: string | null;

  @Prop({ type: String, default: null })
  tier: string | null;

  /** 'verified'(A/B, 시스템이 확인) | 'asserted'(C/D, 담당자 주장). */
  @Prop({ type: String, default: null })
  confidence: string | null;

  @Prop({ type: Date, default: null })
  pinnedAt: Date | null;

  @Prop({ type: String, default: null })
  file: string | null;

  @Prop({ required: true })
  at: string;

  @Prop({ default: '' })
  comment: string;

  /** 이 버전을 만들어 준 쪽 - 그 시점에 그 서비스(또는 SIREN 자체 기록)가 알려준 값(§19.4). */
  @Prop({ type: String, default: null })
  giverKnoxId: string | null;

  /** 그 서비스의 산출물 상세 페이지 링크. HPC 경로형은 file에 이미 있으므로 여기 넣지 않는다. */
  @Prop({ type: String, default: null })
  viewUrl: string | null;

  /** lineage - 이 버전이 그 시점에 무엇으로부터 만들어졌는지(§4.1, §19.4). */
  @Prop({ type: [SourceRefSchema], default: [] })
  sourceRefs: SourceRef[];
}
export const HldItemSchema = SchemaFactory.createForClass(HldItem);

/** 캔버스 위 산출물 하나의 스냅샷 — 그 시점의 배치·매핑만 담는다(버전은 items에 따로). */
@Schema({ _id: false })
export class HldSnapshotDeliverable {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  phaseId: string;

  @Prop({ type: LayoutSchema, required: true })
  layout: Layout;

  @Prop({ type: String, default: null })
  serviceKey: string | null;

  @Prop({ type: String, default: null })
  externalArtifactId: string | null;

  @Prop({ type: String, default: null })
  artifactTypeKey: string | null;

  @Prop({ type: String, default: 'own', enum: ['own', 'received'] })
  intent: 'own' | 'received';

  @Prop({ type: String, default: null })
  recvDept: string | null;

  @Prop({ type: String, default: null })
  series: string | null;

  @Prop({ default: 1 })
  seriesIdx: number;

  @Prop({ default: 1 })
  seriesTotal: number;
}
export const HldSnapshotDeliverableSchema = SchemaFactory.createForClass(HldSnapshotDeliverable);

@Schema({ _id: false })
export class HldSnapshotEdge {
  @Prop({ required: true })
  fromId: string;

  @Prop({ required: true })
  toId: string;

  @Prop({ default: false })
  bidirectional: boolean;
}
export const HldSnapshotEdgeSchema = SchemaFactory.createForClass(HldSnapshotEdge);

@Schema({ _id: false })
export class HldSnapshotMemo {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  phaseId: string;

  @Prop({ required: true })
  text: string;

  @Prop({ type: LayoutSchema, required: true })
  layout: Layout;
}
export const HldSnapshotMemoSchema = SchemaFactory.createForClass(HldSnapshotMemo);

@Schema({ _id: false })
export class HldSnapshotPhase {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  start: string;

  @Prop({ required: true })
  end: string;
}
export const HldSnapshotPhaseSchema = SchemaFactory.createForClass(HldSnapshotPhase);

/**
 * 캔버스 전체 스냅샷(§19.4) - Release 시점의 배치·연결·메모·일정을 통째로 얼린다.
 * "산출물이 없는 phase가 몇 개 있었는지"부터 "그때는 A→B가 연결돼 있었는지"까지
 * items(버전)와 별개로 여기서 전부 재구성 가능해야 한다 - 지금 캔버스와 섞어 쓰지 않는다.
 */
@Schema({ _id: false })
export class HldSnapshotCanvas {
  @Prop({ type: [HldSnapshotDeliverableSchema], default: [] })
  deliverables: HldSnapshotDeliverable[];

  @Prop({ type: [HldSnapshotEdgeSchema], default: [] })
  edges: HldSnapshotEdge[];

  @Prop({ type: [HldSnapshotMemoSchema], default: [] })
  memos: HldSnapshotMemo[];

  @Prop({ type: [HldSnapshotPhaseSchema], default: [] })
  phases: HldSnapshotPhase[];
}
export const HldSnapshotCanvasSchema = SchemaFactory.createForClass(HldSnapshotCanvas);

export type HldReleaseDocument = HldRelease & Document;

/**
 * workflow의 특정 시점 전체 스냅샷(§19.4) - canvas가 그 시점의 구조 전체를,
 * items가 그 시점에 Released 상태였던 산출물의 버전 사실을 담는다. "현재 산출물 목록과의
 * 조인"은 더 이상 하지 않는다 - View 권한은 이 문서 하나로 구조와 버전을 모두 그린다
 * (설계서 3.10, 4.9, §19.5).
 *
 * canvas가 없는(이 개념이 생기기 전) 과거 스냅샷은 deliverables/edges/memos/phases가
 * 전부 빈 배열이다 - 소급해서 채울 방법이 없다. 화면은 그런 스냅샷을 열면 "구조 정보 없음"
 * 안내만 보여주고 items만으로 표를 그린다.
 */
@Schema({ timestamps: true })
export class HldRelease {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Workflow', required: true, index: true })
  workflowId: Types.ObjectId;

  @Prop({ required: true })
  version: string;

  @Prop({ required: true })
  date: string;

  /** 릴리스한 사용자의 KnoxID (api에는 users 컬렉션이 없다 - src/common/actor.ts). */
  @Prop({ required: true, trim: true })
  releasedBy: string;

  @Prop({ default: '' })
  note: string;

  @Prop({ type: HldSnapshotCanvasSchema, default: () => ({}) })
  canvas: HldSnapshotCanvas;

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
