import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** Hub 설계서 §5.1 - 통합 신뢰도 티어. */
export const TIERS = ['A', 'B', 'C', 'D'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * 전송 수단. 의미 계약은 같고 수단만 다르다 (Hub 설계서 §4.2).
 * - http      : Observer 계약 엔드포인트를 직접 호출
 * - shared-db : HPC-OA 공용 DB의 테이블을 주기 동기화 (B 티어, §8)
 * - none      : 연동 없음. 링크나 수동 기록만 (C/D 티어)
 */
export const TRANSPORTS = ['http', 'shared-db', 'none'] as const;
export type Transport = (typeof TRANSPORTS)[number];

export type ArtifactServiceDocument = ArtifactService & Document;

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

  /** 이 서비스가 구현한 Observer 계약 버전. 응답 헤더와 다르면 경고만 남긴다(§4.5). */
  @Prop({ default: '1.0', trim: true })
  contractVersion: string;

  @Prop({ type: String, required: true, enum: TIERS, default: 'C' })
  defaultTier: Tier;

  @Prop({ type: String, required: true, enum: TRANSPORTS, default: 'none' })
  transport: Transport;

  /** transport=http일 때 어댑터/서비스 엔드포인트의 베이스 URL. */
  @Prop({ type: String, default: null, trim: true })
  baseUrl: string | null;

  /** 예: "https://ssm.local/spec/{artifactId}" */
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

  _id: Types.ObjectId;
}

export const ArtifactServiceSchema = SchemaFactory.createForClass(ArtifactService);
