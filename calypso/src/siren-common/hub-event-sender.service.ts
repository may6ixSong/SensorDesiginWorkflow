import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArtifactDocument, ArtifactVersion } from '../artifacts/schemas/artifact.schema';

const TIMEOUT_MS = 5000;

/**
 * SIREN api/src/hub/dto/version-event.dto.ts#VersionPublishedEventDto의 artifactTypeKey는
 * 빈 문자열을 허용하지 않는다. Calypso는 Service Manage 등록이 없는 isBuiltIn 서비스라
 * HubTokenGuard가 내려주는 artifactTypeKeys가 항상 빈 배열이고(hub-token.guard.ts), 그러면
 * hub-events.controller.ts의 검증(`artifactTypeKeys.length > 0 && !includes(...)`)이 아예
 * 실행되지 않는다 — 그래서 이 값은 어떤 고정 문자열이어도 되고, 그냥 표시용이다.
 */
const ARTIFACT_TYPE_KEY = 'file';

/**
 * Calypso → SIREN 순방향 호출 — 이 artifact의 publish/upload를 SIREN에 즉시 알린다
 * (Hub 설계서 07장 §4, SIREN의 api/src/hub/hub-events.controller.ts `POST
 * /hub/events/version-published`가 받는 쪽이다).
 *
 * ★ 이 서비스가 생기기 전엔 이 방향으로 나가는 HTTP 호출이 전혀 없었다 — 수신 측
 *   컨트롤러는 이미 구현돼 있었지만 아무도 호출하지 않아 죽은 코드였다("문제 1"). 그
 *   결과 SIREN이 한 번 매핑한 뒤 Calypso에서 새로 publish된 버전은, SIREN BE의 프록시가
 *   직접 캐시를 갱신하거나(calypso-proxy.controller.ts, "문제 2") 야간 재동기화가 돌지
 *   않는 한 영원히 SIREN에 반영되지 않았다.
 * ★ fire-and-forget이다 — Calypso 자신의 업로드/release 자체는 사용자가 실제로 기다리는
 *   동작이고 이미 성공적으로 끝났으므로, SIREN에 알리는 이 호출이 느리거나 실패해도
 *   그 응답을 막거나 실패시키지 않는다. 실패하면 로그만 남긴다 — SIREN BE가 이미 이
 *   artifact를 매핑해 뒀다면 "문제 2"의 프록시 경로나 다음 pull이 결국 따라잡는다.
 * ★ SIREN이 아직 이 externalArtifactId를 어느 workflow에도 매핑하지 않았으면
 *   hub-events.controller.ts가 `{recorded:false}`로 조용히 버린다 — 정상이다. 나중에
 *   매핑되는 순간 ArtifactSourceService가 전체 이력을 한 번에 pull해 따라잡는다.
 */
@Injectable()
export class HubEventSenderService {
  private readonly logger = new Logger(HubEventSenderService.name);

  constructor(private readonly config: ConfigService) {}

  async notifyVersionPublished(artifact: ArtifactDocument, version: ArtifactVersion): Promise<void> {
    const baseUrl = this.config.get<string>('sirenBaseUrl');
    if (!baseUrl) return;
    const token = this.config.get<string>('calypsoEventToken');
    const artifactId = artifact._id.toString();
    const versionLabel = `${version.major}.${version.minor}`;
    // observer.dto.ts#toVersionRecord(pull 경로)와 같은 규칙으로 만든다 — 여기서 null을
    // 보내면 hub-sync.service.ts의 upsertVersionEntry가 그대로 덮어써서(fallback이 없었다)
    // SIREN 쪽에 이미 있던 viewUrl이 지워졌었다(리뷰 결함 1).
    const publicBaseUrl = this.config.get<string>('publicBaseUrl') ?? 'http://localhost:5174';
    const viewUrl = `${publicBaseUrl.replace(/\/$/, '')}/artifacts/${artifactId}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${baseUrl}/hub/events/version-published`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          artifactTypeKey: ARTIFACT_TYPE_KEY,
          externalArtifactId: artifactId,
          updatedUserId: version.createdBy,
          updatedAt: (version.createdAt instanceof Date ? version.createdAt : new Date()).toISOString(),
          versionLabel,
          isPublished: version.isReleased === true,
          versionRef: version.versionRef,
          viewUrl,
          path: null,
          note: version.versionNote || null,
        }),
      });
      if (!res.ok) {
        this.logger.warn(`SIREN version-published event failed (${res.status}) for ${artifactId}@${versionLabel}`);
      }
    } catch (e) {
      this.logger.warn(`SIREN version-published event error for ${artifactId}@${versionLabel} — ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
