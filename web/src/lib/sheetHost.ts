/**
 * SIREN ↔ sheet-host(SpreadJS iframe) 메시지 규약 v1 — 설계서 11장 §6, 반대편 구현은
 * sheet-host/src/sheetHost/protocol.js.
 *
 * SpreadJS 라이선스가 SIREN 도메인이 아니라 SDP_SPA 도메인에 묶여 있어서, 편집기는 그쪽
 * 페이지(`SHEET_HOST_URL`)를 iframe으로 띄우고 postMessage로만 주고받는다.
 *
 * ★ 받을 때: 그 iframe 창(event.source)에서, sheet-host origin으로 온 규약 메시지만.
 * ★ 보낼 때: targetOrigin을 항상 sheet-host origin으로 — '*'를 쓰지 않는다.
 */
export const SHEET_CHANNEL = 'siren-sheet';
export const SHEET_PROTOCOL_VERSION = 1;

export const SHEET_HOST_URL: string = import.meta.env.SHEET_HOST_URL || '';

export function sheetHostOrigin(): string | null {
  try {
    return SHEET_HOST_URL ? new URL(SHEET_HOST_URL).origin : null;
  } catch {
    return null;
  }
}

export interface SheetMessage {
  channel: typeof SHEET_CHANNEL;
  v: typeof SHEET_PROTOCOL_VERSION;
  type: string;
  requestId?: string;
  payload?: any;
}

export function isSheetMessage(data: unknown): data is SheetMessage {
  const d = data as SheetMessage | null;
  return !!d && typeof d === 'object' && d.channel === SHEET_CHANNEL && d.v === SHEET_PROTOCOL_VERSION
    && typeof d.type === 'string';
}

let seq = 0;
function nextRequestId(): string {
  seq += 1;
  return `${Date.now().toString(36)}-${seq}`;
}

interface Pending {
  expect: string;
  resolve: (payload: any) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** 요청 하나에 답 하나(requestId로 짝을 맞춘다). 답 대신 sheet:error가 오면 reject. */
export class SheetHostBridge {
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly target: Window, private readonly origin: string) {}

  send(type: string, payload?: unknown, requestId?: string): void {
    const msg: SheetMessage = { channel: SHEET_CHANNEL, v: SHEET_PROTOCOL_VERSION, type };
    if (requestId) msg.requestId = requestId;
    if (payload !== undefined) msg.payload = payload;
    this.target.postMessage(msg, this.origin);
  }

  request<T = any>(type: string, payload: unknown, expect: string, timeoutMs = 120_000): Promise<T> {
    const requestId = nextRequestId();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('The sheet editor did not answer in time.'));
      }, timeoutMs);
      this.pending.set(requestId, { expect, resolve, reject, timer });
      this.send(type, payload, requestId);
    });
  }

  /** 답장이면 처리하고 true. 요청과 무관한 알림(ready/dirty)은 false. */
  settle(msg: SheetMessage): boolean {
    if (!msg.requestId) return false;
    const p = this.pending.get(msg.requestId);
    if (!p) return false;
    this.pending.delete(msg.requestId);
    clearTimeout(p.timer);
    if (msg.type === 'sheet:error') p.reject(new Error(msg.payload?.message ?? 'The sheet editor reported an error.'));
    else if (msg.type === p.expect) p.resolve(msg.payload);
    else p.reject(new Error(`Unexpected answer ${msg.type}.`));
    return true;
  }

  dispose(): void {
    this.pending.forEach((p) => {
      clearTimeout(p.timer);
      p.reject(new Error('The sheet editor was closed.'));
    });
    this.pending.clear();
  }
}
