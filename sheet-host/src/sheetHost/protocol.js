/**
 * SIREN ↔ sheet-host 메시지 규약 v1 (SIREN docs/11-sheet-artifacts.md §6).
 *
 * 모든 메시지: { channel: 'siren-sheet', v: 1, type, requestId?, payload? }
 *
 * SIREN → host
 *   sheet:load         { mode: 'edit' | 'view', document: object | null, seed: object | null }
 *   sheet:save         { includeXlsx: boolean }
 *   sheet:exportExcel  {}
 *   sheet:importExcel  { file: File }
 *
 * host → SIREN (요청에 대한 답은 같은 requestId)
 *   sheet:ready     { spreadVersion }        — 부모 origin을 아직 몰라 '*'로 보낸다. 데이터는 없다.
 *   sheet:loaded    {}
 *   sheet:saved     { document, grid, xlsx: Blob | null }
 *   sheet:exported  { xlsx: Blob }
 *   sheet:imported  {}
 *   sheet:dirty     { dirty: true }          — load/save 뒤 첫 수정 때 한 번
 *   sheet:error     { message }
 *
 * ★ 기존 SDP_SPA /spreadSheet 규약(SFM용)을 재사용하지 않는다 — origin 검사·requestId·error가
 *   없고 양방향 type 이름이 같아 섞인다(조사 보고서 §4.2~4.3).
 */
export const CHANNEL = 'siren-sheet';
export const PROTOCOL_VERSION = 1;

export function envelope(type, requestId, payload) {
  const msg = { channel: CHANNEL, v: PROTOCOL_VERSION, type };
  if (requestId) msg.requestId = requestId;
  if (payload !== undefined) msg.payload = payload;
  return msg;
}

export function isProtocolMessage(data) {
  return !!data && typeof data === 'object' && data.channel === CHANNEL && data.v === PROTOCOL_VERSION
    && typeof data.type === 'string';
}
