import { useState } from 'react';
import { Box } from '@mui/material';
import { WorkflowPhase } from '@/types/domain';
import { shortDate } from '@/lib/schedule';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton } from '@/components/common/SirenButton';
import { Ey, Field, TextInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, FONT_MONO, R, T } from '@/theme/tokens';

interface Props {
  workflowName: string;
  phases: WorkflowPhase[];
  onClose: () => void;
  onCreate: (p: { name: string; phaseId: string }) => void;
}

/**
 * 캔버스에 **자리(block)** 를 하나 놓는다.
 *
 * ★ 여기서 출처(artifact)를 고르지 않는다. 블록은 "이 phase에 이런 산출물이 나온다"는
 *   자리 표시일 뿐이고, 실제 산출물을 매핑하는 것은 그 블록의 상세 slide에서 한다
 *   (설계서 04장 §1 — 자리와 실체의 분리). 예전 다이얼로그는 연동 서비스·Calypso
 *   피커까지 여기서 다 물어봤는데, 정작 그 값들은 생성 API로 넘어가지도 않는
 *   죽은 입력이었다. 물어보지 않는 편이 정직하다.
 *
 * ★ 버튼도 하나뿐이다 — "주는 산출물 / 받는 산출물"을 나눠 만들던 진입점은 하나로
 *   합쳐졌다(설계서 03장 §5.2). 받는 산출물 UX는 TODO T2에서 되살린다.
 *
 * 여기 뜨는 phase는 전부 "이 workflow가 정한 자기 일정"이다 — 과제 마일스톤이 아니다.
 */
export function AddBlockDialog({ workflowName, phases, onClose, onCreate }: Props) {
  const [name, setName] = useState('');
  const [phaseId, setPhaseId] = useState<string>(phases[0]?.id ?? '');
  const [err, setErr] = useState(false);

  const submit = () => {
    if (!name.trim() || !phaseId) { setErr(true); return; }
    onCreate({ name: name.trim(), phaseId });
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      width={460}
      header={
        <>
          <Ey>{workflowName}</Ey>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>Add block</Box>
        </>
      }
    >
      <Field label="Name">
        <TextInput
          value={name}
          onChange={(v) => { setName(v); setErr(false); }}
          error={err}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="e.g. Startup Sequence Verification Results"
        />
      </Field>

      <Field label="Phase — a block sits in exactly one phase">
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {phases.map((p) => (
            <Box
              key={p.id}
              component="button"
              type="button"
              title={`${shortDate(p.start)} → ${shortDate(p.end)}`}
              onClick={() => { setPhaseId(p.id); setErr(false); }}
              sx={{
                fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, padding: '5px 10px',
                borderRadius: `${R.sm}px`, transition: '.14s', cursor: CURSOR_POINTER,
                background: phaseId === p.id ? T.prSoft : T.sf,
                border: `1px solid ${phaseId === p.id ? T.pr : T.ln2}`,
                color: phaseId === p.id ? T.pr : T.dm,
                '&:hover': { background: phaseId === p.id ? T.prSoft : T.sf3 },
              }}
            >
              {p.name}
            </Box>
          ))}
          {!phases.length && (
            <Box sx={{ fontSize: 12, color: T.danger }}>
              This workflow has no phases yet — set a schedule before adding blocks.
            </Box>
          )}
        </Box>
      </Field>

      {/* 다음 단계를 미리 알려 준다 — 만들자마자 "그래서 실제 산출물은 어디서 거나"가
          바로 나오는 질문이라, 답을 화면에 붙여 두는 편이 낫다. */}
      <Box
        sx={{
          display: 'flex', alignItems: 'flex-start', gap: '8px',
          background: T.infoSoft, border: `1px solid ${T.infoLine}`, color: T.info,
          borderRadius: `${R.sm}px`, padding: '9px 12px',
          fontSize: 12, lineHeight: 1.55, mb: '14px',
        }}
      >
        <Box sx={{ mt: '1px', flexShrink: 0 }}><Icon name="info" /></Box>
        <Box>Map it to a real artifact from the block's details panel once it exists.</Box>
      </Box>

      <SirenButton variant="primary" onClick={submit} disabled={!phases.length}>
        <Icon name="plus" /> Add block
      </SirenButton>
    </ModalShell>
  );
}
