import { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { ScheduleSpan } from '@/types/domain';
import { SirenButton } from '@/components/common/SirenButton';
import { DateInput, Ey, TextInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { dayMs, newSpanId, sortSchedule, spanDays } from '@/lib/schedule';
import { FONT_MONO, T } from '@/theme/tokens';

/** 서버로 보낼 한 줄. id가 없으면 새 항목이다(서버가 발급한다). */
export interface ScheduleDraft {
  id?: string;
  name: string;
  start: string;
  end: string;
}

interface Row extends ScheduleDraft {
  /** React key 전용 — 서버로는 안 나간다(새 행은 id가 없어야 새로 발급된다). */
  rowKey: string;
}

export interface ScheduleEditorProps {
  /** 편집 대상 — 과제 마일스톤이든 workflow phase든 모양이 같다. */
  spans: ScheduleSpan[];
  /** 화면에 쓸 단수 명칭. 'milestone' / 'phase'. */
  noun: string;
  onSubmit: (rows: ScheduleDraft[]) => void;
  saving?: boolean;
  error?: string | null;
  /** "과제 일정으로 되돌리기" 같은 부가 액션을 헤더 옆에 얹는다. */
  extraAction?: React.ReactNode;
}

/**
 * 일정 목록 편집기 — 과제 마일스톤과 workflow phase가 같은 모양(ScheduleSpan)이라
 * 한 컴포넌트를 공유한다.
 *
 * 규칙:
 *  - 추가/삭제/개명/재일정이 전부 자유롭다.
 *  - **일정끼리 겹쳐도 된다.** 겹침은 오류가 아니라 정상이고, 겹치는 줄에는 안내 배지만
 *    붙여 사용자가 의도한 것인지 알아볼 수 있게 한다.
 *  - 순서는 저장하지 않는다 — 아래 미리보기가 보여 주듯 시작일 오름차순이 곧 캔버스의
 *    좌 → 우 순서다. 그래서 행을 위아래로 옮기는 조작 자체를 두지 않는다.
 */
export function ScheduleEditor({ spans, noun, onSubmit, saving, error, extraAction }: ScheduleEditorProps) {
  const [rows, setRows] = useState<Row[]>(() =>
    sortSchedule(spans).map((s) => ({ rowKey: s.id, id: s.id, name: s.name, start: s.start, end: s.end })),
  );
  const [rowErr, setRowErr] = useState<Record<string, string>>({});

  const setField = (rowKey: string, field: 'name' | 'start' | 'end', value: string) => {
    setRows((prev) => prev.map((r) => (r.rowKey === rowKey ? { ...r, [field]: value } : r)));
    setRowErr((prev) => ({ ...prev, [rowKey]: '' }));
  };

  const addRow = () => {
    // 새 줄은 마지막 일정 다음 날부터 2주짜리로 — 빈 날짜 칸부터 채우게 하지 않는다.
    const last = sortSchedule(rows.filter((r) => r.start && r.end) as ScheduleSpan[]).slice(-1)[0];
    const base = last ? dayMs(last.end) : Date.now();
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    setRows((prev) => [
      ...prev,
      { rowKey: newSpanId('draft'), name: '', start: iso(base), end: iso(base + 14 * 864e5) },
    ]);
  };

  const removeRow = (rowKey: string) => {
    setRows((prev) => prev.filter((r) => r.rowKey !== rowKey));
    setRowErr((prev) => ({ ...prev, [rowKey]: '' }));
  };

  /** 미리보기 = 저장 후 실제 좌→우 순서. 겹치는 줄도 여기서 바로 드러난다. */
  const preview = useMemo(
    () => sortSchedule(rows.filter((r) => r.name.trim() && r.start && r.end) as unknown as ScheduleSpan[]),
    [rows],
  );
  /**
   * 실제로 기간이 겹치는 줄만 표시한다. 경계가 맞닿는 것(앞 칸의 종료일 == 뒤 칸의
   * 시작일)은 겹침이 아니다 — 그렇게 세면 연속된 일정이 전부 OVERLAP으로 뜬다
   * (실측 확인). 그래서 양쪽 다 강한 부등호를 쓴다.
   */
  const overlapping = useMemo(() => {
    const set = new Set<string>();
    preview.forEach((a, i) => {
      preview.slice(i + 1).forEach((b) => {
        if (dayMs(b.start) < dayMs(a.end) && dayMs(a.start) < dayMs(b.end)) {
          set.add(a.id);
          set.add(b.id);
        }
      });
    });
    return set;
  }, [preview]);

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!rows.length) errs.__all = `At least one ${noun} is required.`;
    rows.forEach((r) => {
      if (!r.name.trim()) errs[r.rowKey] = 'Name is required.';
      else if (!r.start || !r.end) errs[r.rowKey] = 'Start and end dates are required.';
      else if (dayMs(r.start) > dayMs(r.end)) errs[r.rowKey] = 'Start must not be after end.';
    });
    setRowErr(errs);
    if (Object.keys(errs).length) return;
    onSubmit(rows.map((r) => ({ id: r.id, name: r.name.trim(), start: r.start, end: r.end })));
  };

  const firstErr = Object.values(rowErr).find(Boolean);

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '12px' }}>
        <Box sx={{ fontSize: 11.5, color: T.dm2, flex: 1 }}>
          Add, remove, rename and re-date freely. Overlapping {noun}s are fine — the canvas keeps them
          ordered left → right by start date.
        </Box>
        {extraAction}
      </Box>

      {rows.map((r) => (
        <Box
          key={r.rowKey}
          sx={{
            display: 'flex', alignItems: 'flex-start', gap: '9px', padding: '9px 0',
            borderBottom: `1px solid ${T.ln}`,
          }}
        >
          <Box sx={{ flex: '1 1 150px', minWidth: 110 }}>
            <TextInput
              value={r.name}
              onChange={(v) => setField(r.rowKey, 'name', v)}
              error={!!rowErr[r.rowKey]}
              placeholder="e.g. KO"
            />
          </Box>
          <Box sx={{ flex: '0 0 146px' }}>
            <DateInput value={r.start} onChange={(v) => setField(r.rowKey, 'start', v)} error={!!rowErr[r.rowKey]} />
          </Box>
          <Box component="span" sx={{ padding: '9px 0', color: T.dm2 }}>→</Box>
          <Box sx={{ flex: '0 0 146px' }}>
            <DateInput value={r.end} onChange={(v) => setField(r.rowKey, 'end', v)} error={!!rowErr[r.rowKey]} />
          </Box>
          <SirenButton
            variant="ghost"
            title={`Remove this ${noun}`}
            disabled={rows.length <= 1}
            onClick={() => removeRow(r.rowKey)}
            sx={{ mt: '2px' }}
          >
            <Icon name="trash" />
          </SirenButton>
        </Box>
      ))}

      <SirenButton onClick={addRow} sx={{ mt: '12px' }}>
        <Icon name="plus" /> Add {noun}
      </SirenButton>

      {preview.length > 0 && (
        <Box sx={{ mt: '18px' }}>
          <Ey sx={{ mb: '8px' }}>Order on the canvas · left → right</Ey>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {preview.map((s) => (
              <Box
                key={s.id}
                title={`${s.start} → ${s.end} · ${spanDays(s)}d`}
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  fontFamily: FONT_MONO, fontSize: 11, padding: '4px 9px', borderRadius: '7px',
                  border: `1px solid ${overlapping.has(s.id) ? T.vi3 : T.ln2}`,
                  background: overlapping.has(s.id) ? T.vi2 : T.sf2,
                  color: overlapping.has(s.id) ? T.vi : T.dm,
                }}
              >
                {s.name}
                {overlapping.has(s.id) && <Box component="span" sx={{ fontSize: 8, fontWeight: 700 }}>OVERLAP</Box>}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {firstErr && <Box sx={{ fontSize: 11.5, color: T.rd, mt: '10px' }}>{firstErr}</Box>}
      {error && <Box sx={{ fontSize: 11.5, color: T.rd, mt: '10px' }}>{error}</Box>}

      <SirenButton variant="primary" onClick={submit} disabled={saving} sx={{ mt: '16px' }}>
        <Icon name="check" /> {saving ? 'Saving…' : 'Save'}
      </SirenButton>
    </>
  );
}
