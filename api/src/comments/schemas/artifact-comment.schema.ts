import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
// @Prop의 런타임 type은 반드시 SchemaTypes.ObjectId를 쓴다 - Types.ObjectId(값 클래스)를 주면
// Mongoose가 Mixed 경로를 만들고, Mixed는 캐스팅을 하지 않아 문자열 id 필터가 전부 0건이 된다.

export type ArtifactCommentDocument = ArtifactComment & Document;

/**
 * Artifact에 대한 댓글. version 안에 중첩하지 않고 별도 컬렉션으로 둔다 -
 * A/B tier 라이브 동기화가 `Artifact.versions`를 통째로 교체하므로(ArtifactsService.
 * replaceVersions), 그 안에 있었다면 동기화마다 댓글을 버전별로 재매칭해서 보존해야 한다.
 */
@Schema({ timestamps: true })
export class ArtifactComment {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Artifact', required: true, index: true })
  artifactId: Types.ObjectId;

  /** 특정 버전에 대한 댓글이면 그 버전의 _id. Artifact 전체에 대한 댓글이면 null. */
  @Prop({ type: SchemaTypes.ObjectId, default: null, index: true })
  versionId: Types.ObjectId | null;

  /** 작성 시점 버전 라벨 캐시 - 라벨이 나중에 바뀌거나 버전이 사라져도 맥락을 보존한다. */
  @Prop({ default: '' })
  versionLabelSnapshot: string;

  /** 대댓글이면 부모 comment의 _id. 최상위 댓글이면 null. */
  @Prop({ type: SchemaTypes.ObjectId, default: null, index: true })
  parentCommentId: Types.ObjectId | null;

  @Prop({ required: true, trim: true })
  text: string;

  /** 작성자의 KnoxID (api에는 users 컬렉션이 없다 - src/common/actor.ts). */
  @Prop({ required: true, trim: true })
  createdBy: string;

  @Prop({ default: false, index: true })
  isMock: boolean;

  _id: Types.ObjectId;
  /** @Schema({timestamps:true})가 채운다 - 타입 선언만 있고 별도 @Prop은 없다. */
  createdAt: Date;
  updatedAt: Date;
}

export const ArtifactCommentSchema = SchemaFactory.createForClass(ArtifactComment);
ArtifactCommentSchema.index({ artifactId: 1, createdAt: 1 });
