import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { AutoRunRunDto, AutoRunStateDto } from '@/types/domain';
import { AUTO_RUN_POLL_MS } from './useNodes';

/**
 * node 하나의 Auto Run 설정·등록 가능 여부·실행 이력(설계서 10장 §8.2). Auto Run 탭이
 * 열려 있을 때만 켠다 — 탭 자체가 workflow Edit Access에게만 있다.
 */
export function useAutoRun(workflowId: string | undefined, nodeId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.autoRun(workflowId ?? '', nodeId ?? ''),
    enabled: Boolean(workflowId) && Boolean(nodeId) && enabled,
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<AutoRunStateDto>>(`/workflows/${workflowId}/nodes/${nodeId}/auto-run`);
      return res.data.data;
    },
    // 진행 중인 run이 있으면 끝날 때까지 따라간다.
    refetchInterval: (query) =>
      (query.state.data?.runs ?? []).some((r) => r.status === 'queued' || r.status === 'dispatched' || r.status === 'running')
        ? AUTO_RUN_POLL_MS
        : false,
  });
}

/** 켜기/끄기 — 켤 때 등록 조건이 안 맞으면 서버가 이유와 함께 400을 준다. */
export function useSetAutoRun(workflowId: string, nodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiClient.put<ApiEnvelope<AutoRunStateDto>>(
        `/workflows/${workflowId}/nodes/${nodeId}/auto-run`,
        { enabled },
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.autoRun(workflowId, nodeId), data);
      qc.invalidateQueries({ queryKey: queryKeys.nodes(workflowId) });
    },
  });
}

/** 지금 실행 — 자동 조건(날짜 비교)을 보지 않고 지금 source의 최신 published 버전으로 보낸다. */
export function useRunAutoRunNow(workflowId: string, nodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<ApiEnvelope<AutoRunRunDto>>(`/workflows/${workflowId}/nodes/${nodeId}/auto-run/runs`);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.autoRun(workflowId, nodeId) });
      qc.invalidateQueries({ queryKey: queryKeys.nodes(workflowId) });
    },
  });
}
