import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
// @Prop의 런타임 type은 반드시 SchemaTypes.ObjectId를 쓴다 - Types.ObjectId(값 클래스)를 주면
// Mongoose가 Mixed 경로를 만들고, Mixed는 캐스팅을 하지 않아 문자열 id 필터가 전부 0건이 된다.

/**
 * 실행 상태(설계서 10장 §5).
 *   queued     — SIREN 안의 큐에 들어갔다. 아직 그 서비스에 보내지 않았다
 *   dispatched — 그 서비스가 trigger를 받아들였다(202)
 *   running    — 그 서비스가 작업을 시작했다고 콜백했다
 *   succeeded / failed — 끝났다. 이후 어떤 콜백도 이 값을 바꾸지 않는다
 */
export const AUTO_RUN_STATUSES = ['queued', 'dispatched', 'running', 'succeeded', 'failed'] as const;
export type AutoRunStatus = (typeof AUTO_RUN_STATUSES)[number];
export const ACTIVE_AUTO_RUN_STATUSES: AutoRunStatus[] = ['queued', 'dispatched', 'running'];

/**
 * trigger를 보낸 순간의 source 하나 — payload에 실어 보낸 값을 그대로 남긴다. 나중에 그
 * artifact가 새 버전을 내도 이 기록은 바뀌지 않는다(발화 시점 고정, 사용자 결정 C4).
 */
@Schema({ _id: false })
export class AutoRunSource {
  @Prop({ required: true })
  nodeId: string;

  @Prop({ required: true })
  nodeName: string;

  @Prop({ required: true })
  artifactId: string;

  @Prop({ required: true })
  artifactName: string;

  @Prop({ type: String, required: true })
  tier: string;

  @Prop({ type: String, default: null })
  network: string | null;

  @Prop({ type: String, default: null })
  serviceKey: string | null;

  @Prop({ type: String, default: null })
  externalArtifactId: string | null;

  @Prop({ required: true })
  versionLabel: string;

  @Prop({ type: String, default: null })
  versionRef: string | null;

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;
}
export const AutoRunSourceSchema = SchemaFactory.createForClass(AutoRunSource);

export type AutoRunDocument = AutoRun & Document;

/**
 * Auto Run 실행 기록 한 건(설계서 10장 §5). node 슬라이드의 Auto Run 탭이 이 목록을 그대로
 * 보여준다. 이 문서의 `_id`가 그 서비스에 넘기는 `triggerRunId`다.
 */
@Schema({ collection: 'autoRuns', timestamps: true })
export class AutoRun {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Project', required: true, index: true })
  projectId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Workflow', required: true, index: true })
  workflowId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'WorkflowNode', required: true, index: true })
  nodeId: Types.ObjectId;

  /** trigger를 받은 쪽 — 이 node에 매핑된 artifact. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Artifact', required: true })
  artifactId: Types.ObjectId;

  /** 그 artifact의 서비스 — status 콜백은 이 서비스의 토큰으로만 받는다. */
  @Prop({ required: true })
  serviceKey: string;

  /** auto = source publish로 발화 / manual = 사용자가 "Run now"를 눌렀다. */
  @Prop({ type: String, required: true, enum: ['auto', 'manual'] })
  trigger: 'auto' | 'manual';

  /** manual이면 누른 사람, auto면 null. 실제 실행 계정(runAs)은 항상 시스템 계정이다(C9). */
  @Prop({ type: String, default: null })
  requestedBy: string | null;

  /** auto일 때 발화시킨 source 버전 — 어떤 publish가 이 실행을 불렀는지. */
  @Prop({ type: String, default: null })
  causeArtifactId: string | null;

  @Prop({ type: String, default: null })
  causeVersionLabel: string | null;

  @Prop({ type: [AutoRunSourceSchema], default: [] })
  sources: AutoRunSource[];

  @Prop({ type: String, required: true, enum: AUTO_RUN_STATUSES, default: 'queued', index: true })
  status: AutoRunStatus;

  /** 실패 사유 또는 그 서비스가 준 메시지. */
  @Prop({ type: String, default: null })
  message: string | null;

  /** 그 서비스가 알려준 자기 쪽 작업 id(선택). */
  @Prop({ type: String, default: null })
  externalJobId: string | null;

  /** 이 실행의 결과로 만들어진 버전(그 서비스가 콜백이나 version 이벤트에 실어 준 경우만). */
  @Prop({ type: String, default: null })
  resultVersionLabel: string | null;

  @Prop({ default: 0 })
  attempts: number;

  /**
   * 큐에 들어간 시각 — 목록 정렬 기준. timestamps의 createdAt 대신 명시 필드로 둔다: 인메모리
   * 드라이버는 timestamps를 채우지 않는다(database/in-memory-driver.ts).
   */
  @Prop({ type: Date, default: () => new Date() })
  queuedAt: Date;

  @Prop({ type: Date, default: null })
  dispatchedAt: Date | null;

  @Prop({ type: Date, default: null })
  startedAt: Date | null;

  @Prop({ type: Date, default: null })
  finishedAt: Date | null;

  _id: Types.ObjectId;
}

export const AutoRunSchema = SchemaFactory.createForClass(AutoRun);
AutoRunSchema.index({ nodeId: 1, queuedAt: -1 });
