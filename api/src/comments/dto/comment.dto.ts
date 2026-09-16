import { ArtifactCommentDocument } from '../schemas/artifact-comment.schema';

export interface CreateCommentDto {
  text: string;
  /** 특정 버전에 대한 댓글일 때만. parentCommentId가 있으면 무시되고 부모의 값을 물려받는다. */
  versionId?: string;
  /** 대댓글일 때만 - 부모 comment의 id. */
  parentCommentId?: string;
}

export interface CommentDto {
  id: string;
  artifactId: string;
  versionId: string | null;
  versionLabelSnapshot: string;
  parentCommentId: string | null;
  text: string;
  createdBy: string;
  createdAt: Date;
}

export function toCommentDto(doc: ArtifactCommentDocument): CommentDto {
  return {
    id: doc._id.toString(),
    artifactId: doc.artifactId.toString(),
    versionId: doc.versionId ? doc.versionId.toString() : null,
    versionLabelSnapshot: doc.versionLabelSnapshot ?? '',
    parentCommentId: doc.parentCommentId ? doc.parentCommentId.toString() : null,
    text: doc.text,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
  };
}
