import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Calypso source 읽기 전용 토큰(설계서 10장 §6.2) — trigger를 받은 서비스가 source 산출물을
 * Calypso에서 직접 받아갈 때 `Authorization: Bearer`로 싣는다.
 *
 * ★ 서비스별 이벤트 토큰(ArtifactService.token)을 그대로 넘기지 않는 이유: 그 토큰은 "이
 *   서비스가 SIREN에 이벤트를 보낸다"는 증명이라, 넘겨받은 쪽이 그 서비스인 척 version
 *   이벤트를 보낼 수 있게 된다. 이 토큰은 **artifact 하나 · 버전 하나 · 읽기 전용 · 만료
 *   있음**으로 범위가 좁다.
 *
 * 형식: `base64url(JSON{a,r,e})` + "." + `base64url(HMAC-SHA256(secret, 앞부분))`
 *   a = Calypso artifact id, r = versionRef, e = 만료(epoch 초)
 *
 * ★ calypso/src/auto-run/source-token.ts가 같은 알고리즘으로 검증한다 — 한쪽을 고치면 반드시
 *   다른 쪽도 같이 고친다.
 */
export interface SourceTokenClaims {
  a: string;
  r: string;
  e: number;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function sign(secret: string, body: string): string {
  return b64url(createHmac('sha256', secret).update(body).digest());
}

export function signSourceToken(secret: string, claims: SourceTokenClaims): string {
  const body = b64url(Buffer.from(JSON.stringify(claims), 'utf8'));
  return `${body}.${sign(secret, body)}`;
}

/** 서명·만료가 맞으면 claims, 아니면 null. */
export function verifySourceToken(secret: string, token: string, now = Date.now()): SourceTokenClaims | null {
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (typeof claims?.a !== 'string' || typeof claims?.r !== 'string' || typeof claims?.e !== 'number') return null;
    if (claims.e * 1000 < now) return null;
    return claims as SourceTokenClaims;
  } catch {
    return null;
  }
}
