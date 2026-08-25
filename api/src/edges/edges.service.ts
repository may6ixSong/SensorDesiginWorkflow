import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Edge, EdgeDocument } from './schemas/edge.schema';

@Injectable()
export class EdgesService {
  constructor(@InjectModel(Edge.name) private readonly model: Model<EdgeDocument>) {}

  listForIp(ipId: string) {
    return this.model.find({ ipId }).exec();
  }

  /** series 인스턴스 생성 시 회차 순서대로 자동 연결 (설계서 3.6). isMock은 소속 IP에서 상속. */
  async createAutoChain(ipId: Types.ObjectId, orderedDeliverableIds: Types.ObjectId[], isMock = false) {
    const docs = [];
    for (let i = 0; i < orderedDeliverableIds.length - 1; i++) {
      docs.push({
        ipId,
        fromId: orderedDeliverableIds[i],
        toId: orderedDeliverableIds[i + 1],
        bidirectional: false,
        auto: true,
        isMock,
      });
    }
    if (docs.length) await this.model.insertMany(docs);
  }

  /** 산출물 삭제 시 그 산출물이 관여된 edge를 함께 정리 (설계서 3.6 - 일정 축소 시 auto edge 정리). */
  deleteByDeliverableIds(deliverableIds: (Types.ObjectId | string)[]) {
    return this.model
      .deleteMany({ $or: [{ fromId: { $in: deliverableIds } }, { toId: { $in: deliverableIds } }] })
      .exec();
  }

  /** isMock은 소속 IP에서 상속받는다 (memos.replaceAllForIp와 동일한 이유). */
  async replaceAllForIp(
    ipId: string,
    edges: { id?: string; fromId: string; toId: string; bidirectional: boolean; auto?: boolean }[],
    isMock = false,
  ) {
    await this.model.deleteMany({ ipId }).exec();
    if (!edges.length) return [];
    const docs = edges.map((e) => ({
      ipId,
      fromId: e.fromId,
      toId: e.toId,
      bidirectional: e.bidirectional,
      auto: e.auto ?? false,
      isMock,
    }));
    return this.model.insertMany(docs);
  }

  createOne(ipId: string, fromId: string, toId: string, bidirectional: boolean, isMock = false) {
    return this.model.create({ ipId, fromId, toId, bidirectional, auto: false, isMock });
  }

  deleteOne(edgeId: string) {
    return this.model.findByIdAndDelete(edgeId).exec();
  }
}
