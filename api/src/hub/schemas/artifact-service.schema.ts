import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** Hub 설계서 §5.1 - 통합 신뢰도 티어. */
export const TIERS = ['A', 'B', 'C', 'D'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * 전송 수단.
 * - http : Observer 계약 엔드포인트를 직접 호출 — OA Service/HPC Service(A/C) 전부 이것뿐이다
 * - none : 연동 없음 (D 전용)
 *
 * ★ `shared-db`(HPC-OA 공용 DB 주기 동기화)는 폐기했다 — HPC망과 양방향 API로 직접
 *   연동하기로 결정이 바뀌면서(설계서 04장 §2) 더 이상 쓰지 않는다.
 */
export const TRANSPORTS = ['http', 'none'] as const;
export type Transport = (typeof TRANSPORTS)[number];

export type ArtifactServiceDocument = ArtifactService & Document;

/**
 * 한 서비스(baseURL)가 여러 종류의 산출물을 낼 수 있다(설계서 07장 §3.1) — 예: SSM 하나가
 * "수식"과 "spec data"를 별도 종류로 냄. Service Manage에서 **종류별로 따로 등록**하며(구
 * "Add artifact type" 방식 폐지), 같은 baseURL로 등록하면 기존 서비스에 항목만 추가된다.
 *
 * `key`는 **SIREN이 등록 시점에 발급**한다(설계서 07장 §3.2) — `artifactTypeKey`로
 * Service Manage 화면에 노출되고, 그 서비스가 version 이벤트에 실어 보낸다.
 */
@Schema({ _id: false })
export class ArtifactType {
  /** SIREN이 발급 — `{8자리 랜덤}_{name 슬러그}` 형태(HubService#generateKey와 같은 방식). */
  @Prop({ required: true, trim: true })
  key: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '', trim: true })
  description: string;
}
export const ArtifactTypeSchema = SchemaFactory.createForClass(ArtifactType);

/**
 * Hub 레지스트리 (설계서 §3.2). 산출물을 워크플로우에 얹을 때 사용자는 이 목록에서
 * 서비스를 고른다 - 기존의 자유 입력 docType 방식은 폐기됐다.
 */
@Schema({ timestamps: true })
export class ArtifactService {
  /**
   * 불변 식별자. 산출물이 이 값으로 서비스를 참조하므로 이름이 바뀌어도 key는 유지한다
   * (설계서 §3.2). 생성 후 수정 불가 - 관리 화면에서도 읽기 전용으로 렌더한다.
   */
  @Prop({ required: true, unique: true, trim: true, index: true })
  key: string;

  @Prop({ required: true, trim: true })
  name: string;

  /** Service Manage 카드에 쓰는 짧은 설명. 순수 표시용, 계약에는 관여하지 않는다. */
  @Prop({ default: '', trim: true })
  description: string;

  /** Service Manage 카드에 그릴 favicon 이미지 URL. 비어 있으면 카드가 이니셜로 대체한다. */
  @Prop({ default: '', trim: true })
  icon: string;

  /** 이 서비스가 구현한 Observer 계약 버전. 응답 헤더와 다르면 경고만 남긴다(§4.5). */
  @Prop({ default: '1.0', trim: true })
  contractVersion: string;

  @Prop({ type: String, required: true, enum: TIERS, default: 'C' })
  defaultTier: Tier;

  @Prop({ type: String, required: true, enum: TRANSPORTS, default: 'none' })
  transport: Transport;

  /**
   * transport=http일 때 어댑터/서비스 엔드포인트의 베이스 URL. **토큰(`token`) 발급의
   * dedup 키이기도 하다** — 정규화(scheme+host, 끝 슬래시 제거)한 값이 이미 등록된
   * 서비스와 같으면 새 토큰을 만들지 않고 그 서비스에 artifact type만 추가한다
   * (설계서 07장 §3.3).
   */
  @Prop({ type: String, default: null, trim: true })
  baseUrl: string | null;

  /**
   * 이 서비스(baseURL)가 SIREN에 event를 보낼 때 쓰는 Bearer token — baseURL당 1개다
   * (설계서 07장 §3.2). SIREN이 등록 시점에 발급하고, 서비스를 비활성화하면 즉시
   * `null`로 폐기한다(§3.4) — 재활성화 시 새 토큰을 다시 발급한다.
   */
  @Prop({ type: String, default: null, index: true })
  token: string | null;

  /** 예: "https://ssm.local/spec/{artifactId}" — 등록 폼에서는 더 이상 입력받지 않는다
   * (버전 이벤트가 viewUrl을 직접 실어 보내므로, 설계서 07장 §4.1). 레거시 필드로 남긴다. */
  @Prop({ type: String, default: null, trim: true })
  viewUrlTemplate: string | null;

  /** null이면 SIREN이 자동으로 링크-아웃으로 폴백한다 - 임베드 미지원은 정상 상태다(§3.2). */
  @Prop({ type: String, default: null, trim: true })
  embedUploadUrlTemplate: string | null;

  /** Calypso만 true - 우리가 직접 만든 내장 서비스 #0. */
  @Prop({ default: false })
  isBuiltIn: boolean;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ default: false, index: true })
  isMock: boolean;

  /** 산출물 종류 목록(§19.1). 비어 있으면 서비스 자체가 단일 종류로 취급된다. */
  @Prop({ type: [ArtifactTypeSchema], default: [] })
  artifactTypes: ArtifactType[];

  _id: Types.ObjectId;
}

export const ArtifactServiceSchema = SchemaFactory.createForClass(ArtifactService);
// sparse — 토큰이 없는(null) 서비스가 여럿이어도 충돌하지 않는다(비활성화로 폐기된 경우 등).
ArtifactServiceSchema.index({ token: 1 }, { unique: true, sparse: true });
