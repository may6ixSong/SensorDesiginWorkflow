import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

const TIMEOUT_MS = 5000;
/** 업로드/다운로드는 큰 파일을 옮길 수 있어 조회성 호출보다 넉넉한 타임아웃을 쓴다. */
const TRANSFER_TIMEOUT_MS = 60_000;

/** editors/view-grants에 한 건 추가·삭제할 때 쓰는 몸체 — calypso/…/dto#GrantDto와 같은 모양. */
export type CalypsoGrantInput =
  | { type: 'user'; knoxId: string }
  | { type: 'department'; department: string };

/** Calypso의 고정 serviceKey — Hub 레지스트리 대상이 아니므로(§3.1) 한 곳에서만 정의해 공유한다. */
export const CALYPSO_SERVICE_KEY = 'calypso';

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

  /**
   * Calypso가 이해하는 호출자 헤더 3종(calypso/src/common/actor.ts) + 서비스 토큰 하나.
   *
   * `X-Knox-Id` 등은 신원 **주장**일 뿐 Calypso가 검증하지 않는다 — 그래서 최소한
   * "이 호출이 SIREN BE에서 온 게 맞는가"는 별도 공유 비밀(`X-Siren-Token`)로 증명한다.
   * Calypso 쪽이 이 토큰을 검증한다(calypso/src/common/siren-caller.guard.ts). 이 방향은
   * 반대 방향(Calypso → SIREN의 version 이벤트, DB에 저장된 ArtifactService.token — §3.4)과는
   * 다른 토큰이다 — 서로 다른 방향의 호출을 서로 다른 비밀로 증명한다.
   */
  private actorHeaders(knoxId: string, departments: string[], isAdmin: boolean): Record<string, string> {
    const headers: Record<string, string> = { 'X-Knox-Id': knoxId };
    if (departments.length) headers['X-User-Departments'] = departments.join(',');
    if (isAdmin) headers['X-User-Group'] = 'Admin';
    const token = this.config.get<string>('calypsoApiToken');
    if (token) headers['X-Siren-Token'] = token;
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

  /**
   * File Artifacts(B)의 **게이트 2** — Calypso 자신의 canView/canEdit(설계서 04장 §3, §4.1).
   * A/C와 동일한 2단 게이트 패턴을 쓰기로 하면서 새로 필요해졌다 — 이전엔 B의 권한을
   * SIREN이 artifact 단위로 보관해서 이 라이브 호출 자체가 없었다.
   *
   * fail-closed다: Calypso가 죽었거나 느리면 access:false를 돌려준다 — ObserverClientService.access()와
   * 같은 원칙이다(권한 판정에서 실패를 관대하게 처리하지 않는다).
   */
  async access(
    externalArtifactId: string,
    knoxId: string,
    departments: string[],
    isAdmin: boolean,
  ): Promise<{ canView: boolean; canEdit: boolean }> {
    if (!this.baseUrl) return { canView: false, canEdit: false };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/artifacts/${encodeURIComponent(externalArtifactId)}`, {
        signal: controller.signal,
        headers: this.actorHeaders(knoxId, departments, isAdmin),
      });
      if (!res.ok) {
        if (res.status !== 404) {
          this.logger.warn(`Calypso access check failed (${res.status}) for ${externalArtifactId}`);
        }
        return { canView: false, canEdit: false };
      }
      const body = await res.json();
      const myAccess = body?.data?.myAccess as 'edit' | 'view' | undefined;
      return { canView: myAccess === 'edit' || myAccess === 'view', canEdit: myAccess === 'edit' };
    } catch (e) {
      this.logger.warn(`Calypso access check error for ${externalArtifactId} — ${(e as Error).message}`);
      return { canView: false, canEdit: false };
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
        headers: this.actorHeaders(knoxId, [], false),
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

  /**
   * 매핑 시 즉시 전체 버전 이력을 한 번 pull할 때 쓴다(설계서 07장 §4.3, 04장 §6.3) — Calypso는
   * 이미 observer 계약의 `/artifacts/:id/versions`를 자체 구현하고 있으므로(calypso/src/artifacts/
   * artifacts.controller.ts) 그걸 그대로 부른다.
   */
  async versions(externalArtifactId: string, knoxId: string): Promise<
    { versionLabel: string; isReleased: boolean; giverKnoxId: string | null; viewUrl: string | null; network: 'OA' | 'HPC' | null }[]
  > {
    if (!this.baseUrl) return [];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/artifacts/${encodeURIComponent(externalArtifactId)}/versions`, {
        signal: controller.signal,
        headers: this.actorHeaders(knoxId, [], false),
      });
      if (!res.ok) {
        this.logger.warn(`Calypso versions failed (${res.status}) for ${externalArtifactId}`);
        return [];
      }
      const list = await res.json();
      if (!Array.isArray(list)) return [];
      return list.map((v: any) => ({
        versionLabel: v.versionLabel ?? '',
        isReleased: v.isReleased === true,
        giverKnoxId: v.giver?.knoxId ?? null,
        viewUrl: v.viewUrl ?? null,
        network: v.network ?? null,
      }));
    } catch (e) {
      this.logger.warn(`Calypso versions error for ${externalArtifactId} — ${(e as Error).message}`);
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  // ── 사람이 쓰는 화면(등록/목록/업로드/다운로드/release/권한)의 프록시 몸통(설계서
  //    07장 §2) ────────────────────────────────────────────────────────────
  // 이 아래는 FE의 옛 calypsoClient.ts(axios, 브라우저에서 Calypso를 직접 호출)가 하던
  // 일을 그대로 옮긴 것이다 — 모양은 Calypso 응답을 그대로 통과시킨다(FE의 CalypsoArtifact
  // 타입과 1:1). 실패하면 null을 돌려주고, 컨트롤러가 그 null을 404/502로 번역한다
  // (권한 판정에 쓰이는 access()/listArtifacts()와 달리, 여기는 "그 서비스가 대답을 못 했다"는
  // 사실 자체가 호출자에게 보여야 하는 에러이므로 조용히 빈 값으로 뭉개지 않는다).

  /**
   * ArtifactListPage(설계서 07장 §2 프록시 대상)용 — listArtifacts()(pickability 계산용,
   * 위)와 달리 Calypso 응답 몸통을 그대로 돌려준다(설명·등록자·최신/released 버전 요약 등).
   */
  async listArtifactsFull(
    projectId: string | undefined,
    department: string | undefined,
    mine: boolean,
    knoxId: string,
    departments: string[],
    isAdmin: boolean,
  ): Promise<{ status: number; body: any } | null> {
    if (!this.baseUrl) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const params = new URLSearchParams();
      if (projectId) params.set('projectId', projectId);
      if (department) params.set('department', department);
      if (mine) params.set('mine', 'true');
      const res = await fetch(`${this.baseUrl}/artifacts?${params.toString()}`, {
        signal: controller.signal,
        headers: this.actorHeaders(knoxId, departments, isAdmin),
      });
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    } catch (e) {
      this.logger.warn(`Calypso listArtifactsFull error for project ${projectId} — ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** File Artifacts(B) 한 건의 전체 상세 — editors/viewGrants/versions 전부 포함. */
  async getArtifact(
    externalArtifactId: string,
    knoxId: string,
    departments: string[],
    isAdmin: boolean,
  ): Promise<{ status: number; body: any } | null> {
    if (!this.baseUrl) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/artifacts/${encodeURIComponent(externalArtifactId)}`, {
        signal: controller.signal,
        headers: this.actorHeaders(knoxId, departments, isAdmin),
      });
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    } catch (e) {
      this.logger.warn(`Calypso getArtifact error for ${externalArtifactId} — ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async createArtifact(
    input: {
      projectId: string;
      department: string;
      name: string;
      description?: string;
      network?: 'OA' | 'HPC';
      restrictView?: boolean;
    },
    knoxId: string,
    departments: string[],
    isAdmin: boolean,
  ): Promise<{ status: number; body: any } | null> {
    if (!this.baseUrl) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/artifacts`, {
        method: 'POST',
        signal: controller.signal,
        headers: { ...this.actorHeaders(knoxId, departments, isAdmin), 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    } catch (e) {
      this.logger.warn(`Calypso createArtifact error — ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 업로드 = File 콘텐츠면 파일들을 그대로 multipart로 Calypso에 재전송하고(§3.9,
   * 여러 개 가능), OA/HPC 콘텐츠면 파일 없이 viewUrl/hpcPath 텍스트만 보낸다. 이
   * 프로세스는 Multer가 이미 메모리에 올려준 `file.buffer`들만 들고 있고, 그걸 그대로
   * 한 번 더 포워딩할 뿐 디스크에 쓰거나 추가로 복제하지 않는다 — 브라우저 → SIREN BE →
   * Calypso 두 홉을 스트림처럼 다루되, multipart 인코딩 자체는 native FormData/Blob에
   * 맡긴다.
   */
  async uploadVersion(
    externalArtifactId: string,
    input: {
      files?: { buffer: Buffer; originalname: string; mimetype?: string }[];
      viewUrl?: string;
      hpcPath?: string;
      note?: string;
    },
    knoxId: string,
    departments: string[],
    isAdmin: boolean,
  ): Promise<{ status: number; body: any } | null> {
    if (!this.baseUrl) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TRANSFER_TIMEOUT_MS);
    try {
      const form = new FormData();
      for (const file of input.files ?? []) {
        form.append(
          'files',
          new Blob([file.buffer as unknown as BlobPart], { type: file.mimetype || 'application/octet-stream' }),
          file.originalname,
        );
      }
      if (input.note) form.append('note', input.note);
      if (input.viewUrl) form.append('viewUrl', input.viewUrl);
      if (input.hpcPath) form.append('hpcPath', input.hpcPath);
      const res = await fetch(`${this.baseUrl}/artifacts/${encodeURIComponent(externalArtifactId)}/versions`, {
        method: 'POST',
        signal: controller.signal,
        headers: this.actorHeaders(knoxId, departments, isAdmin),
        body: form,
      });
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    } catch (e) {
      this.logger.warn(`Calypso uploadVersion error for ${externalArtifactId} — ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 다운로드 — 응답 바디를 Buffer로 모으지 않고 Node Readable로 그대로 넘긴다(설계서
   * 07장 §2 "파일 전체를 메모리에 버퍼링하지 않는다"). 컨트롤러가 이 스트림을
   * StreamableFile로 그대로 클라이언트에 흘려보낸다.
   *
   * ★ 한 버전이 여러 파일을 가질 수 있다(§3.9, 사용자 결정) — **Calypso가 파일 개수를
   *   보고 하나면 그대로, 여러 개면 zip으로 묶어서 내려준다.** 여기서는 그 결정에
   *   관여하지 않고 응답을 그대로 스트리밍만 한다.
   */
  async downloadVersion(
    externalArtifactId: string,
    versionRef: string,
    knoxId: string,
    departments: string[],
    isAdmin: boolean,
  ): Promise<{
    status: number; stream: Readable | null; contentType: string | null; contentDisposition: string | null; body: any;
  } | null> {
    if (!this.baseUrl) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TRANSFER_TIMEOUT_MS);
    try {
      const res = await fetch(
        `${this.baseUrl}/artifacts/${encodeURIComponent(externalArtifactId)}/download/${encodeURIComponent(versionRef)}`,
        { signal: controller.signal, headers: this.actorHeaders(knoxId, departments, isAdmin) },
      );
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        return { status: res.status, stream: null, contentType: null, contentDisposition: null, body };
      }
      // Web ReadableStream(undici) → Node Readable — StreamableFile은 Node stream을 받는다.
      // finally의 clearTimeout은 여기서 걸지 않는다 — 스트리밍이 끝날 때까지 타이머가
      // 살아 있어야 큰 파일 전송 중 abort 가능성이 유지된다(호출부가 스트림을 다 쓰면
      // 타이머는 응답 완료로 자연히 무해해진다). AbortController는 요청 자체에만 쓰이고
      // 스트림 소비 지연으로 다시 켜지지 않는다.
      const stream = Readable.fromWeb(res.body as any);
      return {
        status: res.status,
        stream,
        contentType: res.headers.get('content-type'),
        contentDisposition: res.headers.get('content-disposition'),
        body: null,
      };
    } catch (e) {
      this.logger.warn(`Calypso downloadVersion error for ${externalArtifactId}@${versionRef} — ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async release(
    externalArtifactId: string,
    note: string | undefined,
    knoxId: string,
    departments: string[],
    isAdmin: boolean,
  ): Promise<{ status: number; body: any } | null> {
    if (!this.baseUrl) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/artifacts/${encodeURIComponent(externalArtifactId)}/release`, {
        method: 'POST',
        signal: controller.signal,
        headers: { ...this.actorHeaders(knoxId, departments, isAdmin), 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    } catch (e) {
      this.logger.warn(`Calypso release error for ${externalArtifactId} — ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** view 기본 개방(false) ↔ viewGrants로만 제한(true) 전환. */
  async setRestrictView(
    externalArtifactId: string,
    restrictView: boolean,
    knoxId: string,
    departments: string[],
    isAdmin: boolean,
  ): Promise<{ status: number; body: any } | null> {
    if (!this.baseUrl) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/artifacts/${encodeURIComponent(externalArtifactId)}/restrict-view`, {
        method: 'PATCH',
        signal: controller.signal,
        headers: { ...this.actorHeaders(knoxId, departments, isAdmin), 'Content-Type': 'application/json' },
        body: JSON.stringify({ restrictView }),
      });
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    } catch (e) {
      this.logger.warn(`Calypso setRestrictView error for ${externalArtifactId} — ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** editors 또는 viewGrants에 한 건 추가 — user/department 둘 다 받는다. */
  async addGrant(
    externalArtifactId: string,
    kind: 'editors' | 'view-grants',
    grant: CalypsoGrantInput,
    knoxId: string,
    departments: string[],
    isAdmin: boolean,
  ): Promise<{ status: number; body: any } | null> {
    return this.sendGrant('POST', externalArtifactId, kind, grant, knoxId, departments, isAdmin);
  }

  async removeGrant(
    externalArtifactId: string,
    kind: 'editors' | 'view-grants',
    grant: CalypsoGrantInput,
    knoxId: string,
    departments: string[],
    isAdmin: boolean,
  ): Promise<{ status: number; body: any } | null> {
    return this.sendGrant('DELETE', externalArtifactId, kind, grant, knoxId, departments, isAdmin);
  }

  private async sendGrant(
    method: 'POST' | 'DELETE',
    externalArtifactId: string,
    kind: 'editors' | 'view-grants',
    grant: CalypsoGrantInput,
    knoxId: string,
    departments: string[],
    isAdmin: boolean,
  ): Promise<{ status: number; body: any } | null> {
    if (!this.baseUrl) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/artifacts/${encodeURIComponent(externalArtifactId)}/${kind}`, {
        method,
        signal: controller.signal,
        headers: { ...this.actorHeaders(knoxId, departments, isAdmin), 'Content-Type': 'application/json' },
        body: JSON.stringify(grant),
      });
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    } catch (e) {
      this.logger.warn(`Calypso ${method} ${kind} error for ${externalArtifactId} — ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
