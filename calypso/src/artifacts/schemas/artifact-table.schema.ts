import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type ArtifactTableDocument = ArtifactTable & Document;

/**
 * 표(table) 콘텐츠 버전 하나의 행 데이터(SIREN 설계서 11장 §3). artifact 문서의 versions 배열에
 * 넣지 않고 따로 둔다 — 행이 수천 개인 표가 버전마다 쌓이면 artifact 문서 하나가 MongoDB
 * 문서 크기 한도(16MB)를 넘을 수 있기 때문이다. versionRef가 불변 참조라 그대로 키로 쓴다.
 */
@Schema({ collection: 'artifactTables', timestamps: false })
export class ArtifactTable {
  @Prop({ required: true, index: true })
  artifactId: string;

  @Prop({ required: true, unique: true, index: true })
  versionRef: string;

  @Prop({ required: true })
  templateKey: string;

  @Prop({ required: true })
  templateVersion: number;

  /** `{ [column key]: string }` — template 컬럼 key만 남긴 문자열 값. 완전히 빈 행은 없다. */
  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  rows: Record<string, string>[];

  @Prop({ type: Date, default: () => new Date() })
  createdAt: Date;

  _id: Types.ObjectId;
}
export const ArtifactTableSchema = SchemaFactory.createForClass(ArtifactTable);
