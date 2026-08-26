import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
// @Prop의 런타임 type은 반드시 SchemaTypes.ObjectId를 쓴다 - Types.ObjectId(값 클래스)를 주면
// Mongoose가 Mixed 경로를 만들고, Mixed는 캐스팅을 하지 않아 문자열 id 필터가 전부 0건이 된다.
// (필드의 TypeScript 타입으로서의 Types.ObjectId는 그대로 쓴다.)

/**
 * 사용자는 KnoxID 문자열로만 참조한다 - api는 users 컬렉션을 갖지 않는다(src/common/actor.ts).
 * viewGrants[].department는 부여 시점에 명시적으로 지정하는 값이며 그 사용자의 실제
 * 소속과 다를 수 있다 (설계서 4.5) - 검증 없이 자유 입력.
 */
@Schema({ _id: false })
export class ViewGrant {
  @Prop({ required: true, trim: true })
  knoxId: string;

  @Prop({ required: true })
  department: string;

  @Prop({ default: () => new Date() })
  grantedAt: Date;
}
export const ViewGrantSchema = SchemaFactory.createForClass(ViewGrant);

/**
 * 이 workflow만의 일정 한 칸.
 *
 * 과제 마일스톤(Project.milestones)에서 복사되어 시작하지만 그 뒤로는 완전히
 * 독립이다 — workflow마다 칸 수도, 이름도, 날짜도 전부 다를 수 있고 서로 겹쳐도 된다.
 * 캔버스에서의 좌→우 순서는 저장하지 않고 start 오름차순으로 파생한다
 * (src/common/schedule.ts).
 *
 * ★ id는 산출물(Deliverable.phaseId)이 가리키는 식별자라 절대 재사용/변경하지 않는다.
 *   phase를 지우면 그 phase를 가리키던 산출물은 "일정을 잃은" 상태로 남는다 — 서버는
 *   그 산출물을 지우지도, 다른 phase로 옮기지도 않는다(사용자 요청). 그래야 캔버스에서
 *   원래 좌표 그대로 남아 "유실됨" 표시를 달 수 있다.
 */
@Schema({ _id: false })
export class WorkflowPhase {
  @Prop({ required: true })
  id: string;

  /** 화면에 그대로 뜨는 짧은 표기(예: 'KO', 'ML1'). full name은 저장하지 않는다. */
  @Prop({ required: true, trim: true })
  name: string;

  /** 'YYYY-MM-DD' */
  @Prop({ required: true })
  start: string;

  /** 'YYYY-MM-DD' */
  @Prop({ required: true })
  end: string;
}
export const WorkflowPhaseSchema = SchemaFactory.createForClass(WorkflowPhase);

export type WorkflowDocument = Workflow & Document;

/**
 * Workflow — 예전 이름은 IP였다. 설계 산출물 흐름 하나를 담는 단위이며 캔버스 하나에
 * 대응한다. 도메인(Analog/Digital/…) 단위 묶음은 그대로 유지된다.
 */
@Schema({ timestamps: true })
export class Workflow {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Project', required: true, index: true })
  projectId: Types.ObjectId;

  /** workflow가 속한 설계 도메인. 빈 문자열이면 FE가 UNASSIGNED로 묶는다 */
  @Prop({ default: '', trim: true, index: true })
  domain: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  /** 이 workflow만의 일정. 생성 시 과제 마일스톤을 복사해 채운다. */
  @Prop({ type: [WorkflowPhaseSchema], default: [] })
  phases: WorkflowPhase[];

  /**
   * owners[0] = 대표 담당자. KnoxID 문자열 배열이다.
   * Edit 권한은 Analog 부서만 가질 수 있으나(설계서 3.3, 4.5), api는 사용자의 소속을
   * 조회할 수 없으므로 owner 추가 요청이 함께 보낸 department 값으로 검증한다.
   */
  @Prop({ type: [String], default: [] })
  owners: string[];

  @Prop({ type: [ViewGrantSchema], default: [] })
  viewGrants: ViewGrant[];

  @Prop({ default: '#0c9a83' })
  color: string;

  /**
   * 목업 시드가 만든 문서 표시 (MOCKUP_ENABLED). 사용자가 실제로 만든 데이터는 항상 false다.
   * MOCKUP_ENABLED=false 로 바꾸고 재시작하면 isMock:true 문서만 일괄 삭제된다
   * (src/database/seed-runner.service.ts) - 실제 데이터는 절대 건드리지 않는다.
   */
  @Prop({ default: false, index: true })
  isMock: boolean;

  _id: Types.ObjectId;
}

export const WorkflowSchema = SchemaFactory.createForClass(Workflow);
WorkflowSchema.index({ owners: 1 });
WorkflowSchema.index({ 'viewGrants.knoxId': 1 });
