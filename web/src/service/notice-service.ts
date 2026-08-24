import axios from 'axios';
import type { NoticeItem } from '@/types/notice';

/** SYSTEM_API is blank/unreachable in dev — resolve to an empty list rather than throwing. */
export async function getNoticesByStatus(): Promise<NoticeItem[]> {
  if (!import.meta.env.SYSTEM_API) return [];
  try {
    const res = await axios.get<NoticeItem[]>(`${import.meta.env.SYSTEM_API}/notice/SIREN/status/posting`, {
      headers: { 'client-id': 'siren.admin', 'Content-Type': 'application/json' },
    });
    return res.data;
  } catch {
    return [];
  }
}
