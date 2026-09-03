import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Deliverable, DeliverableDocument } from '../deliverables/schemas/deliverable.schema';

/** 대문 슬랩에 얹을 대표 산출물 하나. */
export interface ShowcaseItem {
  name: string;
  versionLabel: string;
  isReleased: boolean;
}

/**
 * 대문(§15.4)이 슬랩 위에 실제 산출물 카드를 띄우기 위한 순수 표시용 조회.
 *
 * 워크플로우 맥락이 없어 giver 판정(§6.2)을 할 수 없으므로, 누가 봐도 안전한
 * released 버전만 사용한다 — Deliverable.dto.ts의 giver 마스킹 통로(§6.2)를
 * 우회하는 게 아니라, 애초에 그 판정이 성립하지 않는 자리라 더 보수적인 규칙을
 * 쓰는 것이다.
 */
@Injectable()
export class HubShowcaseService {
  constructor(@InjectModel(Deliverable.name) private readonly model: Model<DeliverableDocument>) {}

  async list(serviceKey: string, limit = 3): Promise<ShowcaseItem[]> {
    // 인메모리 목업 모델(in-memory-driver.ts)은 .limit()을 지원하지 않아 exec() 뒤에
    // 슬라이스한다 - 실제 DB 모드에서도 그대로 동작하니 굳이 분기하지 않는다.
    const docs = (await this.model.find({ serviceKey }).sort({ updatedAt: -1 }).exec()).slice(
      0,
      limit * 4, // 몇 개는 release된 버전이 없을 수 있어 넉넉히 가져와 거른다
    );

    const items: ShowcaseItem[] = [];
    for (const d of docs) {
      const released = (d.versions ?? []).find((v) => v.isReleased === true);
      if (!released) continue;
      items.push({ name: d.name, versionLabel: released.versionLabel, isReleased: true });
      if (items.length >= limit) break;
    }
    return items;
  }
}
