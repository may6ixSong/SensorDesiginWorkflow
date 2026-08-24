import React, { createContext, useContext, useEffect, useState } from 'react';
import { isOnLine } from '../../utils/helper';
import Cookies from 'js-cookie';
import axios from 'axios';
import { addEventLog } from '../../service/event-log-service';
import { useTranslation } from 'react-i18next';

// Ported verbatim from SSM_WEB's AuthProvider.tsx (service name swapped to SIREN
// only where it names the service itself — cookie name, event name, storage
// key). TODO: SSO 연동 지점 - 실제 IdP 연동 시 이 파일만 교체하면 된다.

let isAdminUser: boolean = false;
export const isAdmin = () => isAdminUser;

export type Language = 'ko' | 'en';
export type Theme = 'dark' | 'light';

/**
 * localStorage key for the language the user explicitly picked while offline.
 * Kept separate from i18next's auto-cached "i18nextLng" (which may hold the
 * browser's navigator language), so offline defaults to 'en' unless the user
 * has actively toggled the language themselves.
 */
export const OFFLINE_LANG_KEY = 'siren_offline_lang';

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
};

const DEV_USER: ADSSOResponse = {
  loginid: 'sdp.op',
  deptname: 'Sensor 설계팀(S.LSI)',
  username: 'SDP 시스템 운영',
  username_en: "SDP System Operator",
  deptname_en: 'Sensor Development Team(S.LSI)'
};
const isDev = import.meta.env.ENVIRONMENT === 'dev';
const Guest_USER: ADSSOResponse = {
  loginid: 'Guest',
  deptname: 'guest user',
  deptname_en: 'guest user',
  username: 'Guest',
  username_en: 'Guest'
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  updateUserPrefs: (_field, _value) => {},
  loginSuccess: false
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { i18n } = useTranslation();
  const [user, setUser] = useState<User>({} as User);
  const [loginSuccess, openGate] = useState<boolean>(false);

  useEffect(() => {
    isAdminUser = user.Group === "Admin";
  }, [user]);

  useEffect(() => {
    // Read isOnLine() here (not at module load): resolveOnlineStatus() has
    // settled by first render, including the direct-IP backend probe.
    if (!isOnLine()) {
      const guestUser = new User();
      guestUser.setUserInfoFromADSSOResponse(Guest_USER);

      // Offline has no backend to supply the user's language, and the i18n
      // LanguageDetector otherwise falls back to the browser's navigator
      // language (often 'ko'). Force the Guest default ('en') unless the user
      // has explicitly chosen a language via the offline toggle (stored under
      // OFFLINE_LANG_KEY — distinct from i18next's auto-cached navigator value).
      const savedLang = localStorage.getItem(OFFLINE_LANG_KEY);
      const offlineLang: Language = savedLang === "ko" || savedLang === "en" ? savedLang : guestUser.Language;
      guestUser.Language = offlineLang;
      i18n.changeLanguage(offlineLang);

      setUser(guestUser);
      openGate(true);
    }
    else if (isDev) {
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
    <AuthContext.Provider value={{ user, updateUserPrefs, loginSuccess }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
