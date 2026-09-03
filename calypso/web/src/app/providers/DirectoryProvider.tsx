import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from 'react';
import { Employee, getEmployeesByIDs } from '@/service/user-service';
import { useAuth } from './AuthProvider';

/**
 * 실사용자 디렉토리 — SIREN web의 DirectoryProvider와 동일한 구현이다.
 *
 * api/는 사용자를 KnoxID 문자열로만 다루므로, 실명/부서 표시는 전부
 * SDP_COMMON_API에서 조회한다. 이름은 현재 UI 언어(AuthProvider의 user.Language)에
 * 맞춰 한글/영문을 고른다.
 */

export interface DirectoryUser {
  knoxId: string;
  name: string;
  department: string;
  /** 아바타 배경색 — 실제 사용자 데이터에는 색이 없으므로 knoxId로부터 결정적으로 만든다. */
  color: string;
}

const AVATAR_COLORS = [
  '#2f6b4a', '#6b5083', '#2563c9', '#ac6f08', '#c8352c',
  '#3aa66b', '#b3521e', '#7a4fbf', '#1d7ec2', '#a13d8f',
];
const FALLBACK_COLOR = '#5c6d84';

export function colorForKnoxId(knoxId: string): string {
  if (!knoxId) return FALLBACK_COLOR;
  let hash = 0;
  for (let i = 0; i < knoxId.length; i += 1) {
    hash = (hash * 31 + knoxId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface DirectoryContextType {
  resolveUser: (knoxId: string | null | undefined) => DirectoryUser;
}

const DirectoryContext = createContext<DirectoryContextType>({
  resolveUser: (knoxId) => ({
    knoxId: knoxId ?? '', name: knoxId ?? '—', department: '', color: FALLBACK_COLOR,
  }),
});

export function DirectoryProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const language = user?.Language === 'ko' ? 'ko' : 'en';

  const [cache, setCache] = useState<Map<string, Employee>>(new Map());
  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  const pendingRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    const ids = Array.from(pendingRef.current).filter(
      (id) => !cacheRef.current.has(id) && !inFlightRef.current.has(id),
    );
    pendingRef.current.clear();
    if (!ids.length) return;
    ids.forEach((id) => inFlightRef.current.add(id));

    Promise.all(
      chunk(ids, 100).map((idChunk) =>
        getEmployeesByIDs(idChunk.join(',')).catch(() => ({ employees: [] as Employee[] }))),
    ).then((responses) => {
      setCache((prev) => {
        const next = new Map(prev);
        responses.forEach((res) => {
          (res.employees ?? []).forEach((emp) => {
            if (emp.userId) next.set(emp.userId, emp);
          });
        });
        return next;
      });
    }).finally(() => {
      ids.forEach((id) => inFlightRef.current.delete(id));
    });
  }, []);

  const request = useCallback((knoxId: string) => {
    if (cacheRef.current.has(knoxId) || inFlightRef.current.has(knoxId) || pendingRef.current.has(knoxId)) {
      return;
    }
    pendingRef.current.add(knoxId);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, 30);
  }, [flush]);

  const resolveUser = useCallback((knoxId: string | null | undefined): DirectoryUser => {
    const id = (knoxId ?? '').trim();
    if (!id) return { knoxId: '', name: '—', department: '', color: FALLBACK_COLOR };

    const emp = cache.get(id);
    if (!emp) {
      request(id);
      return { knoxId: id, name: id, department: '', color: colorForKnoxId(id) };
    }

    const name = language === 'ko'
      ? (emp.fullName || emp.enFullName || id)
      : (emp.enFullName || emp.fullName || id);
    const department = language === 'ko'
      ? (emp.departmentName || emp.enDepartmentName || '')
      : (emp.enDepartmentName || emp.departmentName || '');

    return { knoxId: id, name, department, color: colorForKnoxId(id) };
  }, [cache, language, request]);

  const value = useMemo(() => ({ resolveUser }), [resolveUser]);

  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>;
}

/**
 * const { resolveUser } = useDirectory(); 를 컴포넌트 최상단에서 한 번만 호출하고,
 * 반환된 resolveUser(knoxId)는 .map() 등 어디서든 자유롭게 호출한다(훅이 아닌 순수 함수).
 */
export function useDirectory() {
  return useContext(DirectoryContext);
}
