import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, CircularProgress, Stack } from '@mui/material';
import { AppShell } from '@/components/layout/AppShell';
import { IpHeader } from '@/components/ip/IpHeader';
import { IpPermissionDialog } from '@/components/ip/IpPermissionDialog';
import { PhaseStepper } from '@/components/phase/PhaseStepper';
import { PhaseInfoDialog } from '@/components/phase/PhaseInfoDialog';
import { Canvas } from '@/components/canvas/Canvas';
import { DeliverableDialog } from '@/components/deliverable/DeliverableDialog';
import { CreateDeliverableDialog } from '@/components/deliverable/CreateDeliverableDialog';
import { HldReleaseDialog } from '@/components/hld/HldReleaseDialog';
import { useProjectIps, useProjectPhases, useProjects } from '@/api/hooks/useProjects';
import { useIp } from '@/api/hooks/useIp';
import { useDeliverables } from '@/api/hooks/useDeliverables';
import { useMemos } from '@/api/hooks/useMemos';
import { useEdges } from '@/api/hooks/useEdges';
import { PhaseRef } from '@/types/domain';

export function BoardPage() {
  const { projectId, ipId } = useParams<{ projectId: string; ipId: string }>();
  const navigate = useNavigate();

  const { data: projects } = useProjects();
  const { data: phases } = useProjectPhases(projectId);
  const { data: ips } = useProjectIps(projectId);
  const { data: ip, isLoading: ipLoading, isError: ipError } = useIp(ipId);
  const { data: deliverables } = useDeliverables(ipId);
  const { data: memos } = useMemos(ipId);
  const { data: edges } = useEdges(ipId);

  const [permissionOpen, setPermissionOpen] = useState(false);
  const [hldOpen, setHldOpen] = useState(false);
  const [phaseInfo, setPhaseInfo] = useState<PhaseRef | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createPhaseKey, setCreatePhaseKey] = useState<string | null>(null);

  const detailDeliverable = useMemo(
    () => (deliverables ?? []).find((d) => d.id === detailId) ?? null,
    [deliverables, detailId],
  );

  if (ipError) {
    navigate('/no-access', { replace: true });
    return null;
  }

  return (
    <AppShell
      projects={projects ?? []}
      projectId={projectId}
      onChangeProject={(id) => navigate(`/projects/${id}`)}
      ips={ips ?? []}
      ipId={ipId}
      onChangeIp={(id) => navigate(`/projects/${projectId}/ips/${id}`)}
    >
      {ipLoading ? (
        <Stack alignItems="center" justifyContent="center" flex={1}>
          <CircularProgress />
        </Stack>
      ) : !ip ? (
        <Alert severity="warning" sx={{ m: 2 }}>
          IP를 찾을 수 없습니다.
        </Alert>
      ) : (
        <>
          <IpHeader ip={ip} onOpenPermissions={() => setPermissionOpen(true)} onOpenHld={() => setHldOpen(true)} />
          <PhaseStepper phases={phases ?? []} onSelectPhase={setPhaseInfo} />
          <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <Canvas
              ip={ip}
              phases={phases ?? []}
              deliverables={deliverables ?? []}
              memos={memos ?? []}
              edges={edges ?? []}
              onOpenDetail={setDetailId}
              onRequestAddDeliverable={setCreatePhaseKey}
            />
          </Box>

          <IpPermissionDialog ip={ip} open={permissionOpen} onClose={() => setPermissionOpen(false)} />
          <PhaseInfoDialog phase={phaseInfo} onClose={() => setPhaseInfo(null)} />
          <DeliverableDialog
            ipId={ip.id}
            phases={phases ?? []}
            deliverable={detailDeliverable}
            onClose={() => setDetailId(null)}
          />
          <CreateDeliverableDialog ipId={ip.id} phaseKey={createPhaseKey} onClose={() => setCreatePhaseKey(null)} />
          <HldReleaseDialog
            ipId={ip.id}
            open={hldOpen}
            onClose={() => setHldOpen(false)}
            deliverables={deliverables ?? []}
            canEdit={ip.myAccess === 'edit'}
            onOpenDeliverable={(id) => {
              setHldOpen(false);
              setDetailId(id);
            }}
          />
        </>
      )}
    </AppShell>
  );
}
