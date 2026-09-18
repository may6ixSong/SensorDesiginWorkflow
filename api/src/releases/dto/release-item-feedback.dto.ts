import {
  ReleaseItemFeedbackDocument,
  ReleaseItemFeedbackStatus,
} from '../schemas/release-item-feedback.schema';

export interface CreateReleaseItemFeedbackDto {
  department: string;
  status: ReleaseItemFeedbackStatus;
  comment: string;
}

export interface ReleaseItemFeedbackDto {
  id: string;
  releaseId: string;
  blockId: string;
  department: string;
  status: ReleaseItemFeedbackStatus;
  comment: string;
  createdBy: string;
  createdAt: Date;
}

export function toReleaseItemFeedbackDto(doc: ReleaseItemFeedbackDocument): ReleaseItemFeedbackDto {
  return {
    id: doc._id.toString(),
    releaseId: doc.releaseId.toString(),
    blockId: doc.blockId,
    department: doc.department,
    status: doc.status,
    comment: doc.comment,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
  };
}
