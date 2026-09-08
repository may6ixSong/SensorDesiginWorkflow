import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TIMEOUT_MS = 5000;

/**
 * Calypso는 Hub 레지스트리에 등록돼 있지 않다(SIREN 내장 기능이라 Service Manage
 * 목록에도 없음 — §19.1) — 그래서 ObserverClientService(레지스트리 기반)로는 못 부르고
 * 이 전용 클라이언트로 부른다. 평소 열람은 브라우저가 Calypso api를 직접 호출하지만,
 * HLD Release 스냅샷(§19.4)만은 백엔드가 직접 Calypso의 현재 버전을 물어봐야 한다.
 *
 * Calypso는 knoxId 쿼리 파라미터가 아니라 자기 헤더 체계(X-Knox-Id 등)로 호출자를
 * 식별한다 — 그래서 여기서만 헤더 방식을 쓴다.
 */
@Injectable()
export class CalypsoClientService {
  private readonly logger = new Logger(CalypsoClientService.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>('calypsoApiUrl') ?? '';
  }

  async currentVersion(externalArtifactId: string, knoxId: string): Promise<{
    versionLabel: string;
    isReleased: boolean;
    giverKnoxId: string | null;
    viewUrl: string | null;
  } | null> {
    if (!this.baseUrl) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/artifacts/${encodeURIComponent(externalArtifactId)}/current-version`, {
        signal: controller.signal,
        headers: { 'X-Knox-Id': knoxId },
      });
      if (!res.ok) {
        this.logger.warn(`Calypso current-version failed (${res.status}) for ${externalArtifactId}`);
        return null;
      }
      // calypso/src/artifacts/observer.dto.ts#toVersionRecord — 구 계약 v1 모양
      // ({data:...}로 안 감싸고, giver가 {knoxId,dept} 중첩 객체).
      const v = await res.json();
      if (!v) return null;
      return {
        versionLabel: v.versionLabel ?? '',
        isReleased: v.isReleased === true,
        giverKnoxId: v.giver?.knoxId ?? null,
        viewUrl: v.viewUrl ?? null,
      };
    } catch (e) {
      this.logger.warn(`Calypso current-version error for ${externalArtifactId} — ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
