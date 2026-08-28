import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import Cookies from 'js-cookie';
import axios from 'axios';
import { addEventLog } from '../../service/event-log-service';
import { useTranslation } from 'react-i18next';
import { setApiKnoxId } from '../../api/client';

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
  user: User | null;
  updateUserPrefs: <K extends keyof User>(field: K, value: User[K]) => void,
  loginSuccess: boolean;
  /** user.Group === 'Admin' — user가 바뀔 때마다 리렌더에 반영되는 파생 값. */
  isAdmin: boolean;
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
  updateUserPrefs: (_field, _value) => {},
  loginSuccess: false,
  isAdmin: false,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { i18n } = useTranslation();
  const [user, setUser] = useState<User>({} as User);
  const [loginSuccess, openGate] = useState<boolean>(false);
  const isAdmin = useMemo(() => user.Group === "Admin", [user]);

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
      await createPlatformUser(user);
    } finally {
      setUser(user);
      openGate(true);
    }
  }

  const createPlatformUser = async (user: User) => {
    const platformRegister = {
      Name: user.Name,
      KnoxID: user.KnoxID,
      Department: user.Department,
      Group: user.Group,
      Authority: user.Authority,
      EnName: user.EnName,
      EnDepartment: user.EnDepartment,
      Language: user.Language,
			Theme: user.Theme
    }
    const options = {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'client-id': 'sdp.op',
      }
    }

    return await axios.post(`${import.meta.env.USER_GROUP_API}/user`, platformRegister, options);
  }

  const updateUserPrefs = <K extends keyof User>(field: K, value: User[K]) => {
    setUser((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        [field]: value,
      } as User;
    });
  };

  return (
    <AuthContext.Provider value={{ user, updateUserPrefs, loginSuccess, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
