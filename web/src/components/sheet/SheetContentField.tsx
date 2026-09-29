import { Box } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { listSheetTemplates } from '@/api/calypsoClient';
import { queryKeys } from '@/api/queryKeys';
import { SelectInput } from '@/components/common/Panel';
import { CURSOR_POINTER, T } from '@/theme/tokens';

export interface SheetContentChoice {
  contentKind: 'file' | 'sheet';
  /** '' = 빈 시트에서 시작. */
  templateKey: string;
}

export const defaultSheetContentChoice = (): SheetContentChoice => ({ contentKind: 'file', templateKey: '' });

/** createCalypsoArtifact에 그대로 펼쳐 넣을 값. */
export function sheetContentInput(c: SheetContentChoice): { contentKind?: 'file' | 'sheet'; templateKey?: string } {
  if (c.contentKind !== 'sheet') return {};
  return c.templateKey ? { contentKind: 'sheet', templateKey: c.templateKey } : { contentKind: 'sheet' };
}

const KINDS: { value: 'file' | 'sheet'; label: string }[] = [
  { value: 'file', label: 'Files / links' },
  { value: 'sheet', label: 'Sheet' },
];

/**
 * 새 artifact의 콘텐츠 종류(설계서 11장 §2) — 보통 파일형이냐, 엑셀처럼 편집하는 sheet냐.
 * sheet면 시작 시트로 쓸 template을 고른다. template은 시작점일 뿐이다 — 만든 뒤로는 사용자가
 * 자유롭게 고친다. 콘텐츠 종류는 만든 뒤에 바꿀 수 없다.
 */
export function SheetContentField({ value, onChange }: { value: SheetContentChoice; onChange: (v: SheetContentChoice) => void }) {
  const { data: templates = [], isLoading } = useQuery({
    queryKey: queryKeys.sheetTemplates,
    queryFn: listSheetTemplates,
    enabled: value.contentKind === 'sheet',
    staleTime: 60_000,
  });

  return (
    <Box>
      <Box sx={{ fontSize: 10.5, color: T.dm2, mb: '5px' }}>Content — cannot be changed later</Box>
      <Box sx={{ display: 'flex', gap: '4px' }}>
        {KINDS.map((k) => (
          <Box
            key={k.value}
            component="button"
            type="button"
            onClick={() => onChange({ contentKind: k.value, templateKey: k.value === 'sheet' ? value.templateKey : '' })}
            sx={{
              fontSize: 11.5, fontWeight: 600, padding: '4px 9px', borderRadius: '999px', cursor: CURSOR_POINTER,
              background: k.value === value.contentKind ? T.pr : T.sf,
              color: k.value === value.contentKind ? '#fff' : T.dm,
              border: `1px solid ${k.value === value.contentKind ? T.pr : T.ln2}`,
            }}
          >
            {k.label}
          </Box>
        ))}
      </Box>
      {value.contentKind === 'sheet' && (
        <Box sx={{ mt: '8px' }}>
          <SelectInput
            value={value.templateKey}
            onChange={(templateKey) => onChange({ ...value, templateKey })}
            options={[
              { value: '', label: isLoading ? 'Loading templates…' : 'Blank sheet' },
              ...templates.map((t) => ({ value: t.key, label: t.name })),
            ]}
          />
          <Box sx={{ fontSize: 10.5, color: T.dm2, mt: '5px', lineHeight: 1.6 }}>
            The template only fills the first sheet. After that, edit it freely like Excel — SIREN saves it exactly as you do.
          </Box>
        </Box>
      )}
    </Box>
  );
}
