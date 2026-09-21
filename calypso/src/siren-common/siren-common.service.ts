import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SirenCommonMember {
  knoxId: string;
  /** SIREN `Project.departments[].id` 목록(설계서 02장 §9) — 이름이 아니라 id다. */
  departments: string[];
}

/** SIREN 과제의 부서 하나 — `id`는 불변, `name`은 SIREN Members 탭에서 개명될 수 있다
 *  (설계서 02장 §9). 이 응답을 relay할 때마다 그 순간의 최신 이름이 함께 온다. */
export interface SirenDepartment {
  id: string;
  name: string;
}

export interface SirenDepartmentRoster {
  departments: SirenDepartment[];
  members: SirenCommonMember[];
}

const TIMEOUT_MS = 8000;

/**
 * Calypso → SIREN 역방향 호출. Access 패널의 부서 목록/멤버 로스터를 위해 SIREN의
 * `/hub/common`(설계서 §4.4, 다른 등록 서비스들과 같은 엔드포인트)을 그대로 불러쓴다.
 *
 * ★ SIREN FE가 이미 들고 있는 project 데이터로 이 정보를 바로 만들 수 있지만, 일부러
 *   이 왕복(SIREN FE → SIREN BE → Calypso BE → SIREN BE)을 거치기로 했다(사용자 결정) —
 *   Calypso가 나중에 완전히 독립된 서비스로 분리됐을 때도 그대로 쓸 수 있는 경로를
 *   지금부터 만들어 둔다. RPM 같은 실제 외부 서비스가 이미 이 경로(자기 토큰으로
 *   `/hub/common` 호출)를 쓰므로, Calypso도 같은 방식을 따른다.
 */
@Injectable()
export class SirenCommonService {
  private readonly logger = new Logger(SirenCommonService.name);

  constructor(private readonly config: ConfigService) {}

  async getDepartmentRoster(projectId: string): Promise<SirenDepartmentRoster | null> {
    const baseUrl = this.config.get<string>('sirenBaseUrl');
    if (!baseUrl) return null;
    const token = this.config.get<string>('calypsoEventToken');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${baseUrl}/hub/common?projectId=${encodeURIComponent(projectId)}`, {
        signal: controller.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        this.logger.warn(`SIREN /hub/common failed (${res.status}) for project ${projectId}`);
        return null;
      }
      const body = await res.json().catch(() => null);
      const data = body?.data ?? {};
      return {
        departments: Array.isArray(data.departments)
          ? data.departments.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name }))
          : [],
        members: Array.isArray(data.members)
          ? data.members.map((m: { knoxId: string; departments?: string[] }) => ({
            knoxId: m.knoxId,
            departments: m.departments ?? [],
          }))
          : [],
      };
    } catch (e) {
      this.logger.warn(`SIREN /hub/common error for project ${projectId} — ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
