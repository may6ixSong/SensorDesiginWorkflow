import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserDto } from '@/types/domain';

/**
 * 사내 SSO 연동 전제 (설계서 1.3) - 목업 단계는 사용자 스위처로 대체.
 * TODO: SSO 연동 지점 - 실제 연동 시 이 store의 login()을 IdP 리다이렉트/콜백 처리로 교체.
 */
interface AuthState {
  token: string | null;
  user: UserDto | null;
  setSession: (token: string, user: UserDto) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'siren-auth' },
  ),
);
