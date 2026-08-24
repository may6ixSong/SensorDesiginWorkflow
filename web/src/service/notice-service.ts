import axios from 'axios';
import type { Notice } from '@/types/notice';

const READ_IDS_KEY = 'siren-notice-read-ids';

/** SYSTEM_API is blank/unreachable in dev — resolves to an empty list rather than throwing. */
export class NoticeService {
  async getNoticesByStatus(app: string, status: string): Promise<Notice[]> {
    if (!import.meta.env.SYSTEM_API) return [];
    try {
      const res = await axios.get<Notice[]>(`${import.meta.env.SYSTEM_API}/notice/${app}/status/${status}`);
      return res.data;
    } catch {
      return [];
    }
  }
}

function readIds(): number[] {
  try {
    const raw = localStorage.getItem(READ_IDS_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

export function getUnreadNotices(notices: Notice[]): Notice[] {
  const readIdSet = new Set(readIds());
  return notices.filter((n) => !readIdSet.has(n.nID));
}

export function markNoticeRead(notice: Notice): void {
  const ids = new Set(readIds());
  ids.add(notice.nID);
  try {
    localStorage.setItem(READ_IDS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event('sdp:notice-read'));
}
