import { Injectable, Logger } from '@nestjs/common';

const REQUEST_TIMEOUT_MS = 10_000;
/** 첫 시도 뒤 재시도 간격 — 3번 재시도한 뒤에도 안 되면 실패로 닫는다(사용자 결정 C8). */
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000];
const CONCURRENCY = 4;

export interface DispatchResult {
  ok: boolean;
  attempts: number;
  jobId: string | null;
  error: string | null;
}

/**
 * Auto Run trigger의 in-process 큐와 HTTP 전송(사용자 결정 G3 — 별도 큐 인프라 없이 프로세스
 * 안에서 처리한다). 재시작하면 큐가 비지만, AutoRunService가 부팅 시 queued 실행을 다시
 * 넣는다.
 *
 * 재시도 대상은 "그 서비스에 닿지 않았다"로 볼 수 있는 것뿐이다 — 네트워크 오류·타임아웃·
 * 5xx·429. 그 외 4xx는 서비스가 요청을 읽고 거절한 것이라 다시 보내도 같다.
 */
@Injectable()
export class AutoRunDispatcher {
  private readonly logger = new Logger(AutoRunDispatcher.name);
  private readonly queue: (() => Promise<void>)[] = [];
  private running = 0;

  enqueue(job: () => Promise<void>): void {
    this.queue.push(job);
    this.pump();
  }

  private pump(): void {
    while (this.running < CONCURRENCY && this.queue.length) {
      const job = this.queue.shift() as () => Promise<void>;
      this.running += 1;
      job()
        .catch((e) => this.logger.warn(`auto-run job failed — ${(e as Error).message}`))
        .finally(() => {
          this.running -= 1;
          this.pump();
        });
    }
  }

  async post(url: string, token: string, body: unknown): Promise<DispatchResult> {
    let lastError = 'unknown error';
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        const text = await res.text().catch(() => '');
        if (res.ok) {
          let jobId: string | null = null;
          try {
            const parsed = text ? JSON.parse(text) : null;
            if (parsed && typeof parsed.jobId === 'string') jobId = parsed.jobId;
          } catch {
            // 응답 몸체는 선택이다 — 2xx면 받아들인 것으로 본다.
          }
          return { ok: true, attempts: attempt + 1, jobId, error: null };
        }
        lastError = `The service answered ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`;
        const retryable = res.status >= 500 || res.status === 429;
        if (!retryable) return { ok: false, attempts: attempt + 1, jobId: null, error: lastError };
      } catch (e) {
        lastError = (e as Error).name === 'AbortError'
          ? `The service did not answer within ${REQUEST_TIMEOUT_MS / 1000}s.`
          : `Could not reach the service — ${(e as Error).message}`;
      } finally {
        clearTimeout(timer);
      }
      this.logger.warn(`auto-run trigger to ${url} failed (attempt ${attempt + 1}) — ${lastError}`);
    }
    return { ok: false, attempts: RETRY_DELAYS_MS.length + 1, jobId: null, error: lastError };
  }
}
