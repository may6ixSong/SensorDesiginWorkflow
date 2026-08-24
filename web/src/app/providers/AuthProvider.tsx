import React, { createContext, useContext, useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { useTranslation } from 'react-i18next';
import { getEmployeeByKnoxId, getPlatformUserInfo } from '@/service/user-service';

/**
 * Platform-level identity — the corporate ADSSO session (KnoxID/Name/Dept) and
 * the cross-app preferences (Group/Language/Theme) served by the common
 * platform APIs (MOBILAVE/USER_GROUP_API/SDP_COMMON_API). This is deliberately
 * separate from SIREN's own business user model (`UserDto` / `useAuthStore`),
 * which drives IP ownership and dept-based edit permissions and keeps working
 * against SIREN's own mock backend regardless of whether the platform is
 * reachable (see the try/catch resilience below).
 *
 * TODO: SSO 연동 지점 - once real ADSSO is wired for this app, this file (and
 * only this file) needs to change; nothing downstream (AppShell, business
 * auth) depends on how the identity was obtained.
 */

export type PlatformLanguage = 'ko' | 'en';
export type PlatformTheme = 'light' | 'dark';

export class PlatformUser {
  KnoxID = '';
  Name = '';
  Department = '';
  EnName = '';
  EnDepartment = '';
  Email = '';
  Group = 'User';
  Language: PlatformLanguage = 'en';
  Theme: PlatformTheme = 'light';

  setFromADSSOResponse(res: ADSSOResponse) {
    this.KnoxID = res.loginid;
    this.Name = res.username ?? '';
    this.Department = res.deptname ?? '';
    this.EnName = res.username_en ?? '';
    this.EnDepartment = res.deptname_en ?? '';
  }
}

export type ADSSOResponse = {
  loginid: string;
  deptname?: string;
  username?: string;
  username_en?: string;
  deptname_en?: string;
};

/** Fixed dev-environment identity — no manual switcher, per current product decision. */
const DEV_USER: ADSSOResponse = {
  loginid: 'siren.admin',
  username: 'SIREN 관리자',
  username_en: 'SIREN Administrator',
  deptname: 'Sensor 설계팀(S.LSI)',
  deptname_en: 'Sensor Development Team (S.LSI)',
};

const isDev = import.meta.env.ENVIRONMENT === 'dev';

type AuthContextType = {
  platformUser: PlatformUser | null;
  /** True once the initial identity resolution (dev fixed user / ADSSO) has settled. */
  ready: boolean;
  updatePlatformPrefs: <K extends keyof PlatformUser>(field: K, value: PlatformUser[K]) => void;
};

const AuthContext = createContext<AuthContextType>({
  platformUser: null,
  ready: false,
  updatePlatformPrefs: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const [platformUser, setPlatformUser] = useState<PlatformUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isDev) {
      void hydrate(DEV_USER);
      return;
    }

    const cookieData = Cookies.get('ADSSO_USER');
    if (cookieData) {
      try {
        const decoded = decodeURIComponent(cookieData);
        const parsed = JSON.parse(decoded.replace(/\\n/g, '').replace(/\\r/g, '').replace(/\\t/g, '')) as ADSSOResponse;
        void hydrate(parsed);
      } catch {
        redirectToLogin();
      }
    } else {
      redirectToLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function redirectToLogin() {
    Cookies.set('ADSSO_RETURN_URL', window.location.href);
    window.location.href = `${import.meta.env.MOBILAVE}/Account/ADFSLogin?client=${window.location.origin}`;
  }

  async function hydrate(res: ADSSOResponse) {
    const user = new PlatformUser();
    user.setFromADSSOResponse(res);

    // Both calls hit real corporate services that are blank/unreachable in
    // dev (and possibly early production rollout) — they resolve to
    // `undefined` rather than throwing, so identity always settles and the
    // rest of the app (SIREN's own mock project/IP data) is never blocked.
    const [groupInfo, employee] = await Promise.all([
      getPlatformUserInfo(user.KnoxID),
      getEmployeeByKnoxId(user.KnoxID),
    ]);

    if (groupInfo) {
      user.Group = groupInfo.Group ?? user.Group;
      user.Language = groupInfo.Language ?? user.Language;
      user.Theme = groupInfo.Theme ?? user.Theme;
      i18n.changeLanguage(user.Language);
    }
    if (employee) {
      user.Email = employee.emailAddress ?? '';
    }

    setPlatformUser(user);
    setReady(true);
  }

  const updatePlatformPrefs = <K extends keyof PlatformUser>(field: K, value: PlatformUser[K]) => {
    setPlatformUser((prev) => {
      if (!prev) return prev;
      const next = Object.assign(new PlatformUser(), prev);
      next[field] = value;
      return next;
    });
  };

  return (
    <AuthContext.Provider value={{ platformUser, ready, updatePlatformPrefs }}>
      {children}
    </AuthContext.Provider>
  );
}

export const usePlatformAuth = () => useContext(AuthContext);
