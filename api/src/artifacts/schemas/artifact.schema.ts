import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
// @Prop의 런타임 type은 반드시 SchemaTypes.ObjectId를 쓴다 - Types.ObjectId(값 클래스)를 주면
// Mongoose가 Mixed 경로를 만들고, Mixed는 캐스팅을 하지 않아 문자열 id 필터가 전부 0건이 된다.
import { AccessGrant, AccessGrantSchema, emptyAccessGrant } from '../../common/schemas/access-grant.schema';
import { TIERS, Tier } from '../../common/constants/tier';

export type NetworkKind = 'OA' | 'HPC';

/** lineage - 이 버전이 무엇으로부터 만들어졌는가 (observer 계약 §4.1). */
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
 * 버전(publish) 엔트리 하나.
 *
 * ★ 용어 — 산출물이 자기 서비스 안에서 공식 버전을 확정하는 것이 **publish**이고,
 *   workflow가 부서에 전달하는 것이 **release**다. 그래서 이 플래그는 isPublished다
 *   (구 isReleased에서 개명 — 설계서 04장 §8).
 *
 * A Tier 서비스는 **official하게 확정된 값만** 넘긴다(설계서 04장 §2.1):
 *   - minor까지 명확히 태깅되어 있으면 그대로 (`v1.3`)
 *   - RPM처럼 minor 개념이 없고 snapshot만 찍는 서비스는 release 버전들 + `latest+` 하나
 *     (`latest+`는 isPublished:false인 작업중 자리표시자라 giver에게만 보인다)
 */
@Schema({ _id: false, timestamps: false })
export class ArtifactVersion {
  /**
   * 이 엔트리를 SIREN이 얼마나 자동으로·검증 가능하게 알았는지 (설계서 04장 §2).
   * 산출물 단위가 아니라 엔트리 단위라서, 나중에 실연동이 붙어도 예전 수동 기록을
   * 지우거나 옮길 필요가 없다 - 다음 엔트리가 다른 tier로 찍힐 뿐이다.
   */
  @Prop({ type: String, required: true, enum: TIERS, default: 'C' })
  tier: Tier;

  /** 표시용 자유 문자열. major.minor 규칙은 SIREN이 직접 만드는 서비스에만 강제한다. */
  @Prop({ required: true, trim: true })
  versionLabel: string;

  /** 가시성 판정은 오직 이 필드로만 한다 (설계서 04장 §7). */
  @Prop({ required: true, default: false })
  isPublished: boolean;

  /**
   * 그 서비스가 준 불변 참조. Release 기록이 이 값을 고정한다.
   * C/D 티어(수동 기록)는 참조할 실체가 없으므로 null이다.
   */
  @Prop({ type: String, default: null })
  versionRef: string | null;

  /** 이 버전을 만들어 제공한 쪽. */
  @Prop({ type: String, default: null })
  giverKnoxId: string | null;

  @Prop({ type: String, default: null })
  giverDept: string | null;

  @Prop({ type: [SourceRefSchema], default: [] })
  sourceRefs: SourceRef[];

  /** 그 서비스의 산출물 상세 페이지. SIREN은 이 링크로 내보낸다. */
  @Prop({ type: String, default: null })
  viewUrl: string | null;

  /** HPC망은 실물 파일 대신 경로 문자열만 갖는다 (tier와 직교하는 축). */
  @Prop({ type: String, default: null })
  hpcPath: string | null;

  /** 이 산출물 자신의 publish note. release가 복제해 저장하지 않는다(설계서 05장 §4.3). */
  @Prop({ default: '' })
  note: string;

  // --- C/D 티어 전용 (수동 기록) ---
  @Prop({ type: String, default: null })
  assertedBy: string | null;

  @Prop({ type: Date, default: null })
  assertedAt: Date | null;

  // --- A/B 티어 전용 (관측) ---
  @Prop({ type: Date, default: null })
  observedAt: Date | null;

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}
export const ArtifactVersionSchema = SchemaFactory.createForClass(ArtifactVersion);

export type ArtifactDocument = Artifact & Document;

/**
 * 산출물의 **실체**다 — 캔버스 위의 자리(Block)와 분리되어 있다(설계서 04장 §1).
 * 같은 artifact가 여러 workflow의 캔버스에 놓여도 권한과 버전 이력은 하나다.
 *
 * ★ 스코프는 과제(project) 단위다. block을 매핑할 때 artifact.projectId가 그 workflow의
 *   projectId와 다르면 거부한다 — `code`가 같아도 `revision`이 다르면 다른 project이므로
 *   자연히 후보에서 빠진다(설계서 04장 §1.1).
 */
@Schema({ timestamps: true })
export class Artifact {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Project', required: true, index: true })
  projectId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  /** versions[0].tier를 캐시한 값 — "현재 tier"다. */
  @Prop({ type: String, required: true, enum: TIERS, default: 'D', index: true })
  tier: Tier;

  @Prop({ type: String, required: true, enum: ['OA', 'HPC'], default: 'OA' })
  network: NetworkKind;

  // --- 출처 매핑 ---
  /** 이 산출물의 실물을 소유한 Hub 서비스 (artifactServices.key). A/B는 필수, C/D는 null 가능. */
  @Prop({ type: String, default: null, trim: true, index: true })
  serviceKey: string | null;

  @Prop({ type: String, default: null, trim: true })
  externalArtifactId: string | null;

  /** 그 서비스의 artifactTypes 중 어느 종류인지 — 단일 종류 서비스면 항상 null. */
  @Prop({ type: String, default: null, trim: true })
  artifactTypeKey: string | null;

  /** C 티어의 링크(자동 갱신 없이 링크만 있는 경우). */
  @Prop({ type: String, default: null, trim: true })
  externalUrl: string | null;

  /**
   * --- 권한 (B/C/D 전용) ---
   *
   * ★ tier === 'A'이면 쓰지 않는다. 값이 들어와도 서비스가 무시하고 응답에서도 비운다 —
   *   A의 권한은 전적으로 그 서비스가 판정한다(설계서 04장 §3).
   * ★ viewAccess가 곧 recipient다. B/C/D는 Calypso나 HPC 공용 DB처럼 권한이 한 군데서
   *   중앙 관리되므로, 이 목록이 그 artifact를 참조하는 **모든 workflow에 동일하게** 적용된다.
   */
  @Prop({ type: AccessGrantSchema, default: emptyAccessGrant })
  editAccess: AccessGrant;

  @Prop({ type: AccessGrantSchema, default: emptyAccessGrant })
  viewAccess: AccessGrant;

  // A Tier의 recipient는 여기 없다 — workflow마다 달라질 수 있어 Block.recipients에 있다.

  /** publish 이력. 최신 버전이 배열 앞(index 0)에 오도록 유지한다. */
  @Prop({ type: [ArtifactVersionSchema], default: [] })
  versions: ArtifactVersion[];

  @Prop({ required: true, trim: true })
  createdBy: string;

  @Prop({ default: false, index: true })
  isMock: boolean;

  _id: Types.ObjectId;
}

export const ArtifactSchema = SchemaFactory.createForClass(Artifact);
// 같은 (serviceKey, externalArtifactId)는 과제 안에서 하나여야 한다 — 여러 workflow가
// 그 하나를 공유하는 것이 정상이고, 중복 생성되면 권한이 갈라진다.
ArtifactSchema.index({ projectId: 1, serviceKey: 1, externalArtifactId: 1 });
ArtifactSchema.index({ 'viewAccess.departments': 1 });
ArtifactSchema.index({ 'editAccess.departments': 1 });
