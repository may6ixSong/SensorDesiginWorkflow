import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * 과제 공통 일정 = 마일스톤. 과제에 참여하는 모든 workflow가 공유하는 "큰 일정"이고,
 * workflow가 새로 만들어질 때 이 목록이 그 workflow의 phase 초기값으로 복사된다
 * (WorkflowsService.create). 복사된 뒤로는 완전히 독립이다 — 여기를 고쳐도 이미
 * 만들어진 workflow의 phase는 따라 바뀌지 않는다(사용자가 명시적으로 "과제 일정으로
 * 되돌리기"를 눌러야 한다).
 *
 * id는 생성 시 한 번 정해져 절대 바뀌지 않는 내부 식별자다 — name(화면에 뜨는 짧은
 * 표기, 예: 'KO', 'ML1')은 언제든 바꿀 수 있어야 하므로 이름을 키로 쓰지 않는다.
 * 별도의 order 필드는 두지 않는다: 순서는 항상 start 오름차순으로 파생된다
 * (src/common/schedule.ts의 sortSchedule).
 */
@Schema({ _id: false })
export class Milestone {
  @Prop({ required: true })
  id: string;

  /** 화면에 그대로 뜨는 짧은 표기. 약어의 full name을 따로 저장하지 않는다. */
  @Prop({ required: true, trim: true })
  name: string;

  /** 'YYYY-MM-DD' */
  @Prop({ required: true })
  start: string;

  /** 'YYYY-MM-DD' */
  @Prop({ required: true })
  end: string;
}
export const MilestoneSchema = SchemaFactory.createForClass(Milestone);

/**
 * 과제(Project) 단위 부서별 팀원 로스터 — workflow의 owners/viewGrants(접근 권한)와는
 * 별개 개념이다. 이 프로젝트에 실제로 참여하는 인원을 부서별로 보여주기 위한
 * 정보성 명단이며, department는 부여 시점에 자유 입력(사용자의 실제 소속과
 * 다를 수 있음 — ViewGrant.department와 동일한 패턴).
 *
 * 사용자는 KnoxID 문자열로만 참조한다 (api에는 users 컬렉션이 없다).
 */
@Schema({ _id: false })
export class ProjectMember {
  @Prop({ required: true, trim: true })
  knoxId: string;

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

  /**
   * 이 과제의 workflow가 고를 수 있는 설계 도메인 후보 목록 (Workflow.domain에 들어갈 값).
   * 위 domain(과제 자신의 분류)과는 다른 축이다 - 이쪽은 과제마다 자유롭게 편집하는
   * 목록이라 DEPARTMENTS 같은 전사 고정 상수로 두지 않는다
   * (PATCH /projects/:id/workflow-domains, ProjectsService.updateWorkflowDomains).
   */
  @Prop({ type: [String], default: [] })
  workflowDomains: string[];

  /**
   * 이 과제가 산출물 전달 부서로 인정하는 부서 목록 — 전사 고정 DEPARTMENTS(analog 등
   * 6종, common/constants/departments.ts)와는 별개 축이다. 그쪽은 recvDept(전달) 검증에
   * 계속 쓰이는 고정값이고, 이 목록은 "산출물을 누구/어느 부서로부터 받는지"(신규 기능,
   * Deliverable.sourceDept/sourceContact)를 표시할 때 프로젝트마다 자유롭게 추가/삭제하는
   * 후보 목록이다 - 설계 도메인이 아닌 부서는 이 시스템을 아예 쓰지 않을 수도 있어
   * 전사 고정값으로 두지 않는다(PATCH /projects/:id/departments).
   *
   * 신규 과제는 늘 이 6개로 시작한다: Analog · Digital · APS · PI/PD · Solution · PTE.
   * 이 필드가 없는(과거) 과제 문서는 ProjectsService.ensureDepartments가 처음 조회되는
   * 시점에 이 기본값으로 채워 저장한다 - 별도 마이그레이션 스크립트를 두지 않는다.
   */
  @Prop({ type: [String], default: [] })
  departments: string[];

  /**
   * 내부 마이그레이션 플래그 — departments를 한 번이라도 기본값으로 채운 적이 있는지.
   * departments.length===0만으로는 "아직 한 번도 안 채워진 과거 문서"와 "사용자가 전부
   * 지운 상태"를 구분할 수 없어서(둘 다 빈 배열) 별도 플래그를 둔다. true가 되고 나면
   * ProjectsService.ensureDepartments는 다시는 손대지 않는다 - 그래야 부서를 전부
   * 지우는 것도 정말로 "전부 지운" 상태로 유지된다. API 응답에는 노출하지 않는다.
   */
  @Prop({ default: false })
  departmentsSeeded: boolean;

  /** 과제 공통 일정. workflow phase의 기본값이자, 타임라인/3D 뷰의 배경 구간이 된다. */
  @Prop({ type: [MilestoneSchema], default: [] })
  milestones: Milestone[];

  /**
   * 과제 마일스톤(공통 일정)을 수정할 수 있는 사람 — Workflow의 owners(Edit 권한)와는
   * 별개 역할이다. Edit 권한이 있어도 Manager가 아니면 마일스톤을 못 고치고, 반대로
   * Manager라도 어느 workflow의 owner가 아니면 그 workflow의 캔버스/phase는 못 고친다.
   * KnoxID 문자열 배열인 이유는 Workflow.owners/viewGrants와 같은 패턴 — 이후 다른 role이
   * 필요해지면 이 옆에 새 배열 필드를 추가하면 된다(제너릭 role 테이블 대신).
   */
  @Prop({ type: [String], default: [] })
  managers: string[];

  @Prop({ default: 'ACTIVE' })
  status: string;

  @Prop({ type: [ProjectMemberSchema], default: [] })
  members: ProjectMember[];

  /**
   * 목업 시드가 만든 문서 표시 (MOCKUP_ENABLED). 사용자가 실제로 만든 데이터는 항상 false다.
   * MOCKUP_ENABLED=false 로 바꾸고 재시작하면 isMock:true 문서만 일괄 삭제된다
   * (src/database/seed-runner.service.ts) - 실제 데이터는 절대 건드리지 않는다.
   */
  @Prop({ default: false, index: true })
  isMock: boolean;

  _id: Types.ObjectId;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
