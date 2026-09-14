import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TIMEOUT_MS = 5000;

/**
 * Calypso는 Hub 레지스트리에 등록돼 있지 않다(SIREN 내장 기능이라 Service Manage
 * 목록에도 없음 — §19.1) — 그래서 ObserverClientService(레지스트리 기반)로는 못 부르고
 * 이 전용 클라이언트로 부른다. 평소 열람은 브라우저가 Calypso api를 직접 호출하지만,
 * release를 만드는 순간만은 백엔드가 직접 Calypso의 현재 버전을 물어봐야 한다 — 그 시점의
 * 버전을 기록에 얼려야 하므로 브라우저가 보여준 값을 믿을 수 없다.
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

  /** Calypso가 이해하는 호출자 헤더 3종 — calypso/src/common/actor.ts 참고. */
  private actorHeaders(knoxId: string, departments: string[], isAdmin: boolean): Record<string, string> {
    const headers: Record<string, string> = { 'X-Knox-Id': knoxId };
    if (departments.length) headers['X-User-Departments'] = departments.join(',');
    if (isAdmin) headers['X-User-Group'] = 'Admin';
    return headers;
  }

  /**
   * "새 Artifact 추가" 다이얼로그의 File Artifacts(Tier B) 후보 목록(설계서 04장 §6.3).
   *
   * Calypso는 SIREN의 projectId를 그대로 쓰므로(§11.4 — workflow 개념을 모른다) RPM류처럼
   * 별도 project-link/search가 필요 없다. `GET /artifacts?projectId=`는 Calypso 사람 화면이
   * 쓰는 바로 그 라우트이고, `none` 등급은 이미 그쪽에서 걸러져서 온다 — 여기서는 그
   * `myAccess`를 그대로 pickable 판정에 쓴다.
   */
  async listArtifacts(
    projectId: string,
    knoxId: string,
    departments: string[],
    isAdmin: boolean,
  ): Promise<{ artifactId: string; name: string; access: 'edit' | 'view' }[]> {
    if (!this.baseUrl) return [];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(
        `${this.baseUrl}/artifacts?projectId=${encodeURIComponent(projectId)}`,
        { signal: controller.signal, headers: this.actorHeaders(knoxId, departments, isAdmin) },
      );
      if (!res.ok) {
        this.logger.warn(`Calypso artifact list failed (${res.status}) for project ${projectId}`);
        return [];
      }
      const body = await res.json();
      const list = Array.isArray(body?.data) ? body.data : [];
      return list.map((a: { id: string; name: string; myAccess: 'edit' | 'view' }) => ({
        artifactId: a.id,
        name: a.name,
        access: a.myAccess,
      }));
    } catch (e) {
      this.logger.warn(`Calypso artifact list error for project ${projectId} — ${(e as Error).message}`);
      return [];
    } finally {
      clearTimeout(timer);
    }
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
