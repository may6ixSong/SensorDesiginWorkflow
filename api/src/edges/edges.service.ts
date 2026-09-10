import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Edge, EdgeDocument } from './schemas/edge.schema';

@Injectable()
export class EdgesService {
  constructor(@InjectModel(Edge.name) private readonly model: Model<EdgeDocument>) {}

  listForWorkflow(workflowId: string) {
    return this.model.find({ workflowId }).exec();
  }

  /** series 인스턴스 생성 시 회차 순서대로 자동 연결. isMock은 소속 workflow에서 상속. */
  async createAutoChain(workflowId: Types.ObjectId, orderedBlockIds: Types.ObjectId[], isMock = false) {
    const docs = [];
    for (let i = 0; i < orderedBlockIds.length - 1; i++) {
      docs.push({
        workflowId,
        fromId: orderedBlockIds[i],
        toId: orderedBlockIds[i + 1],
        bidirectional: false,
        auto: true,
        isMock,
      });
    }
    if (docs.length) await this.model.insertMany(docs);
  }

  /** 블록 삭제 시 그 블록이 관여된 edge를 함께 정리한다. */
  deleteByBlockIds(blockIds: (Types.ObjectId | string)[]) {
    return this.model
      .deleteMany({ $or: [{ fromId: { $in: blockIds } }, { toId: { $in: blockIds } }] })
      .exec();
  }

  /**
   * release의 source 계산용 — 각 블록의 **직전 1홉 upstream** 블록 id 목록.
   *
   * 단방향 edge는 from → to 방향만 upstream으로 친다. 양방향(bidirectional) edge는
   * 서로가 서로의 source가 될 수 있으므로 양쪽 모두에 넣는다.
   */
  async upstreamMap(workflowId: string | Types.ObjectId): Promise<Map<string, string[]>> {
    const edges = await this.model.find({ workflowId }).exec();
    const map = new Map<string, string[]>();
    const push = (to: string, from: string) => {
      const list = map.get(to) ?? [];
      if (!list.includes(from)) list.push(from);
      map.set(to, list);
    };
    for (const e of edges) {
      const from = e.fromId.toString();
      const to = e.toId.toString();
      push(to, from);
      if (e.bidirectional) push(from, to);
    }
    return map;
  }

  /** isMock은 소속 workflow에서 상속받는다 (memos.replaceAllForWorkflow와 동일한 이유). */
  async replaceAllForWorkflow(
    workflowId: string,
    edges: { id?: string; fromId: string; toId: string; bidirectional: boolean; auto?: boolean }[],
    isMock = false,
  ) {
    await this.model.deleteMany({ workflowId }).exec();
    if (!edges.length) return [];
    const docs = edges.map((e) => ({
      workflowId,
      fromId: e.fromId,
      toId: e.toId,
      bidirectional: e.bidirectional,
      auto: e.auto ?? false,
      isMock,
    }));
    return this.model.insertMany(docs);
  }

  createOne(workflowId: string, fromId: string, toId: string, bidirectional: boolean, isMock = false) {
    return this.model.create({ workflowId, fromId, toId, bidirectional, auto: false, isMock });
  }

  deleteOne(edgeId: string) {
    return this.model.findByIdAndDelete(edgeId).exec();
  }
}
