import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Calypso가 소유하는 버전. **여기가 실물의 집이다** - SIREN은 이 값을 참조로만
 * 관측한다(Hub 설계서 §1.2).
 *
 * 우리가 직접 만드는 서비스이므로 major.minor 규칙을 그대로 강제한다(§6.1):
 * 업로드 = minor +1(최초 0.1), Release = major +1 · minor 0.
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

  @Prop({ required: true })
  fileName: string;

  /** 오브젝트 스토리지 키. Calypso의 S3_FOLDER 아래에 있다 (§3.7). */
  @Prop({ type: String, default: null })
  storageKey: string | null;

  @Prop({ default: '' })
  note: string;

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

  @Prop({ type: [ArtifactVersionSchema], default: [] })
  versions: ArtifactVersion[];

  /** 등록한 사람의 KnoxID. My Task 필터(§14.3)가 이 값으로 거른다. */
  @Prop({ required: true, trim: true, index: true })
  createdBy: string;

  @Prop({ default: false, index: true })
  isMock: boolean;

  _id: Types.ObjectId;
}

export const ArtifactSchema = SchemaFactory.createForClass(Artifact);
ArtifactSchema.index({ projectId: 1, department: 1 });
