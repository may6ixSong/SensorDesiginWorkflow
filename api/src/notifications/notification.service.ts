import { Injectable, Logger } from '@nestjs/common';
import { ReleaseDocument } from '../releases/schemas/release.schema';

/**
 * 한 수신자(부서 또는 개인)에게 나갈 알림 한 통.
 *
 * ★ 각 부서는 **자기가 받을 산출물만** 전달받는다(설계서 05장 §6.1). 산출물 A의
 *   recipient가 AA·BB 부서라면 A에 대한 알림은 AA·BB에게만 가고, CC·DD는 A가 있었다는
 *   사실조차 보지 못한다.
 * ★ **변경이 없던 산출물도 함께 담는다.** highlight는 "무엇이 새로워졌는지" 표시일 뿐,
 *   전달 여부와 무관하다.
 */
export interface ReleaseNotification {
  releaseId: string;
  workflowId: string;
  workflowName: string;
  seq: number;
  releasedBy: string;
  releasedAt: Date;
  note: string;
  /** 'department' | 'user' */
  recipientKind: 'department' | 'user';
  recipientId: string;
  items: {
    artifactName: string;
    versionLabel: string | null;
    changed: boolean;
    /** source가 하나라도 미발행이면 true — 본문에 "일부 선행 산출물 미전달"을 표기한다. */
    hasUndeliveredSource: boolean;
  }[];
}

/**
 * 알림 전송 어댑터. 지금은 로그만 남기는 stub이다.
 *
 * TODO(T3): 실제 메일 발송 + SIREN 내 "My workspace"·알림 페이지 연동. 그때 이 인터페이스를
 *   구현한 어댑터를 환경변수로 주입한다. 이 파일의 시그니처는 그대로 두고 구현만 갈아끼운다.
 */
export interface NotificationSender {
  send(payload: ReleaseNotification): Promise<void>;
}

@Injectable()
export class NotificationService implements NotificationSender {
  private readonly logger = new Logger(NotificationService.name);

  async send(payload: ReleaseNotification): Promise<void> {
    // TODO(T3): 메일 어댑터 연결 지점.
    this.logger.log(
      `[notify:${payload.recipientKind}] ${payload.recipientId} ← ` +
        `${payload.workflowName} v${payload.seq} (${payload.items.length} artifacts)`,
    );
  }

  /**
   * release 하나를 수신자별로 쪼개 보낸다.
   *
   * ★ 같은 사람이 여러 경로로 걸려도 **한 통으로 합친다**(중복 발송 금지). 부서 → 실제
   *   사람 전개는 알림 어댑터가 붙는 시점에 members 로스터를 보고 하며, 지금 stub 단계에서는
   *   부서 단위로 한 통을 만든다.
   *
   * TODO(T4): workflow 소속 부서에 보내는 별도 notice("우리 workflow가 release를 냈다")는
   *   위 수신 알림과의 중복 처리·형태·문구를 정한 뒤에 붙인다.
   */
  async notifyRelease(release: ReleaseDocument): Promise<void> {
    const base = {
      releaseId: release._id.toString(),
      workflowId: release.workflowId.toString(),
      workflowName: release.workflowAt?.name ?? '',
      seq: release.seq,
      releasedBy: release.releasedBy,
      releasedAt: release.releasedAt,
      note: release.note,
    };

    const bucket = new Map<string, ReleaseNotification>();

    for (const item of release.items ?? []) {
      const line = {
        artifactName: item.artifactName,
        versionLabel: item.published?.versionLabel ?? null,
        changed: item.changed,
        hasUndeliveredSource: (item.sources ?? []).some((s) => !s.selected),
      };

      const targets: { kind: 'department' | 'user'; id: string }[] = [
        ...(item.recipients?.departments ?? []).map((d) => ({ kind: 'department' as const, id: d })),
        ...(item.recipients?.users ?? []).map((u) => ({ kind: 'user' as const, id: u })),
      ];

      for (const target of targets) {
        const key = `${target.kind}:${target.id}`;
        const existing = bucket.get(key);
        if (existing) {
          existing.items.push(line);
        } else {
          bucket.set(key, { ...base, recipientKind: target.kind, recipientId: target.id, items: [line] });
        }
      }
    }

    for (const payload of bucket.values()) {
      await this.send(payload);
    }
  }
}
