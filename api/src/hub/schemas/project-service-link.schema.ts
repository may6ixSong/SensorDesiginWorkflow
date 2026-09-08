import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

export type ProjectServiceLinkDocument = ProjectServiceLink & Document;

/**
 * SIREN project(code+revision)와 외부 서비스 쪽 project를 잇는 명시적 링크(설계서 §19).
 * code+revision만으로는 유일하지 않을 수 있어(예: RPM) **항상 사람이 후보 중에서 골라
 * 확정**한다 — SIREN이 자동으로 추론/연결하지 않는다.
 *
 * 같은 (projectId, serviceKey) 조합에 링크가 여러 개 있을 수 있다 — 그 서비스 안에서
 * 같은 SIREN project에 대응하는 project가 여러 개로 흩어져 있는 경우다. 그래서 유니크
 * 인덱스는 (projectId, serviceKey, externalProjectId) 조합에만 건다.
 */
@Schema({ timestamps: true })
export class ProjectServiceLink {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Project', required: true, index: true })
  projectId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  serviceKey: string;

  /** 그 서비스 안에서의 project 식별자(key 또는 uuid 등) — searchProjects() 후보 중 확정된 값. */
  @Prop({ required: true, trim: true })
  externalProjectId: string;

  @Prop({ trim: true, default: '' })
  displayName: string;

  @Prop({ required: true, trim: true })
  linkedBy: string;

  _id: Types.ObjectId;
}

export const ProjectServiceLinkSchema = SchemaFactory.createForClass(ProjectServiceLink);
ProjectServiceLinkSchema.index({ projectId: 1, serviceKey: 1, externalProjectId: 1 }, { unique: true });
