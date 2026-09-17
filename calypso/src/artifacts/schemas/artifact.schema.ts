import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Calypso가 지금 지원하는 network 값 — OA 또는 HPC 둘 중 하나다(사용자 요청: 예전에는
 * null이 "File" 콘텐츠 종류를 뜻했지만, 이제 파일 업로드는 OA/HPC 어느 쪽이든 똑같이
 * 할 수 있어서 network는 더 이상 콘텐츠 종류를 가리지 않는다 — 순수하게 "이 artifact가
 * OA망 소속인지 HPC망 소속인지"만 뜻한다). null은 예전 문서(마이그레이션 전)에만 남아있다.
 */
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

/** OA 콘텐츠 하나 — 링크와, 그 링크가 뭘 가리키는지 짧은 설명(사용자 요청: 여러 개
 * 가능해야 하고 각각 뭘 지칭하는지 적을 수 있어야 한다). */
@Schema({ _id: false, timestamps: false })
export class ArtifactLink {
  @Prop({ required: true })
  url: string;

  @Prop({ default: '', trim: true })
  label: string;
}
export const ArtifactLinkSchema = SchemaFactory.createForClass(ArtifactLink);

/** HPC 콘텐츠 하나 — 경로와, 그 경로가 뭘 가리키는지 짧은 설명. ArtifactLink와 같은 이유로 배열이다. */
@Schema({ _id: false, timestamps: false })
export class ArtifactPath {
  @Prop({ required: true })
  path: string;

  @Prop({ default: '', trim: true })
  label: string;
}
export const ArtifactPathSchema = SchemaFactory.createForClass(ArtifactPath);

/**
 * Calypso가 소유하는 버전. **여기가 실물(또는 참조)의 집이다** - SIREN은 이 값을
 * 참조로만 관측한다(Hub 설계서 §1.2).
 *
 * 우리가 직접 만드는 서비스이므로 major.minor 규칙을 그대로 강제한다(§6.1):
 * 업로드 = minor +1(최초 0.1), Release = major +1 · minor 0.
 *
 * ★ §3.9 — 파일/링크/경로는 서로 배타적이지 않다(사용자 요청) — 한 버전이 파일도
 *   올리고, 그 위에 링크나 경로도 여러 개 같이 가질 수 있다. `links`는 network==='OA'인
 *   artifact에서만 쓰고, `paths`는 'HPC'인 artifact에서만 쓴다 — 그 구분만 network가
 *   한다. 최소한 파일 하나 또는 (그 network에 맞는) 링크/경로 하나는 있어야 한다는
 *   불변식은 서비스 계층이 지킨다.
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

  /** 한 버전에 여러 파일을 묶을 수 있다(§3.9) — network와 무관하게 항상 올릴 수 있다. */
  @Prop({ type: [ArtifactFileSchema], default: [] })
  files: ArtifactFile[];

  /** network==='OA'인 artifact에서만 쓴다 — 여러 개 가능(사용자 요청). */
  @Prop({ type: [ArtifactLinkSchema], default: [] })
  links: ArtifactLink[];

  /** network==='HPC'인 artifact에서만 쓴다 — 여러 개 가능(사용자 요청). */
  @Prop({ type: [ArtifactPathSchema], default: [] })
  paths: ArtifactPath[];

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
   * 'OA' 또는 'HPC' — 등록 시점에 정해야 한다(사용자 요청). 언제든 admin/editor가
   * 다시 고를 수 있다(`setNetwork`) — 파일 업로드는 어느 쪽이든 항상 가능하고, 이
   * 값은 그 버전의 링크(OA)/경로(HPC) 중 어느 배열을 쓸지만 가른다. null은 이
   * 구분이 생기기 전(예전엔 "File" 콘텐츠 종류였다) 문서에만 남아있다 — 마이그레이션
   * 전까지는 그런 문서에 새 버전을 추가하기 전에 먼저 network를 설정해야 한다.
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
