import { Injectable, Logger } from '@nestjs/common';
import { ArtifactServiceDocument } from './schemas/artifact-service.schema';

/** Observer 계약 v2 (설계서 §19.2) 응답 모양. */
export interface ObserverVersionRecord {
  versionLabel: string;
  isReleased: boolean;
  giverKnoxId: string | null;
  giverDept: string | null;
  viewUrl: string | null;
  sourceRefs: Array<{
    artifactKey?: string;
    serviceKey: string;
    versionRef?: string;
    versionLabel: string;
    capturedAt?: string;
  }>;
  /** 요청자가 edit 권한일 때만 그 서비스가 채워 보낸다 (§19.2). */
  editors: string[] | null;
  observedAt: string | null;
}

export interface ObserverAccess {
  canView: boolean;
  canEdit: boolean;
}

export interface ObserverProjectCandidate {
  externalProjectId: string;
  displayName: string;
  code: string;
  revision: string | null;
}

const TIMEOUT_MS = 5000;

/**
 * Observer 계약 v2의 3개 필수 GET(current-version/versions/access)과 프로젝트 검색을
 * 실제로 호출하는 어댑터(설계서 §19.2). SIREN은 이 응답을 그대로 믿고 다시 마스킹하지
 * 않는다 — 필터링은 항상 그 서비스가 `knoxId` 기준으로 한다.
 *
 * transport가 http가 아니거나 baseUrl이 없으면(B/C/D 티어) 모든 호출이 조용히
 * null/빈 값을 반환한다 — 그런 서비스는 애초에 이 어댑터의 대상이 아니다.
 *
 * currentVersion/versions/access의 isAdmin은 RPM처럼 그 계약을 구현한 서비스가
 * &isAdmin=true를 받으면 member가 아니어도 편집자 시야(작업중 버전 · editors 목록)를
 * 내려주는, 서비스가 자발적으로 지원하는 선택적 확장이다 — 계약을 구현하지 않은
 * 서비스에는 그냥 무해한 여분 쿼리 파라미터다. 호출부는 이 값을 "실제 검증된 admin"
 * 판단 그대로 넘겨야 한다(DeliverablesService 참고 - 시뮬레이션 중에는 꺼야 한다).
 */
@Injectable()
export class ObserverClientService {
  private readonly logger = new Logger(ObserverClientService.name);

  private callable(svc: Pick<ArtifactServiceDocument, 'transport' | 'baseUrl'>): boolean {
    return svc.transport === 'http' && !!svc.baseUrl;
  }

  private async getJson(url: string): Promise<any | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        this.logger.warn(`Observer call failed (${res.status}): ${url}`);
        return null;
      }
      return await res.json();
    } catch (e) {
      this.logger.warn(`Observer call error: ${url} — ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** isAdmin=true면 &isAdmin=true를 붙인다 — false일 땐 URL을 깔끔하게 유지하려 아예 안 붙인다. */
  private adminParam(isAdmin: boolean): string {
    return isAdmin ? '&isAdmin=true' : '';
  }

  async currentVersion(
    svc: ArtifactServiceDocument,
    externalArtifactId: string,
    knoxId: string,
    isAdmin: boolean,
  ): Promise<ObserverVersionRecord | null> {
    if (!this.callable(svc)) return null;
    const url = `${svc.baseUrl}/artifacts/${encodeURIComponent(externalArtifactId)}/current-version?knoxId=${encodeURIComponent(knoxId)}${this.adminParam(isAdmin)}`;
    return this.getJson(url);
  }

  async versions(
    svc: ArtifactServiceDocument,
    externalArtifactId: string,
    knoxId: string,
    isAdmin: boolean,
  ): Promise<ObserverVersionRecord[]> {
    if (!this.callable(svc)) return [];
    const url = `${svc.baseUrl}/artifacts/${encodeURIComponent(externalArtifactId)}/versions?knoxId=${encodeURIComponent(knoxId)}${this.adminParam(isAdmin)}`;
    const data = await this.getJson(url);
    return Array.isArray(data) ? data : [];
  }

  /** fail-closed(§19.2) — 실패/타임아웃이면 아무 권한도 없는 것으로 취급한다. */
  async access(
    svc: ArtifactServiceDocument,
    externalArtifactId: string,
    knoxId: string,
    isAdmin: boolean,
  ): Promise<ObserverAccess> {
    if (!this.callable(svc)) return { canView: false, canEdit: false };
    const url = `${svc.baseUrl}/artifacts/${encodeURIComponent(externalArtifactId)}/access?knoxId=${encodeURIComponent(knoxId)}${this.adminParam(isAdmin)}`;
    const data = await this.getJson(url);
    if (!data) return { canView: false, canEdit: false };
    return { canView: data.canView === true, canEdit: data.canEdit === true };
  }

  /** project 링크 단계에서만 쓴다(§19.3의 project 해석) — 후보를 사람이 직접 확정한다. */
  async searchProjects(
    svc: ArtifactServiceDocument,
    code: string,
    revision: string,
  ): Promise<ObserverProjectCandidate[]> {
    if (!this.callable(svc)) return [];
    const url = `${svc.baseUrl}/projects/search?code=${encodeURIComponent(code)}&revision=${encodeURIComponent(revision)}`;
    const data = await this.getJson(url);
    return Array.isArray(data) ? data : [];
  }
}
