import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
import { TIERS, Tier } from '../../common/constants/tier';
import { AccessGrant, AccessGrantSchema, emptyAccessGrant } from '../../common/schemas/access-grant.schema';

/**
 * release 기록 안에 얼려두는 버전 사실. 이후 그 서비스가 버전을 더 올려도 이 값은
 * 그때 그 버전을 계속 가리킨다(설계서 05장 §5).
 */
@Schema({ _id: false })
export class ReleasedVersion {
  @Prop({ required: true })
  versionLabel: string;

  @Prop({ type: String, default: null })
  versionRef: string | null;

  /** 변경 감지(major 비교)에 쓴 키. 다시 계산하지 않고 그대로 보존한다. */
  @Prop({ type: String, default: null })
  majorKey: string | null;

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;

  @Prop({ type: String, default: null })
  viewUrl: string | null;

  @Prop({ type: String, default: null })
  hpcPath: string | null;

  @Prop({ type: String, default: null })
  giverKnoxId: string | null;
}
export const ReleasedVersionSchema = SchemaFactory.createForClass(ReleasedVersion);

/**
 * 이 산출물이 무엇으로부터 만들어졌는지 — flow 직전 1홉 upstream(설계서 05장 §4.2).
 * selected가 null이면 그 source가 아직 한 번도 publish되지 않았다는 뜻이고, 받는 쪽에는
 * "아직 전달되지 않음"으로 보인다. release를 막지는 않는다.
 */
@Schema({ _id: false })
export class ReleaseItemSource {
  @Prop({ required: true })
  nodeId: string;

  @Prop({ type: String, default: null })
  artifactId: string | null;

  @Prop({ required: true })
  artifactName: string;

  @Prop({ type: ReleasedVersionSchema, default: null })
  selected: ReleasedVersion | null;
}
export const ReleaseItemSourceSchema = SchemaFactory.createForClass(ReleaseItemSource);

@Schema({ _id: false })
export class ReleaseItem {
  @Prop({ required: true })
  nodeId: string;

  @Prop({ required: true })
  artifactId: string;

  /** 그 시점 이름. 이후 산출물명이 바뀌어도 이력은 그대로 남는다. */
  @Prop({ required: true })
  artifactName: string;

  @Prop({ type: String, required: true, enum: TIERS })
  tier: Tier;

  /** File(B) 콘텐츠는 network가 없다(null) — artifact.schema.ts의 NetworkKind와 같은 뜻이다. */
  @Prop({ type: String, enum: ['OA', 'HPC', null], default: null })
  network: string | null;

  @Prop({ required: true })
  phaseId: string;

  @Prop({ default: '' })
  phaseName: string;

  /** null = 한 번도 publish된 적 없음. 표에는 `Not published`로 표기한다. */
  @Prop({ type: ReleasedVersionSchema, default: null })
  published: ReleasedVersion | null;

  /** 직전 release 대비 majorKey가 달라졌는가 — 표에서 highlight되는 행이다. */
  @Prop({ default: false })
  changed: boolean;

  /** 이 release에서 처음 등장한 산출물인가. */
  @Prop({ default: false })
  firstTime: boolean;

  /**
   * 그 시점 확정값. 이후 권한이 바뀌어도 "그때 누가 받았는지"는 이 값으로 남는다.
   * A/B/C 전부 그 node.recipients를 그대로 담는다(설계서 05장 §6.2).
   */
  @Prop({ type: AccessGrantSchema, default: emptyAccessGrant })
  recipients: AccessGrant;

  @Prop({ type: [ReleaseItemSourceSchema], default: [] })
  sources: ReleaseItemSource[];

  /** 연동 서비스 조회에 실패해 SIREN의 마지막 관측값을 쓴 경우 true. release는 막지 않는다. */
  @Prop({ default: false })
  lookupFailed: boolean;
}
export const ReleaseItemSchema = SchemaFactory.createForClass(ReleaseItem);

export type ReleaseDocument = Release & Document;

/**
 * workflow가 부서에게 산출물을 전달한 기록(설계서 05장).
 *
 * ★ 캔버스 스냅샷을 담지 않는다 — 좌표/flow/phase를 재현하지 않고, 표 형태의 산출물
 *   목록만 남긴다(설계서 05장 §5).
 * ★ 생성 후 수정·삭제 불가다. Revoke도 없다. 그래서 이 스키마를 쓰는 서비스에는
 *   update/delete 메서드를 아예 두지 않는다(설계서 05장 §4.5).
 */
@Schema({ timestamps: true })
export class Release {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Project', required: true, index: true })
  projectId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Workflow', required: true, index: true })
  workflowId: Types.ObjectId;

  /** workflow별 1부터 증가하는 단일 정수. 화면에는 `v1`, `v2`, `v3` … 로 표기한다. */
  @Prop({ required: true })
  seq: number;

  @Prop({ type: Date, default: () => new Date() })
  releasedAt: Date;

  @Prop({ required: true, trim: true })
  releasedBy: string;

  /** release 전체에 1개. 필수 입력이다. */
  @Prop({ default: '' })
  note: string;

  /**
   * 그 시점의 workflow 표기. `department`는 `Project.departments[].id`이며(설계서
   * 02장 §9) — 이후 이름이 바뀌어도(id는 불변) 지금 이름을 그대로 다시 찾아 보여준다,
   * 즉 개명은 자동으로 반영된다(그게 이번 개정의 취지다). `departmentLabel`은 그 순간의
   * 이름을 **그대로 얼려 둔 대체값**이다(02장 §9.4) — 그 id가 나중에 삭제되어 더 이상
   * `Project.departments`에서 찾을 수 없는 극단적인 경우에만 쓴다.
   */
  @Prop({ type: Object, default: () => ({ name: '', department: '', departmentLabel: '' }) })
  workflowAt: { name: string; department: string; departmentLabel: string };

  @Prop({ type: [ReleaseItemSchema], default: [] })
  items: ReleaseItem[];

  /**
   * 이 release가 **겨냥한** 부서(`Project.departments[].id`) — 스펙 §4.1.
   *
   * ★ 항상 `targetDepartments ⊆ recipientDepartments` 다. 타겟에 넣었지만 받을 산출물이
   *   없던 부서는 떨어진다.
   * ★ All로 냈으면 실제로 받은 부서 전체가 되어 `recipientDepartments`와 같아진다.
   * ★ `targetDepartments=[A]`, `recipientDepartments=[A,B]` 는 "A를 겨냥했고, recipient가
   *   겹치는 산출물 때문에 B로 번졌다"는 뜻이다(스펙 §2.2).
   */
  @Prop({ type: [String], default: [], index: true })
  targetDepartments: string[];

  /**
   * 조회 최적화용 파생 필드 — items 안의 모든 수신 부서/사용자를 평탄화해 담는다.
   * 부서별 필터 뷰(설계서 05장 §7.2)가 이 필드로 인덱스 조회한다.
   */
  @Prop({ type: [String], default: [], index: true })
  recipientDepartments: string[];

  @Prop({ type: [String], default: [], index: true })
  recipientUsers: string[];

  @Prop({ default: false, index: true })
  isMock: boolean;

  _id: Types.ObjectId;
}

export const ReleaseSchema = SchemaFactory.createForClass(Release);
ReleaseSchema.index({ workflowId: 1, seq: -1 });
ReleaseSchema.index({ projectId: 1, releasedAt: -1 });
ReleaseSchema.index({ recipientDepartments: 1, releasedAt: -1 });
ReleaseSchema.index({ 'items.artifactId': 1, releasedAt: -1 });
// --- My Assignment (설계서 09장) ---
// "내가/내 부서가 받은 것"은 recipientDepartments·recipientUsers로, "내가/내 부서가 낸 것"은
// releasedBy·workflowAt.department로 과제 경계를 넘어 가로질러 조회한다. 달력 탭은 여기에
// releasedAt 범위를 더해 그 달만 읽는다 — 어느 경로로 들어와도 releasedAt이 정렬 키라서
// 복합 인덱스의 뒤쪽에 둔다.
ReleaseSchema.index({ recipientUsers: 1, releasedAt: -1 });
ReleaseSchema.index({ releasedBy: 1, releasedAt: -1 });
ReleaseSchema.index({ 'workflowAt.department': 1, releasedAt: -1 });
ReleaseSchema.index({ releasedAt: -1 });
ReleaseSchema.index({ targetDepartments: 1, releasedAt: -1 });
