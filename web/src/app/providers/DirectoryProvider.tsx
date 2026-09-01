import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from 'react';
import { Employee, getEmployeesByIDs } from '@/service/user-service';
import { useAuth } from './AuthProvider';

/**
 * 실사용자 디렉토리 — shared/constants/mock-users.ts(TODO 목업)를 대체한다.
 *
 * api/는 사용자를 KnoxID 문자열로만 다루므로(users 컬렉션 없음), 실명/부서 표시는
 * 전부 SDP_COMMON_API에서 조회한다. 이름은 현재 UI 언어(AuthProvider의 user.Language)에
 * 맞춰 한글/영문을 고른다 — SSM_WEB의 MemberCard 패턴과 동일.
 *
 * 컴포넌트는 훅을 배열 콜백 안에서 부를 수 없으므로(Rules of Hooks), 이 Provider는
 * "훅 하나 호출 → 그 결과인 순수 함수 resolveUser()를 .map() 안에서 자유롭게 호출"
 * 형태로 설계했다. resolveUser()가 아직 캐시에 없는 knoxId를 보면 조회를 예약하고
 * (짧게 디바운스해 여러 컴포넌트의 요청을 한 번의 배치 호출로 묶는다), 응답이 오면
 * 캐시를 갱신해 리렌더를 트리거한다 — 그 사이에는 knoxId 문자열을 이름 자리에 대신 보여준다.
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
