/**
 * TODO: 목업 데이터 — 전사 공통 플랫폼 사용자 API(USER_GROUP_API)를 대신하는 임시
 * 사용자 디렉토리다. api/는 더 이상 사용자 정보를 보관하지 않고 KnoxID 문자열만
 * 주고받으므로(이름/부서/색은 공통 플랫폼 소유), 여기 있는 조회는 나중에
 * `${import.meta.env.USER_GROUP_API}/user/...` 로 해결되도록 교체해야 한다.
 *
 * knoxId 값은 api/의 목업 시드 데이터와 문자 단위로 일치해야 한다.
 */

export interface DirectoryUser {
  knoxId: string;
  name: string;
  department: string;
  /** 아바타 배경색 */
  color: string;
}

/** 미등록 knoxId용 아바타 색 (이름을 알 수 없을 때). */
const FALLBACK_COLOR = '#5c6d84';

export const MOCK_USERS: DirectoryUser[] = [
  { knoxId: 'sdp.op', name: 'SDP System Operator', department: 'analog', color: '#0c9a83' },
  { knoxId: 'jihoon.park', name: 'Jihoon Park', department: 'analog', color: '#5849cf' },
  { knoxId: 'sumin.lee', name: 'Sumin Lee', department: 'digital', color: '#2563c9' },
  { knoxId: 'hayoon.jung', name: 'Hayoon Jung', department: 'solution', color: '#ac6f08' },
  { knoxId: 'dain.choi', name: 'Dain Choi', department: 'pte', color: '#c8352c' },
  { knoxId: 'sehun.oh', name: 'Sehun Oh', department: 'analog', color: '#3aa66b' },
  { knoxId: 'jiyeon.han', name: 'Jiyeon Han', department: 'aps', color: '#b3521e' },
  { knoxId: 'dahyun.ryu', name: 'Dahyun Ryu', department: 'pipd', color: '#7a4fbf' },
];

/**
 * knoxId → 디렉토리 항목. 모르는 knoxId여도 렌더링이 깨지지 않도록 항상 값을 돌려준다
 * (이름 자리에는 knoxId를 그대로 쓴다).
 */
export function findDirectoryUser(knoxId: string | null | undefined): DirectoryUser {
  const found = knoxId ? MOCK_USERS.find((u) => u.knoxId === knoxId) : undefined;
  if (found) return found;
  return {
    knoxId: knoxId ?? '',
    name: knoxId ?? '—',
    department: '',
    color: FALLBACK_COLOR,
  };
}
