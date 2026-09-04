import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import Cookies from 'js-cookie';
import axios from 'axios';
import { addEventLog } from '../../service/event-log-service';
import { useTranslation } from 'react-i18next';
import { setApiActingAs, setApiKnoxId, setApiUserGroup } from '../../api/client';
import { setCalypsoActingAsGroup } from '../../api/calypsoClient';
import { getEmployeesByIDs } from '../../service/user-service';
import { useThemeMode } from '../../theme/ThemeModeContext';

// Ported from SSM_WEB's AuthProvider.tsx (service name swapped to SIREN only
// where it names the service itself — cookie name, event name).
//
// SSM_WEB과의 유일한 구조적 차이: offline 분기가 없다. SIREN은 offline 환경이
// 없으므로 isOnLine()/Guest 사용자/OFFLINE_LANG_KEY를 모두 걷어냈다 - 언어·테마는
// 항상 USER_GROUP_API에서 오고, 실패하면 User 클래스의 기본값('en'/'light')을 쓴다.
//
// TODO: SSO 연동 지점 - 실제 IdP 연동 시 이 파일만 교체하면 된다.

export type Language = 'ko' | 'en';
export type Theme = 'dark' | 'light';

export class User {
  KnoxID = '';
  Name = '';
  Department = '';
  Group: string = 'Developer';
  Authority: Record<string, number> = {
    PRJCRUD: 4,
    NOTMGR: 4,
    ACNTMGR: 4,
    TEMPMGR: 4,
  };
  GrpAuthority: Record<string, unknown> = {};
  EnName = '';
  EnDepartment = '';
  Language: Language = 'en';
  Theme: Theme = 'light';

  setUserInfoFromADSSOResponse(adssoResponse: ADSSOResponse) {
    this.KnoxID = adssoResponse.loginid;
    this.Name = adssoResponse.username ?? '';
    this.Department = adssoResponse.deptname ?? '';
    this.EnName = adssoResponse.username_en ?? '';
    this.EnDepartment = adssoResponse.deptname_en ?? '';
  }
}

export type ADSSOResponse = {
  loginid: string;
  deptid?: string;
  mail?: string;
  deptname?: string;
  username?: string;
  username_en?: string;
  deptname_en?: string;
  intcode?: string;
  intname?: string;
  compname?: string;
}

type AuthContextType = {
  /** 지금 화면에 보이는 신원 — 시뮬레이션 중이면 대상 사용자, 아니면 실제 로그인 사용자. */
  user: User | null;
  /** 실제 로그인 사용자 — 시뮬레이션 중에도 절대 안 바뀐다. */
  realUser: User | null;
  updateUserPrefs: <K extends keyof User>(field: K, value: User[K]) => void,
  loginSuccess: boolean;
  /**
   * 지금 화면에 보이는 신원 기준 — 시뮬레이션 중이면 대상이 USER_GROUP_API에 없는
   * 경우, 아니면 실제 로그인 사용자가 없는 경우. 어느 쪽이든 Home을 포함해 앱 전체를
   * 막는다(App.tsx의 LoginGate) — 플랫폼에 없는 사람은 권한이 아예 없어야 한다(사용자
   * 요청). 실제 로그인 실패는 예전처럼 자동으로 플랫폼 사용자를 만들어 기본값으로
   * 들여보내지 않는다. 시뮬레이션은 반대로 **막지 않고 그대로 켜준다** — Admin이
   * "등록 안 된 사람은 실제로 뭘 보게 되는지"(예: 나중에 만들 접근 신청 페이지)를
   * 확인하려면 그 신원으로 들어가 볼 수 있어야 하고, 들어간 다음 이 값이 true가 되어
   * AccessDeniedPage로 리다이렉트되는 것 자체가 검증하려는 동작이다.
   */
  accountDenied: boolean;
  /**
   * 지금 화면에 보이는 신원(user) 기준 — 시뮬레이션 중이면 대상 사용자 본인이 Admin일
   * 때만 true다("그 사람 입장에서 정확히 그 사람 권한으로" 보여야 한다는 사용자 요청).
   * Workflow/Project 편집 등 앱 전역의 페이지 권한 체크가 전부 이 값을 본다.
   */
  isAdmin: boolean;
  /** realUser.Group === 'Admin' — 시뮬레이션 중에도 절대 안 바뀐다. 시뮬레이터를 켜고 끄는
   * 주체(ProfileButton)만 이 값을 본다 — 그래야 Admin이 자기가 만든 시뮬레이션에 갇히지 않는다. */
  isRealAdmin: boolean;
  isSimulating: boolean;
  /**
   * 특정 사용자 화면을 그대로 재현한다(§13) — Admin 전용. 대상의 실제 프로필을 가져와
   * 이름/부서/언어까지 전부 그 사용자 것으로 바꾼다("Name부터 모든 setting으로 변환",
   * 사용자 요청) — api 헤더(X-Acting-As)만 바꾸던 예전과 달리 화면 자체가 바뀐다.
   * 대상을 찾을 수 없으면 reject하고 아무것도 바꾸지 않는다.
   */
  startSimulation: (knoxId: string) => Promise<void>;
  stopSimulation: () => void;
};

const DEV_USER: ADSSOResponse = {
  loginid: 'sdp.op',
  deptname: 'Sensor 설계팀(S.LSI)',
  username: 'SDP 시스템 운영',
  username_en: "SDP System Operator",
  deptname_en: 'Sensor Development Team(S.LSI)'
};
const isDev = import.meta.env.ENVIRONMENT === 'dev';

const AuthContext = createContext<AuthContextType>({
  user: null,
  realUser: null,
  updateUserPrefs: (_field, _value) => {},
  loginSuccess: false,
  accountDenied: false,
  isAdmin: false,
  isRealAdmin: false,
  isSimulating: false,
  startSimulation: async () => {},
  stopSimulation: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { i18n } = useTranslation();
  const { setMode: setThemeMode } = useThemeMode();
  const [realUser, setRealUser] = useState<User>({} as User);
  const [simulatedUser, setSimulatedUser] = useState<User | null>(null);
  const [loginSuccess, openGate] = useState<boolean>(false);
  /** 실제 로그인 사용자가 플랫폼에 없는 경우 — 시뮬레이션과 무관하게 항상 이 값 그대로. */
  const [realAccountDenied, setRealAccountDenied] = useState<boolean>(false);
  /** 지금 시뮬레이션 중인 대상이 플랫폼에 없는 경우 — 시뮬레이션이 꺼지면 의미 없어진다. */
  const [simulatedAccountDenied, setSimulatedAccountDenied] = useState<boolean>(false);
  const user = simulatedUser ?? realUser;
  const accountDenied = simulatedUser ? simulatedAccountDenied : realAccountDenied;
  const isAdmin = useMemo(() => user.Group === "Admin", [user]);
  const isRealAdmin = useMemo(() => realUser.Group === "Admin", [realUser]);

  useEffect(() => {
    if (isDev) {
      setUserSystemInfo(DEV_USER);
    }
    else {
      const cookieData = Cookies.get('ADSSO_USER');
      if (cookieData) {
        const data = decodeURIComponent(cookieData);
        const userInfo = JSON.parse(data.replace(/\\n/g, '').replace(/\\r/g, '').replace(/\\t/g, ''));
        setUserSystemInfo(userInfo);

        // ADFSLogin이 ADSSO_RETURN_URL로 돌아오면서 붙이는 ?auth={uuid}를 주소창에서 지운다.
        const url = new URL(window.location.href);
        if (url.searchParams.has('auth')) {
          url.searchParams.delete('auth');
          window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
        }
      } else {
        Cookies.set('ADSSO_RETURN_URL', window.location.href);
        window.location.href = `${import.meta.env.MOBILAVE}/Account/ADFSLogin?client=${window.location.origin}`;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setUserSystemInfo = async (userInfo: ADSSOResponse) => {
    const user: User = new User();
    user.setUserInfoFromADSSOResponse(userInfo);
    // SIREN api는 X-Knox-Id 헤더로만 호출자를 식별한다.
    setApiKnoxId(user.KnoxID);

    try {
      const url = `${import.meta.env.USER_GROUP_API}/user/Information/${userInfo.loginid}`;
      const response = await axios.get<Record<string, unknown>>(url);
      user.Group = response.data.Group as string;
      // api의 Admin 판정 근거 (Hub 설계서 §13.3) — SIREN이 별도 admin 목록을 두지 않는다.
      setApiUserGroup(user.Group ?? null);
      user.Authority = response.data.Authority as Record<string, number>;
      user.Language = response.data.Language as Language;
      user.Theme = response.data.Theme as Theme;
      i18n.changeLanguage(user.Language);

      const latestLoginTime = Cookies.get('loginSIREN');
      if (user.Group !== "Admin" && (!latestLoginTime ||
        Date.now() - new Date(latestLoginTime).getTime() > 60 * 60 * 1000
      )) {
        addEventLog({
          userId: user.KnoxID,
          project: '',
          event: `Login SIREN`,
          action: 'LOGIN',
        });
        Cookies.set('loginSIREN', new Date().toISOString());
      }
    } catch {
      // 플랫폼에 등록 안 된 계정 — 예전엔 여기서 자동으로 플랫폼 사용자를 만들어 기본값
      // (Developer/en/light)으로 들여보냈지만, 그런 사람은 권한이 아예 없어야 한다는
      // 요청으로 대신 통째로 막는다. Language/Theme은 User 클래스 기본값을 쓴다 —
      // AccessDeniedPage 자체는 그 값을 안 쓰지만, realUser는 항상 뭔가 채워져 있어야
      // 하는 다른 코드(useAuth 소비처)가 있으니 빈 객체 대신 정상적인 User를 둔다.
      setRealAccountDenied(true);
    } finally {
      setRealUser(user);
      openGate(true);
    }
  }

  /** 지금 화면에 보이는 신원(시뮬레이션 중이면 대상, 아니면 실제 사용자)의 prefs만 바꾼다. */
  const updateUserPrefs = <K extends keyof User>(field: K, value: User[K]) => {
    const apply = (prev: User) => ({ ...prev, [field]: value } as User);
    if (simulatedUser) {
      setSimulatedUser((prev) => (prev ? apply(prev) : prev));
    } else {
      setRealUser((prev) => (prev ? apply(prev) : prev));
    }
  };

  /**
   * 특정 사용자 화면 재현(§13). Admin 전용 — FE도 자기 몫을 하지만(§13.3 규칙 6) 최종
   * 방어선은 항상 api의 isAdmin 재검증이다(X-Acting-As는 그쪽에서도 다시 본다).
   * 이름/부서는 SDP_COMMON_API 직원 조회로, Group/Authority/Language/Theme는 로그인 때와
   * 같은 USER_GROUP_API로 채운다 — 후자가 실패해도(플랫폼에 등록 안 된 사용자) 시뮬레이션
   * 자체는 거부하지 않는다(사용자 요청: 나중에 만들 접근 신청 페이지 등을 확인하려면
   * Admin이 "등록 안 된 사람" 신원으로 들어가 볼 수 있어야 한다) — 대신
   * simulatedAccountDenied를 세워서, 이 신원으로 있는 동안은 실제 로그인 실패와 똑같이
   * AccessDeniedPage로 막힌다(Home으로 리다이렉트됐다가 다시 거기로 리다이렉트되는 것도
   * 정상 — 그게 검증하려는 동작이다).
   */
  const startSimulation = async (knoxId: string) => {
    // 판정은 항상 realUser 기준 — 이미 다른 사람을 시뮬레이션 중이어도(지금 isAdmin은
    // 그 대상 기준이라 틀릴 수 있다) Admin 본인의 권한으로 켤 수 있어야 한다.
    if (!isRealAdmin) throw new Error('Only Admin can simulate another user.');
    const empRes = await getEmployeesByIDs(knoxId);
    const emp = empRes.employees?.[0];
    if (!emp) throw new Error(`No such user: ${knoxId}`);

    const target = new User();
    target.KnoxID = knoxId;
    target.Name = emp.fullName ?? '';
    target.EnName = emp.enFullName ?? '';
    target.Department = emp.departmentName ?? '';
    target.EnDepartment = emp.enDepartmentName ?? '';

    let denied = false;
    try {
      const url = `${import.meta.env.USER_GROUP_API}/user/Information/${knoxId}`;
      const response = await axios.get<Record<string, unknown>>(url);
      target.Group = (response.data.Group as string) ?? target.Group;
      target.Authority = (response.data.Authority as Record<string, number>) ?? target.Authority;
      target.Language = (response.data.Language as Language) ?? target.Language;
      target.Theme = (response.data.Theme as Theme) ?? target.Theme;
    } catch {
      denied = true;
    }

    setApiActingAs(knoxId);
    // Calypso의 admin bypass는 그 사람 자신의 Group으로 판정해야 한다(사용자 요청: 시뮬레이션
    // 중엔 Admin의 super 권한이 아니라 그 사람 실제 권한으로 보여야 함) — X-User-Group은
    // 실제 호출자(Admin) 것으로 그대로 두고(시뮬레이션 자체를 켤 수 있는 자격 검증용),
    // 대상의 Group은 별도 헤더(X-Acting-As-Group)로 전달한다.
    setCalypsoActingAsGroup(target.Group);
    setSimulatedAccountDenied(denied);
    setSimulatedUser(target);
    i18n.changeLanguage(target.Language);
    setThemeMode(target.Theme);
  };

  const stopSimulation = () => {
    setApiActingAs(null);
    setCalypsoActingAsGroup(null);
    setSimulatedUser(null);
    setSimulatedAccountDenied(false);
    i18n.changeLanguage(realUser.Language);
    setThemeMode(realUser.Theme);
  };

  return (
    <AuthContext.Provider
      value={{
        user, realUser, updateUserPrefs, loginSuccess, accountDenied, isAdmin, isRealAdmin,
        isSimulating: simulatedUser !== null, startSimulation, stopSimulation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
