import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
// @Prop의 런타임 type은 반드시 SchemaTypes.ObjectId를 쓴다 - Types.ObjectId(값 클래스)를 주면
// Mongoose가 Mixed 경로를 만들고, Mixed는 캐스팅을 하지 않아 문자열 id 필터가 전부 0건이 된다.
// (필드의 TypeScript 타입으로서의 Types.ObjectId는 그대로 쓴다.)

export type NetworkKind = 'OA' | 'HPC';

/** 통합 신뢰도 티어 (Hub 설계서 §5.1). 산출물이 아니라 버전 엔트리마다 붙는다. */
export const TIERS = ['A', 'B', 'C', 'D'] as const;
export type Tier = (typeof TIERS)[number];

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

/** lineage - 이 버전이 무엇으로부터 만들어졌는가 (Hub 설계서 §4.1). */
@Schema({ _id: false })
export class SourceRef {
  @Prop({ required: true })
  artifactKey: string;

  @Prop({ required: true })
  serviceKey: string;

  @Prop({ required: true })
  versionRef: string;

  @Prop({ default: '' })
  versionLabel: string;

  @Prop({ type: Date, default: null })
  capturedAt: Date | null;
}
export const SourceRefSchema = SchemaFactory.createForClass(SourceRef);

/**
 * 버전 엔트리. 실물 파일과 전체 이력은 각 산출물 서비스가 소유하고, SIREN은 참조만
 * 들고 있는다 (Hub 설계서 §1.2). storageKey/fileName/major/minor/kind는 그래서 없다.
 */
@Schema({ _id: false, timestamps: false })
export class DeliverableVersion {
  /**
   * 이 엔트리를 SIREN이 얼마나 자동으로·검증 가능하게 알았는지 (Hub 설계서 §5.3).
   * 산출물 단위가 아니라 엔트리 단위라서, 나중에 실연동이 붙어도 예전 수동 기록을
   * 지우거나 옮길 필요가 없다 - 다음 엔트리가 다른 tier로 찍힐 뿐이다.
   */
  @Prop({ type: String, required: true, enum: TIERS, default: 'C' })
  tier: Tier;

  /** 표시용 자유 문자열. major.minor 규칙은 우리가 직접 만드는 서비스에만 강제한다. */
  @Prop({ required: true, trim: true })
  versionLabel: string;

  /** 가시성 판정은 오직 이 필드로만 한다 (Hub 설계서 §6.2). */
  @Prop({ required: true, default: false })
  isReleased: boolean;

  /**
   * 그 서비스가 준 불변 참조. Workflow Release 스냅샷이 이 값을 고정한다.
   * C/D 티어(수동 기록)는 참조할 실체가 없으므로 null이다.
   */
  @Prop({ type: String, default: null })
  versionRef: string | null;

  /** 이 버전을 만들어 제공한 쪽. SIREN이 giver 여부를 이 값으로 직접 계산한다. */
  @Prop({ type: String, default: null })
  giverKnoxId: string | null;

  @Prop({ type: String, default: null })
  giverDept: string | null;

  @Prop({ type: [SourceRefSchema], default: [] })
  sourceRefs: SourceRef[];

  /** 그 서비스의 산출물 상세 페이지. SIREN은 이 링크로 내보낸다. */
  @Prop({ type: String, default: null })
  viewUrl: string | null;

  /** HPC망은 실물 파일 대신 경로 문자열만 갖는다 (v2 §3.11 - 티어와 직교하는 축). */
  @Prop({ type: String, default: null })
  hpcPath: string | null;

  @Prop({ default: '' })
  note: string;

  // --- C/D 티어 전용 (수동 기록) ---
  /** 이 버전을 수동으로 주장한 사용자의 KnoxID (Hub 설계서 §9.2). */
  @Prop({ type: String, default: null })
  assertedBy: string | null;

  @Prop({ type: Date, default: null })
  assertedAt: Date | null;

  // --- A/B 티어 전용 (관측) ---
  /** SIREN이 이 값을 관측·동기화한 시각. */
  @Prop({ type: Date, default: null })
  observedAt: Date | null;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}
export const DeliverableVersionSchema = SchemaFactory.createForClass(DeliverableVersion);

export type DeliverableDocument = Deliverable & Document;

/**
 * 산출물의 **placement**다 - 그 workflow 캔버스에서의 자리이지 산출물 그 자체가 아니다
 * (Hub 설계서 §10.1). serviceKey + externalArtifactId가 같은 문서가 서로 다른
 * workflowId 아래 여러 개 존재할 수 있다 - 같은 Hub 산출물이 같은 department의 여러
 * workflow에 동시에 걸리는 경우다(§11.4). 그 문서들은 각자 다른 phaseId·layout을
 * 갖지만 가리키는 실체(그 서비스의 버전 이력)는 하나다.
 */
@Schema({ timestamps: true })
export class Deliverable {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Project', required: true, index: true })
  projectId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Workflow', required: true, index: true })
  workflowId: Types.ObjectId;

  @Prop({ required: true })
  phaseId: string;

  @Prop({ required: true, trim: true })
  name: string;

  /**
   * 이 산출물의 실물을 소유한 Hub 서비스 (artifactServices.key). null이면 아직 출처가
   * 정해지지 않은 "정상 빈 상태"다 - 노드는 캔버스에 있되 데이터 출처는 나중에
   * 지정한다(Hub 설계서 §11).
   */
  @Prop({ type: String, default: null, trim: true, index: true })
  serviceKey: string | null;

  /** 그 서비스 안에서의 산출물 식별자. serviceKey와 짝을 이룬다. */
  @Prop({ type: String, default: null, trim: true })
  externalArtifactId: string | null;

  @Prop({ type: String, required: true, enum: ['OA', 'HPC'], default: 'OA' })
  network: NetworkKind;

  /**
   * 'own' = 이 workflow가 만들어 남에게 주는 산출물(기본값). 'received' = 이 workflow가
   * 받기를 기다리는 산출물 자리표시자 - 실물은 연동된 서비스를 통해 누군가 올려줄 것이라
   * 이 화면에서 직접 업로드/전달(Handoff) 편집을 허용하지 않는다. 생성 시점에만 정해진다.
   */
  @Prop({ type: String, default: 'own', enum: ['own', 'received'] })
  intent: 'own' | 'received';

  /** null이면 원본. 회차 인스턴스는 원본의 _id를 담는다 (v2 §3.6). */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Deliverable', default: null })
  series: Types.ObjectId | null;

  @Prop({ default: 1 })
  seriesIdx: number;

  @Prop({ default: 1 })
  seriesTotal: number;

  /** DEPARTMENTS 중 "analog" 제외 값만 허용 (BE 검증, v2 §3.4). */
  @Prop({ type: String, default: null })
  recvDept: string | null;

  /** 수신 담당자의 KnoxID. */
  @Prop({ type: String, default: null })
  recvContact: string | null;

  /**
   * 이 산출물을 받아야 하는 다른 workflow. 설정되면 그 workflow의 보드에
   * "Incoming from other workflows" 섹션으로 노출되며, Release된 버전만 보인다(부록 A.4).
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Workflow', default: null })
  recvWorkflowId: Types.ObjectId | null;

  /** 시스템 밖 출처 표시용 자유 텍스트 (부록 A.8). D 티어의 구현체이기도 하다. */
  @Prop({ type: String, default: null })
  sourceDept: string | null;

  @Prop({ type: String, default: null })
  sourceContact: string | null;

  @Prop({ type: LayoutSchema, required: true })
  layout: Layout;

  /** 최신 버전이 배열 앞(index 0)에 오도록 유지한다 (unshift). */
  @Prop({ type: [DeliverableVersionSchema], default: [] })
  versions: DeliverableVersion[];

  /** 산출물을 만든 사용자의 KnoxID. */
  @Prop({ required: true, trim: true })
  createdBy: string;

  /**
   * 목업 시드가 만든 문서 표시 (MOCKUP_ENABLED). 사용자가 실제로 만든 데이터는 항상 false다.
   */
  @Prop({ default: false, index: true })
  isMock: boolean;

  _id: Types.ObjectId;
}

export const DeliverableSchema = SchemaFactory.createForClass(Deliverable);
DeliverableSchema.index({ workflowId: 1, phaseId: 1 });
DeliverableSchema.index({ series: 1 });
DeliverableSchema.index({ recvWorkflowId: 1 });
// 같은 (serviceKey, externalArtifactId)를 여러 workflow가 참조할 수 있으므로(§11.4)
// unique가 아니다 - 조회용 복합 인덱스일 뿐이다.
DeliverableSchema.index({ serviceKey: 1, externalArtifactId: 1 });
