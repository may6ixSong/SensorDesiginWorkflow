import { useCallback, useState } from 'react';
import Cookies from 'js-cookie';

/**
 * project 범례 겸 필터(사용자 요청) — 캘린더 legend, bell 팝업, My Assignment Overview에
 * 각각 하나씩 있고, 서로 다른 화면이라 쿠키도 따로 나눈다. 상태는 "제외된 project id
 * 집합"이다 — project가 새로 생겨도 기본값이 항상 "전부 보임"이 되도록(화이트리스트가
 * 아니라 블랙리스트로 저장하는 이유).
 *
 * ★ 다음 접속에도 이어지도록 쿠키에 남긴다(사용자 요청) — 읽음 추적(releaseReadTracker)과
 *   같은 패턴이다.
 */
function readExcluded(cookieName: string): Set<string> {
  const raw = Cookies.get(cookieName);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeExcluded(cookieName: string, ids: Set<string>): void {
  Cookies.set(cookieName, JSON.stringify(Array.from(ids)), { expires: 365, sameSite: 'lax' });
}

export function useProjectFilter(cookieName: string) {
  const [excludedIds, setExcludedIds] = useState<Set<string>>(() => readExcluded(cookieName));

  const toggle = useCallback(
    (projectId: string) => {
      setExcludedIds((prev) => {
        const next = new Set(prev);
        if (next.has(projectId)) next.delete(projectId);
        else next.add(projectId);
        writeExcluded(cookieName, next);
        return next;
      });
    },
    [cookieName],
  );

  return { excludedIds, toggle };
}
