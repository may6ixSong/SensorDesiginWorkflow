import { isAdmin } from '@/app/providers/AuthProvider';

/**
 * IP 편집 권한 판정 (2026-08-25 결정).
 *
 * api는 IP 접근을 차단하지 않는다 - 과제의 모든 IP를 내려주고, 그 중 무엇을 보여주고
 * 무엇을 편집 가능하게 할지는 web이 정한다. api가 주는 myAccess는 순수하게
 * "내가 이 IP의 owner인가"이므로, 여기서 Admin(Group === 'Admin') super 권한을 얹는다.
 *
 * ⚠ 서버 응답 마스킹은 그대로 유지된다 - Admin이라도 owner가 아닌 IP의 작업중(minor)
 * 버전과 메모는 애초에 응답에 담겨오지 않는다(설계서 6.1). 즉 Admin은 "편집 UI가
 * 열린다"는 의미이고, 남이 아직 릴리즈하지 않은 파일까지 보게 되는 것은 아니다.
 */
export const canEditIp = (ip?: { myAccess: 'edit' | 'view' } | null): boolean =>
  isAdmin() || ip?.myAccess === 'edit';

/** 과제 안에서 편집 가능한 IP가 하나라도 있는가 (과제 정보 수정 게이트). */
export const canManageProject = (ips?: { myAccess: 'edit' | 'view' }[] | null): boolean =>
  isAdmin() || (ips ?? []).some((ip) => ip.myAccess === 'edit');
