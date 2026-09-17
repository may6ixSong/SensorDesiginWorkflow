import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** Calypso가 지금 지원하는 network 값 — null이면 File(파일 업로드)이라 망 구분이 없다
 * (SIREN 설계서 04장 §2, §6 — Tier D 폐기 후 이 서비스가 그 역할을 흡수했다). */
export type CalypsoNetwork = 'OA' | 'HPC' | null;

/** File 콘텐츠의 파일 한 개. 한 버전이 여러 개를 가질 수 있다(§3.9). */
@Schema({ _id: false, timestamps: false })
export class ArtifactFile {
  @Prop({ required: true })
  fileName: string;

  /** 오브젝트 스토리지 키. Calypso의 S3_FOLDER 아래에 있다 (§3.7). */
  @Prop({ required: true })
  storageKey: string;
}
export const ArtifactFileSchema = SchemaFactory.createForClass(ArtifactFile);

/**
 * Calypso가 소유하는 버전. **여기가 실물(또는 참조)의 집이다** - SIREN은 이 값을
 * 참조로만 관측한다(Hub 설계서 §1.2).
 *
 * 우리가 직접 만드는 서비스이므로 major.minor 규칙을 그대로 강제한다(§6.1):
 * 업로드 = minor +1(최초 0.1), Release = major +1 · minor 0.
 *
 * ★ §3.9 — Artifact.network에 따라 이 버전이 들고 있는 콘텐츠 필드가 갈린다(셋 중
 *   정확히 하나만 채워진다는 불변식은 서비스 계층이 지킨다, 스키마는 강제하지 않는다):
 *     network === null   → `files`(여러 개 가능, §3.9)
 *     network === 'OA'   → `viewUrl`(링크 하나)
 *     network === 'HPC'  → `hpcPath`(경로 하나)
 *   이 확장 전에는 fileName/storageKey 단수 필드였다 — Tier D(External/Attested) 폐기와
 *   함께 그 역할(경로/링크만 있고 실물이 없는 산출물)을 이 서비스가 흡수하면서 넓어졌다.
 */
@Schema({ _id: false, timestamps: false })
export class ArtifactVersion {
  @Prop({ required: true })
  major: number;

  @Prop({ required: true })
  minor: number;

  /** 가시성 판정의 근거. SIREN에는 이 값이 그대로 전달된다 (§4.1). */
  @Prop({ required: true, default: false })
  isReleased: boolean;

  /** 불변 참조. 한번 발급하면 다른 내용을 가리키게 바뀌지 않는다 (§6.3). */
  @Prop({ required: true, unique: false })
  versionRef: string;

  /** network === null(File)일 때만. 한 버전에 여러 파일을 묶을 수 있다(§3.9). */
  @Prop({ type: [ArtifactFileSchema], default: [] })
  files: ArtifactFile[];

  /** network === 'OA'일 때만 — 그 산출물이 실제로 있는 곳의 웹 링크. */
  @Prop({ type: String, default: null })
  viewUrl: string | null;

  /** network === 'HPC'일 때만 — 그 산출물이 실제로 있는 HPC망 경로. */
  @Prop({ type: String, default: null })
  hpcPath: string | null;

  /**
   * 짧은 한 줄 메모 — 이 버전에서 뭐가 바뀌었는지, 필수(사용자 요청: 버전을 올리거나
   * publish할 때 항상 적어야 한다). 서식 없는 일반 텍스트다 — 서식 있는 긴 설명은
   * `description`으로 분리했다.
   *
   * ★ 예전에는 이 자리(그때 이름은 `note`)가 서식 있는 HTML이었다 — 그 값은 이제
   *   `description`으로 옮겨간다(마이그레이션 필요, 앱 차원에서는 여기서 더 신경쓰지
   *   않는다). 새 문서는 전부 이 필드를 쓴다.
   */
  @Prop({ default: '' })
  versionNote: string;

  /** 서식 있는(HTML) 긴 설명 — 선택. 렌더링하는 쪽이 반드시 sanitize해야 한다. */
  @Prop({ default: '' })
  description: string;

  /** 이 버전을 올린 사람의 KnoxID = giver (§4.1). */
  @Prop({ required: true, trim: true })
  createdBy: string;

  @Prop({ type: String, default: null })
  createdByDept: string | null;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}
export const ArtifactVersionSchema = SchemaFactory.createForClass(ArtifactVersion);

export type ArtifactDocument = Artifact & Document;

/**
 * 권한 부여 한 건 — 개인(knoxId) 또는 부서(department) 단위. 등록자·Admin은 이 목록에
 * 없어도 항상 edit이므로 여기 담기지 않는다 — 이 배열은 그 외에 "추가로" 부여된 것만.
 *
 * edit 부여는 부서 단위일 때 **부여자 본인 소속 부서로만** 제한한다 — 서비스 컨트롤러에서
 * 검증한다(department가 analog 단위라 타 부서에 통째로 주면 그 안의 관련 없는 IP까지
 * 편집권이 퍼지기 때문 — 사용자 요청). view 부여는 부서 제한이 없다.
 */
@Schema({ _id: false, timestamps: false })
export class ArtifactGrant {
  @Prop({ required: true, enum: ['user', 'department'] })
  type: 'user' | 'department';

  /** type==='user'일 때만. */
  @Prop({ type: String, default: null, trim: true })
  knoxId: string | null;

  /** type==='department'일 때만. */
  @Prop({ type: String, default: null, trim: true })
  department: string | null;

  @Prop({ required: true, trim: true })
  grantedBy: string;

  @Prop({ default: () => new Date() })
  grantedAt: Date;
}
export const ArtifactGrantSchema = SchemaFactory.createForClass(ArtifactGrant);

/**
 * Calypso의 산출물. **project + department로만 스코프된다 - workflow 개념을 모른다**
 * (Hub 설계서 §11.4). 어느 workflow가 이걸 가져다 쓰는지는 SIREN 쪽 관심사이며,
 * 같은 산출물이 여러 workflow에 동시에 걸릴 수 있다.
 */
@Schema({ timestamps: true })
export class Artifact {
  /** SIREN의 프로젝트 id. Calypso는 프로젝트를 소유하지 않고 참조만 한다. */
  @Prop({ required: true, index: true })
  projectId: string;

  /** SIREN 공용 데이터(§4.4)의 부서 목록에서 고른 값. */
  @Prop({ required: true, trim: true, index: true })
  department: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  /**
   * null(기본) = File — 실물을 이 서비스가 들고 있다(여러 개 가능, §3.9). 'OA'/'HPC'면
   * 실물이 없고 각 버전의 viewUrl/hpcPath가 "어디 있는지"만 가리킨다. 등록 시점에
   * 한 번 정해지면 그 artifact의 남은 삶 동안 바뀌지 않는다 — 다른 콘텐츠 종류가
   * 필요하면 새 artifact를 등록하고 SIREN 쪽에서 재매핑한다(설계서 04장 §6.6).
   */
  @Prop({ type: String, enum: ['OA', 'HPC', null], default: null })
  network: CalypsoNetwork;

  @Prop({ type: [ArtifactVersionSchema], default: [] })
  versions: ArtifactVersion[];

  /** 등록한 사람의 KnoxID. My Task 필터(§14.3)가 이 값으로 거른다. */
  @Prop({ required: true, trim: true, index: true })
  createdBy: string;

  @Prop({ default: false, index: true })
  isMock: boolean;

  /** 등록자·Admin 외에 추가로 edit 권한을 받은 사람/부서(본인 부서만). */
  @Prop({ type: [ArtifactGrantSchema], default: [] })
  editors: ArtifactGrant[];

  /** view 권한을 받은 사람/부서 — 어느 부서든 가능(수신 부서 handoff 등). */
  @Prop({ type: [ArtifactGrantSchema], default: [] })
  viewGrants: ArtifactGrant[];

  /**
   * false(기본) — view는 project member 누구에게나 열려 있다(edit은 그대로 editors만).
   * true — view도 등록자/editors/viewGrants로만 좁힌다(예전 동작 그대로, 사용자 요청).
   * "project member"는 이 서비스에 도달하는 모든 호출이 이미 그 뜻이다 — SIREN BE가
   * 프록시(calypso-proxy.controller.ts)에서 project 멤버십을 먼저 확인한 뒤에만 여기로
   * 넘어오고, `ArtifactsController` 전체가 SIREN BE 전용(`SirenCallerGuard`)이라 그 외
   * 경로로는 여기 도달하지 않는다.
   */
  @Prop({ default: false })
  restrictView: boolean;

  _id: Types.ObjectId;
}

export const ArtifactSchema = SchemaFactory.createForClass(Artifact);
ArtifactSchema.index({ projectId: 1, department: 1 });
