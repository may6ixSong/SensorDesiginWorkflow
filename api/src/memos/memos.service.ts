import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Memo, MemoDocument } from './schemas/memo.schema';

@Injectable()
export class MemosService {
  constructor(@InjectModel(Memo.name) private readonly model: Model<MemoDocument>) {}

  listForIp(ipId: string) {
    return this.model.find({ ipId }).exec();
  }

  async replaceAllForIp(
    ipId: string,
    memos: { id?: string; phaseKey: string; text: string; layout: any; createdBy: string }[],
  ) {
    await this.model.deleteMany({ ipId }).exec();
    if (!memos.length) return [];
    const docs = memos.map((m) => ({
      ipId,
      phaseKey: m.phaseKey,
      text: m.text,
      layout: m.layout,
      createdBy: m.createdBy,
    }));
    return this.model.insertMany(docs);
  }
}
