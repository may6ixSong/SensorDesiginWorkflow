import { ReleaseFeedbackDocument, ReleaseFeedbackStatus } from '../schemas/release-feedback.schema';

export interface CreateReleaseFeedbackDto {
  department: string;
  comment: string;
  /** 답글이면 부모 댓글 id. 최상위 댓글이면 생략. */
  parentId?: string;
  /** 최상위 댓글에서만 의미가 있다 — 생략하면 accepted(초록)로 채운다(사용자 확정).
   *  답글에 오면 무시한다(항상 null로 저장된다). */
  status?: ReleaseFeedbackStatus;
}

export interface ReleaseFeedbackDto {
  id: string;
  releaseId: string;
  department: string;
  parentId: string | null;
  status: ReleaseFeedbackStatus | null;
  comment: string;
  createdBy: string;
  createdAt: Date;
}

export function toReleaseFeedbackDto(doc: ReleaseFeedbackDocument): ReleaseFeedbackDto {
  return {
    id: doc._id.toString(),
    releaseId: doc.releaseId.toString(),
    department: doc.department,
    parentId: doc.parentId ? doc.parentId.toString() : null,
    status: doc.status,
    comment: doc.comment,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
  };
}
