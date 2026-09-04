import { create } from 'zustand';
import { getApiActingAs, setApiActingAs } from '@/api/client';

/**
 * 사용자 시뮬레이터(§13) 상태를 헤더 메뉴(AdminMenuButton)와 Service Manage 라우트
 * 가드가 함께 구독할 수 있도록 zustand로 감싼다. 실제 헤더 값(api/client.ts)이
 * 정본이고, 이 store는 그 값의 리액티브한 거울일 뿐이다.
 */
interface ActingAsState {
  actingAs: string | null;
  apply: (knoxId: string | null) => void;
}

export const useActingAsStore = create<ActingAsState>((set) => ({
  actingAs: getApiActingAs(),
  apply: (knoxId) => {
    setApiActingAs(knoxId);
    set({ actingAs: knoxId });
  },
}));
