import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Phase는 이 시스템에서 읽기 전용 참조 (설계서 3.2, 4.4).
 * 이번 개발 범위에는 phases를 쓰는 API가 없다 - 향후 별도 "프로젝트 설정" 서비스가 채운다는 가정.
 */
@Schema({ _id: false })
export class PhaseRef {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  start: string;

  @Prop({ required: true })
  end: string;

  @Prop({ required: true })
  order: number;
}
export const PhaseRefSchema = SchemaFactory.createForClass(PhaseRef);

/**
 * 과제(Project) 단위 부서별 팀원 로스터 — IP의 owners/viewGrants(접근 권한)와는
 * 별개 개념이다. 이 프로젝트에 실제로 참여하는 인원을 부서별로 보여주기 위한
 * 정보성 명단이며, department는 부여 시점에 자유 입력(사용자의 실제 소속과
 * 다를 수 있음 — ViewGrant.department와 동일한 패턴).
 */
@Schema({ _id: false })
export class ProjectMember {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  department: string;

  @Prop({ default: () => new Date() })
  addedAt: Date;
}
export const ProjectMemberSchema = SchemaFactory.createForClass(ProjectMember);

export type ProjectDocument = Project & Document;

@Schema({ timestamps: true })
export class Project {
  @Prop({ required: true, unique: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: 'ANALOG' })
  domain: string;

  @Prop({ type: [PhaseRefSchema], default: [] })
  phases: PhaseRef[];

  @Prop({ default: 'ACTIVE' })
  status: string;

  @Prop({ type: [ProjectMemberSchema], default: [] })
  members: ProjectMember[];

  _id: Types.ObjectId;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
