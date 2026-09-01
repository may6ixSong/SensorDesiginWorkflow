import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
// @Prop의 런타임 type은 반드시 SchemaTypes.ObjectId를 쓴다 - Types.ObjectId(값 클래스)를 주면
// Mongoose가 Mixed 경로를 만들고, Mixed는 캐스팅을 하지 않아 문자열 id 필터가 전부 0건이 된다.
// (필드의 TypeScript 타입으로서의 Types.ObjectId는 그대로 쓴다.)

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

  /** 업로드한 사용자의 KnoxID (api에는 users 컬렉션이 없다 - src/common/actor.ts). */
  @Prop({ required: true, trim: true })
  createdBy: string;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}
export const DeliverableVersionSchema = SchemaFactory.createForClass(DeliverableVersion);

export type DeliverableDocument = Deliverable & Document;

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
   * name과 분리된 안정적 식별자 — 사용자가 name을 자유롭게 바꿀 수 있게 되면서,
   * 향후 외부 시스템과 연동할 때 이름이 아니라 이 값으로 매핑하도록 별도로 둔다
   * (설계서 §8.1 로드맵). 지정하면 같은 workflow 안에서 유일해야 하고(DeliverablesService.update
   * 가 검증, 아래 부분 unique 인덱스), series 인스턴스끼리는 같은 key를 공유할 수 있다
   * (같은 실물 산출물의 회차이므로 — update()의 검증이 series 관계면 예외로 둔다).
   * 지정하지 않아도 된다 — 미지정은 null.
   */
  @Prop({ type: String, default: null, trim: true })
  artifactKey: string | null;

  @Prop({ required: true })
  docType: string;

  @Prop({ type: String, required: true, enum: ['OA', 'HPC'] })
  network: NetworkKind;

  /** null이면 원본. 회차 인스턴스는 원본의 _id를 담는다 (설계서 3.6, 4.6). */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Deliverable', default: null })
  series: Types.ObjectId | null;

  @Prop({ default: 1 })
  seriesIdx: number;

  @Prop({ default: 1 })
  seriesTotal: number;

  /** DEPARTMENTS 중 "analog" 제외 값만 허용 (BE 검증, 설계서 3.4, 4.6). */
  @Prop({ type: String, default: null })
  recvDept: string | null;

  /** 수신 담당자의 KnoxID. recvDept 소속이어야 하지만 api는 소속을 조회할 수 없으므로
   * 요청이 함께 보낸 recvDept 값만 검증한다 (설계서 3.4, 4.6). */
  @Prop({ type: String, default: null })
  recvContact: string | null;

  /**
   * 이 산출물을 받아야 하는 다른 workflow. recvDept(부서)와 별개로, workflow끼리
   * 서로 주고받는 산출물(예: BGR_REF → PLL_MAIN)을 표현한다. 설정되면 그 workflow의
   * 보드에 "Incoming from other workflows" 섹션으로 노출되며, Release된 버전만 보인다.
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Workflow', default: null })
  recvWorkflowId: Types.ObjectId | null;

  /**
   * 이 산출물이 실제로는 이 시스템에 들어오지 않은 외부 부서(workflow도 아니고 이 앱의
   * 사용자 조직도 아닌 곳, 예: 파운드리/외주 업체)로부터 받은 것임을 표시하는
   * 자유 텍스트. recvWorkflowId(시스템 내 다른 workflow로부터 수신)와 달리, 이 값이 설정된
   * 산출물은 여전히 workflowId가 가리키는 이 workflow의 "own" 산출물이다 — 그래서 위치·phase
   * 배치(series 포함)를 own 산출물과 완전히 동일하게 자유롭게 편집할 수 있다.
   * 오직 표시(캔버스 배지·상세 "Received from")만 다르다.
   */
  @Prop({ type: String, default: null })
  sourceDept: string | null;

  /**
   * 이 산출물을 받을 때의 개별 연락처 — 시스템 계정(KnoxID)이 없는 경우가 대부분이라
   * recvContact와 달리 이름/이메일/전화 등 자유 텍스트다. sourceWorkflowId(시스템 내
   * workflow 참조)는 일부러 두지 않는다 — 상대가 시스템에 등록되어 있다면 그 workflow가
   * recvWorkflowId를 이 workflow로 걸어두는 순간 이미 "Incoming from other workflows"로
   * 자동 노출되므로(부록 A.4), 받는 쪽이 따로 대상 workflow를 지정할 이유가 없다.
   */
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
   * MOCKUP_ENABLED=false 로 바꾸고 재시작하면 isMock:true 문서만 일괄 삭제된다
   * (src/database/seed-runner.service.ts) - 실제 데이터는 절대 건드리지 않는다.
   */
  @Prop({ default: false, index: true })
  isMock: boolean;

  _id: Types.ObjectId;
}

export const DeliverableSchema = SchemaFactory.createForClass(Deliverable);
DeliverableSchema.index({ workflowId: 1, phaseId: 1 });
DeliverableSchema.index({ series: 1 });
DeliverableSchema.index({ recvWorkflowId: 1 });
// DB 레벨 unique 인덱스로 두지 않는다 - series 인스턴스끼리는 같은 artifactKey를 정당하게
// 공유해야 하는데(같은 실물 산출물의 회차), 그 예외를 인덱스 조건만으로 표현할 수 없다.
// 유일성은 DeliverablesService.update()가 애플리케이션 레벨에서 검증한다.
DeliverableSchema.index({ workflowId: 1, artifactKey: 1 });
