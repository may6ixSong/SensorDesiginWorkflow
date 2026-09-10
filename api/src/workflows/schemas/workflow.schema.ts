import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
// @Prop의 런타임 type은 반드시 SchemaTypes.ObjectId를 쓴다 - Types.ObjectId(값 클래스)를 주면
// Mongoose가 Mixed 경로를 만들고, Mixed는 캐스팅을 하지 않아 문자열 id 필터가 전부 0건이 된다.
import { AccessGrant, AccessGrantSchema, emptyAccessGrant } from '../../common/schemas/access-grant.schema';

/**
 * 이 workflow만의 일정 한 칸.
 *
 * 과제 마일스톤(Project.milestones)에서 복사되어 시작하지만 그 뒤로는 완전히
 * 독립이다 — workflow마다 칸 수도, 이름도, 날짜도 전부 다를 수 있고 서로 겹쳐도 된다.
 * 캔버스에서의 좌→우 순서는 저장하지 않고 start 오름차순으로 파생한다
 * (src/common/schedule.ts).
 *
 * ★ id는 블록(Block.phaseId)이 가리키는 식별자라 절대 재사용/변경하지 않는다.
 *   phase를 지우면 그 phase를 가리키던 블록은 "일정을 잃은" 상태로 남는다 — 서버는
 *   그 블록을 지우지도, 다른 phase로 옮기지도 않는다. 그래야 캔버스에서 원래 좌표
 *   그대로 남아 "유실됨" 표시를 달 수 있다.
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

/**
 * 캔버스 편집 단독 점유 (설계서 03장 §3).
 *
 * ★ 이 lock의 범위는 **캔버스뿐**이다. Workflow 문서 안에 같이 들어 있지만 workflow
 *   전체를 잠그지 않는다 — A가 캔버스를 편집하는 동안에도 B는 Name/Description/
 *   Department/Phase를 얼마든지 바꿀 수 있다. lock을 확인하는 것은 오직
 *   `PUT /workflows/:id/canvas`(blocks/edges/memos/layout 저장)뿐이다.
 * ★ 점유/갱신/해제는 이 필드만 원자적으로 $set 한다 — 문서 전체를 다시 쓰지 않는다.
 *   그래서 위의 다른 PATCH들과 서로 경쟁하지 않고, 트랜잭션도 필요 없다.
 */
@Schema({ _id: false })
export class CanvasLock {
  @Prop({ required: true, trim: true })
  holderKnoxId: string;

  @Prop({ type: Date, required: true })
  acquiredAt: Date;

  /** acquiredAt + TTL(10분). 하트비트로 갱신될 때마다 뒤로 밀린다. */
  @Prop({ type: Date, required: true })
  expiresAt: Date;
}
export const CanvasLockSchema = SchemaFactory.createForClass(CanvasLock);

export type WorkflowDocument = Workflow & Document;

/**
 * Workflow — 설계 산출물 흐름 하나를 담는 단위이며 캔버스 하나에 대응한다.
 */
@Schema({ timestamps: true })
export class Workflow {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Project', required: true, index: true })
  projectId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  /**
   * 이 workflow가 소속된 부서. 반드시 Project.departments 중 하나이며 **빈 값을 허용하지
   * 않는다** — 예전의 'unassigned' 개념은 폐지되었다(설계서 README §3.2).
   *
   * 생성 시 만든 사람이 그 과제에서 속한 부서 중 하나를 고르며(Admin은 전체 중에서),
   * 그 값이 곧 editAccess.departments에 자동으로 들어간다.
   *
   * 변경은 Edit Access 전원이 할 수 있고, 변경 시 서버가 하는 일은 정확히 셋뿐이다:
   *   1) editAccess.departments 에서 이전 department 제거
   *   2) editAccess.departments 에 새 department 추가
   *   3) 이 필드 갱신
   * 그 밖의 것(다른 부서, 개별 사용자, viewAccess)은 절대 건드리지 않는다(설계서 01장 §3.5).
   */
  @Prop({ required: true, trim: true, index: true })
  department: string;

  /**
   * 이 workflow의 대표 담당자. **정확히 1명이며 현재 이양·위임이 불가능하다**
   * (설계서 01장 §3.6). 생성자가 그대로 Owner가 된다.
   *
   * TODO: Owner 이양 요청이 오면 여기와 `PATCH /workflows/:id/owner` 를 연다.
   *       지금은 변경 UI도 API도 만들지 않는다.
   */
  @Prop({ required: true, trim: true, index: true })
  ownerKnoxId: string;

  /**
   * 편집 권한. 부서 다중 + 개별 사용자 다중이다.
   *
   * ★ departments 안에는 이 workflow의 `department`가 **항상 포함되어 있어야 하고,
   *   그 항목은 삭제할 수 없다 — Admin도 불가**하다(설계서 01장 §3.4). 교체는 오직
   *   department 변경으로만 일어난다.
   */
  @Prop({ type: AccessGrantSchema, default: emptyAccessGrant })
  editAccess: AccessGrant;

  /**
   * 열람 권한. edit과 **동시 등록을 허용**하며(부서 목록이 겹칠 수 있으므로),
   * 실효 권한은 항상 더 높은 Edit으로 계산한다(설계서 01장 §3.2).
   */
  @Prop({ type: AccessGrantSchema, default: emptyAccessGrant })
  viewAccess: AccessGrant;

  /** 이 workflow만의 일정. 생성 시 과제 마일스톤을 복사해 채운다. */
  @Prop({ type: [WorkflowPhaseSchema], default: [] })
  phases: WorkflowPhase[];

  /**
   * 캔버스에서 사용자가 조절한 Phase 레인 폭. phase.id → px. 지정하지 않은 phase는
   * FE가 기본값을 쓴다. 캔버스 PUT과 함께 저장된다.
   */
  @Prop({ type: Object, default: {} })
  phaseWidths: Record<string, number>;

  /** null이면 미점유. 캔버스 저장에만 관여한다 — 위 CanvasLock 주석 참고. */
  @Prop({ type: CanvasLockSchema, default: null })
  canvasLock: CanvasLock | null;

  /** 마지막으로 발행한 release 번호. 0에서 시작해 release마다 1씩 증가한다. */
  @Prop({ default: 0 })
  releaseSeq: number;

  @Prop({ default: '#0c9a83' })
  color: string;

  /**
   * 목업 시드가 만든 문서 표시 (MOCKUP_ENABLED). 사용자가 실제로 만든 데이터는 항상 false다.
   * MOCKUP_ENABLED=false 로 바꾸고 재시작하면 isMock:true 문서만 일괄 삭제된다.
   */
  @Prop({ default: false, index: true })
  isMock: boolean;

  _id: Types.ObjectId;
}

export const WorkflowSchema = SchemaFactory.createForClass(Workflow);
WorkflowSchema.index({ 'editAccess.departments': 1 });
WorkflowSchema.index({ 'editAccess.users': 1 });
WorkflowSchema.index({ 'viewAccess.departments': 1 });
WorkflowSchema.index({ 'viewAccess.users': 1 });
