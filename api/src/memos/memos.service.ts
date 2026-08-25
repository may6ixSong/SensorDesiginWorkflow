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

  /**
   * isMock은 소속 IP에서 상속받는다 - 목업 IP의 메모는 목업으로 남아야
   * MOCKUP_ENABLED=false 정리 때 IP와 함께 지워진다(고아 문서 방지).
   */
  async replaceAllForIp(
    ipId: string,
    memos: { id?: string; phaseKey: string; text: string; layout: any; createdBy: string }[],
    isMock = false,
  ) {
    await this.model.deleteMany({ ipId }).exec();
    if (!memos.length) return [];
    const docs = memos.map((m) => ({
      ipId,
      phaseKey: m.phaseKey,
      text: m.text,
      layout: m.layout,
      createdBy: m.createdBy,
      isMock,
    }));
    return this.model.insertMany(docs);
  }
}
