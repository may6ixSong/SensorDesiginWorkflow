import {
  Controller,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const KEEP = 50;
const TIMEOUT_MS = 10_000;

interface ProbeCheck {
  source: string;
  ok: boolean;
  detail: string;
}

interface ProbeRecord {
  jobId: string;
  receivedAt: string;
  triggerRunId: string | null;
  status: 'received' | 'running' | 'succeeded' | 'failed';
  checks: ProbeCheck[];
  /** 받은 payload 그대로 — source 토큰만 가린다(목록 조회로 새지 않게). */
  payload: unknown;
}

/**
 * ★ 개발/검증 전용 Auto Run 수신기(SIREN 설계서 10장 §9) — Calypso는 Auto Run을 지원하지
 *   않는다(사용자 결정 C5). 이건 실제 서비스(HPC Service)를 붙이기 전에 "SIREN이 보낸
 *   trigger가 계약대로 오는가"를 끝까지 확인하려는 probe다. `AUTO_RUN_PROBE_ENABLED=true`일
 *   때만 동작하고(아니면 404), SIREN 쪽도 `AUTO_RUN_CALYPSO_PROBE=true`여야 Calypso node에
 *   Auto Run을 걸 수 있다.
 *
 * 하는 일 — 실제 서비스가 해야 할 일을 그대로 흉내 낸다:
 *   1) Bearer token 확인 → payload 모양 확인 → 202
 *   2) status 콜백 running
 *   3) Calypso source는 payload의 contentsUrl을 accessToken으로 **실제 HTTP로** 불러 본다
 *   4) (화면에서 실행 중 표시가 보이도록) 잠깐 기다린 뒤 succeeded/failed 콜백 — 버전은
 *      만들지 않는다
 * `GET /auto-run/triggers`로 최근 받은 payload와 검사 결과를 볼 수 있다.
 */
@Controller('auto-run/triggers')
export class AutoRunProbeController {
  private readonly logger = new Logger(AutoRunProbeController.name);
  private readonly records: ProbeRecord[] = [];
  private seq = 0;

  constructor(private readonly config: ConfigService) {}

  private assertEnabledAndAuthorized(req: { headers?: Record<string, unknown> }): void {
    if (this.config.get<boolean>('autoRunProbeEnabled') !== true) throw new NotFoundException();
    const header = req.headers?.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token || token !== this.config.get<string>('calypsoEventToken')) {
      throw new UnauthorizedException('Unknown token.');
    }
  }

  @Get()
  list(@Req() req: any) {
    this.assertEnabledAndAuthorized(req);
    return { data: this.records };
  }

  @Post()
  @HttpCode(202)
  receive(@Req() req: any) {
    this.assertEnabledAndAuthorized(req);
    const payload = req.body ?? {};
    const problems = this.shapeProblems(payload);
    const jobId = `probe-${++this.seq}`;
    const record: ProbeRecord = {
      jobId,
      receivedAt: new Date().toISOString(),
      triggerRunId: typeof payload.triggerRunId === 'string' ? payload.triggerRunId : null,
      status: 'received',
      checks: problems.map((p) => ({ source: 'payload', ok: false, detail: p })),
      payload: this.redact(payload),
    };
    this.records.unshift(record);
    this.records.splice(KEEP);
    this.logger.log(`auto-run trigger received ${record.triggerRunId} (${(payload.sources ?? []).length} sources)`);

    if (record.triggerRunId && typeof payload?.callback?.statusUrl === 'string') {
      void this.process(record, payload, problems);
    }
    return { accepted: true, jobId };
  }

  /** 계약상 반드시 있어야 하는 필드(SIREN 설계서 08장 §1.6). */
  private shapeProblems(p: any): string[] {
    const out: string[] = [];
    if (typeof p?.triggerRunId !== 'string') out.push('triggerRunId is missing');
    if (typeof p?.runAs !== 'string') out.push('runAs is missing');
    if (typeof p?.project?.code !== 'string' || typeof p?.project?.revision !== 'string') out.push('project code/revision is missing');
    if (typeof p?.workflow?.id !== 'string' || typeof p?.node?.id !== 'string') out.push('workflow/node is missing');
    if (typeof p?.target?.externalArtifactId !== 'string') out.push('target.externalArtifactId is missing');
    if (!Array.isArray(p?.sources) || p.sources.length === 0) out.push('sources is empty');
    if (typeof p?.callback?.statusUrl !== 'string') out.push('callback.statusUrl is missing');
    for (const [i, s] of (Array.isArray(p?.sources) ? p.sources : []).entries()) {
      if (typeof s?.version?.versionLabel !== 'string') out.push(`sources[${i}].version.versionLabel is missing`);
    }
    return out;
  }

  private redact(p: any): unknown {
    try {
      const copy = JSON.parse(JSON.stringify(p));
      for (const s of copy?.sources ?? []) {
        if (s?.calypso?.accessToken) s.calypso.accessToken = `${String(s.calypso.accessToken).slice(0, 12)}…`;
      }
      return copy;
    } catch {
      return null;
    }
  }

  private async process(record: ProbeRecord, payload: any, problems: string[]): Promise<void> {
    const statusUrl: string = payload.callback.statusUrl;
    const token = this.config.get<string>('calypsoEventToken') ?? '';
    const delay = this.config.get<number>('autoRunProbeDelayMs') ?? 5000;

    await this.sleep(500);
    record.status = 'running';
    await this.callback(statusUrl, token, { triggerRunId: record.triggerRunId, status: 'running', externalJobId: record.jobId });

    for (const s of payload.sources ?? []) {
      const label = `${s?.name ?? '?'}@${s?.version?.versionLabel ?? '?'}`;
      if (s?.calypso) {
        record.checks.push(await this.checkCalypsoSource(label, s));
      } else {
        const where = s?.version?.hpcPath ?? s?.version?.viewUrl ?? null;
        record.checks.push({
          source: label,
          ok: true,
          detail: `${s?.serviceName ?? s?.serviceKey ?? 'service'} source — ${where ? `location ${where}` : 'no path/link in SIREN cache'}; baseUrl ${s?.serviceBaseUrl ?? '(none)'}`,
        });
      }
    }

    await this.sleep(delay);
    const failed = record.checks.filter((c) => !c.ok);
    record.status = failed.length || problems.length ? 'failed' : 'succeeded';
    const message = record.status === 'succeeded'
      ? `Probe received the trigger and verified ${record.checks.length} source(s). No version was created.`
      : `Probe found problems: ${[...problems, ...failed.map((c) => `${c.source}: ${c.detail}`)].join('; ')}`;
    await this.callback(statusUrl, token, { triggerRunId: record.triggerRunId, status: record.status, message });
  }

  private async checkCalypsoSource(label: string, s: any): Promise<ProbeCheck> {
    const { contentsUrl, accessToken } = s.calypso ?? {};
    if (typeof contentsUrl !== 'string' || typeof accessToken !== 'string') {
      return { source: label, ok: false, detail: 'calypso.contentsUrl/accessToken missing' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(contentsUrl, { signal: controller.signal, headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) return { source: label, ok: false, detail: `contents answered ${res.status}` };
      const body: any = await res.json();
      if (body?.versionRef !== s?.version?.versionRef) {
        return { source: label, ok: false, detail: `contents returned versionRef ${body?.versionRef}, expected ${s?.version?.versionRef}` };
      }
      return {
        source: label,
        ok: true,
        detail: `contents OK — ${body.files?.length ?? 0} file(s), ${body.links?.length ?? 0} link(s), ${body.paths?.length ?? 0} path(s)`,
      };
    } catch (e) {
      return { source: label, ok: false, detail: `contents call failed — ${(e as Error).message}` };
    } finally {
      clearTimeout(timer);
    }
  }

  private async callback(url: string, token: string, body: Record<string, unknown>): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) this.logger.warn(`auto-run status callback ${body.status} failed (${res.status})`);
    } catch (e) {
      this.logger.warn(`auto-run status callback ${body.status} error — ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
