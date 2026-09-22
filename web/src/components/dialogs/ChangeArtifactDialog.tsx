import { useState } from 'react';
import { Box } from '@mui/material';
import { DepartmentDto, NodeDto } from '@/types/domain';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton } from '@/components/common/SirenButton';
import { Ey, Field, TextInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { ArtifactSourcePicker, ArtifactSourceState, emptySourceState, resolveNewArtifact } from '@/components/artifact/ArtifactSourcePicker';
import { NewArtifactSourceInput } from '@/api/hooks/useNodes';
import { R, T } from '@/theme/tokens';

interface Props {
  node: NodeDto;
  projectId: string | undefined;
  projectCode: string | undefined;
  projectRevision: string | undefined;
  myDepartments: string[];
  departmentOptions: DepartmentDto[];
  onClose: () => void;
  onSave: (newArtifact: NewArtifactSourceInput) => void;
  submitting?: boolean;
}

/**
 * 이미 만들어진 node의 artifact를 바꾼다(설계서 04장 §6 재매핑) — WorkflowNode(자리)와
 * Artifact(실체)가 분리돼 있으므로 자리는 그대로 두고 무엇을 가리키는지만 바꾼다.
 *
 * ★ intent(주는/받는)는 node 생성 시 확정되어 여기서 바꾸지 않는다 — 후보 목록의
 *   pickable 판정도 그대로 그 intent를 따른다.
 * ★ 저장하면 서버가 이전 recipient를 초기화한다(사용자 결정) — 새 산출물에 이전 구성이
 *   그대로 유효하다는 보장이 없기 때문이다. 그 사실을 여기서 미리 알려 준다.
 */
export function ChangeArtifactDialog({
  node, projectId, myDepartments, departmentOptions, onClose, onSave, submitting,
}: Props) {
  const [name, setName] = useState(node.name);
  const [src, setSrc] = useState<ArtifactSourceState>(emptySourceState());
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) { setErr('Name is required.'); return; }
    const newArtifact = resolveNewArtifact(src, name.trim());
    if (!newArtifact) { setErr('Finish picking the new artifact.'); return; }
    setErr(null);
    onSave(newArtifact);
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      width={520}
      header={
        <>
          <Ey>Change artifact</Ey>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>{node.name}</Box>
        </>
      }
    >
      <Box
        sx={{
          display: 'flex', alignItems: 'flex-start', gap: '8px',
          background: T.infoSoft, border: `1px solid ${T.infoLine}`, color: T.info,
          borderRadius: `${R.sm}px`, padding: '9px 12px', fontSize: 12, lineHeight: 1.55, mb: '14px',
        }}
      >
        <Box sx={{ mt: '1px', flexShrink: 0 }}><Icon name="info" /></Box>
        <Box>
          This node still {node.intent === 'own' ? 'gives' : 'receives'} an artifact — you&apos;re only changing
          which one. Recipients will be reset once you save.
        </Box>
      </Box>

      <Field label="Name">
        <TextInput value={name} onChange={(v) => { setName(v); setErr(null); }} autoFocus />
      </Field>

      <ArtifactSourcePicker
        workflowId={node.workflowId}
        projectId={projectId}
        intent={node.intent}
        myDepartments={myDepartments}
        departmentOptions={departmentOptions}
        state={src}
        onChange={setSrc}
        onSelectName={(n) => setName(n)}
      />

      {err && <Box sx={{ fontSize: 12, color: T.danger, mb: '10px' }}>{err}</Box>}

      <SirenButton variant="primary" onClick={submit} disabled={submitting}>
        <Icon name="check" /> {submitting ? 'Saving…' : 'Save'}
      </SirenButton>
    </ModalShell>
  );
}
