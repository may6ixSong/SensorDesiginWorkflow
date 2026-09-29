import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box } from '@mui/material';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/app/providers/AuthProvider';
import {
  SheetTemplate, addSheetTemplateRevision, createSheetTemplate, deleteSheetTemplate, getSheetTemplateStart,
  listSheetTemplates, updateSheetTemplate,
} from '@/api/calypsoClient';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { queryKeys } from '@/api/queryKeys';
import { ModalShell } from '@/components/common/ModalShell';
import { Field, SelectInput, TextArea, TextInput } from '@/components/common/Panel';
import { Badge, SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { SheetEditorDialog } from '@/components/sheet/SheetEditorDialog';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { toast } from '@/store/toastStore';
import { FONT_MONO, T } from '@/theme/tokens';

function fmtAt(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
}

type Editing = { kind: 'edit'; t: SheetTemplate } | { kind: 'view'; t: SheetTemplate; revision: number } | null;

/**
 * Sheet Templates — Admin 전용(설계서 11장 §3). template은 새 sheet artifact를 만들 때 불러오는
 * "기본으로 채워진 엑셀 시트"다. Admin이 여기서 sheet 편집기로 고치고 저장하면 새 개정본이
 * 쌓인다 — 이미 만든 artifact는 만들 때의 개정본을 그대로 쓴다.
 *
 * 진입 판정은 Service Manage와 같다 — 실제 호출자가 Admin이고 시뮬레이션 중이 아닐 때만.
 * BE(SIREN·Calypso)가 쓰기를 한 번 더 막는다.
 */
export function SheetTemplatesPage() {
  const { isRealAdmin, isSimulating } = useAuth();
  if (!isRealAdmin) return <Navigate to="/no-access" replace />;
  if (isSimulating) return <Navigate to="/" replace />;
  return <SheetTemplatesContent />;
}

function SheetTemplatesContent() {
  const qc = useQueryClient();
  const { resolveUser } = useDirectory();
  const [editing, setEditing] = useState<Editing>(null);
  const [creating, setCreating] = useState(false);
  const [meta, setMeta] = useState<SheetTemplate | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SheetTemplate | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: queryKeys.sheetTemplates,
    queryFn: listSheetTemplates,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.sheetTemplates });

  const remove = useMutation({
    mutationFn: (t: SheetTemplate) => deleteSheetTemplate(t.key),
    onSuccess: () => { invalidate(); toast('Template deleted'); setDeleting(null); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not delete the template'),
  });

  return (
    <AppShell>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: '28px 32px' }}>
        <Box sx={{ maxWidth: 1080, mx: 'auto' }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '10px', mb: '22px' }}>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em', mb: '4px' }}>Sheet Templates</Box>
              <Box sx={{ fontSize: 12, color: T.dm2, lineHeight: 1.6 }}>
                The starting sheet loaded when someone creates a Sheet artifact. Users edit their sheet freely
                afterwards — editing or deleting a template only affects artifacts created after the change.
              </Box>
            </Box>
            <SirenButton variant="primary" onClick={() => setCreating(true)}>
              <Icon name="plus" /> New template
            </SirenButton>
          </Box>

          {isLoading && <Box sx={{ fontSize: 12.5, color: T.dm2 }}>Loading…</Box>}
          {!isLoading && templates.length === 0 && (
            <Box sx={{ fontSize: 12.5, color: T.dm2 }}>No templates yet.</Box>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {templates.map((t) => (
              <Box
                key={t.key}
                sx={{ background: T.sf, border: `1px solid ${T.ln}`, borderRadius: '10px', padding: '14px 16px' }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <Icon name="excel" size={18} />
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Box sx={{ fontSize: 14, fontWeight: 700 }}>{t.name}</Box>
                      <Box sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm2 }}>{t.key}</Box>
                      <Badge color={T.pr} bg={T.prSoft} borderColor={T.prLine}>rev {t.currentRevision}</Badge>
                    </Box>
                    {t.description && <Box sx={{ fontSize: 12, color: T.dm, mt: '3px' }}>{t.description}</Box>}
                    <Box sx={{ fontSize: 11, color: T.dm2, mt: '3px' }}>
                      Updated by {resolveUser(t.updatedBy).name} · {fmtAt(t.updatedAt)}
                    </Box>
                  </Box>
                  <SirenButton variant="primary" onClick={() => setEditing({ kind: 'edit', t })}>
                    <Icon name="edit" /> Edit sheet
                  </SirenButton>
                  <SirenButton onClick={() => setMeta(t)}>Details</SirenButton>
                  <SirenButton onClick={() => setDeleting(t)}>
                    <Icon name="trash" /> Delete
                  </SirenButton>
                  <SirenButton variant="ghost" onClick={() => setExpanded(expanded === t.key ? null : t.key)}>
                    {expanded === t.key ? 'Hide revisions' : `Revisions (${t.revisions.length})`}
                  </SirenButton>
                </Box>
                {expanded === t.key && (
                  <Box sx={{ mt: '12px', borderTop: `1px solid ${T.ln}`, paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {t.revisions.map((r) => (
                      <Box key={r.revision} sx={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: 12 }}>
                        <Box sx={{ fontFamily: FONT_MONO, width: 56 }}>rev {r.revision}</Box>
                        <Box sx={{ flex: 1, color: T.dm }}>{r.note || '—'}</Box>
                        <Box sx={{ color: T.dm2 }}>{resolveUser(r.createdBy).name} · {fmtAt(r.createdAt)}</Box>
                        <SirenButton variant="ghost" onClick={() => setEditing({ kind: 'view', t, revision: r.revision })}>
                          <Icon name="eye" /> View
                        </SirenButton>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {editing?.kind === 'edit' && (
        <SheetEditorDialog
          title={`Template · ${editing.t.name}`}
          subtitle={`Editing revision ${editing.t.currentRevision} — saving adds revision ${editing.t.currentRevision + 1}. Existing artifacts are not affected.`}
          mode="edit"
          queryKey={['calypso', 'sheet-template-start', editing.t.key, editing.t.currentRevision]}
          load={() => getSheetTemplateStart(editing.t.key)}
          exportName={editing.t.key}
          save={{
            label: 'Save as new revision',
            notePlaceholder: 'What changed (optional)',
            noteRequired: false,
            includeXlsx: false,
            submit: async (result, note) => {
              await addSheetTemplateRevision(editing.t.key, result.document, note);
              invalidate();
              toast('Template saved');
            },
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === 'view' && (
        <SheetEditorDialog
          title={`Template · ${editing.t.name} · rev ${editing.revision}`}
          subtitle="Read only."
          mode="view"
          queryKey={['calypso', 'sheet-template-start', editing.t.key, editing.revision]}
          load={() => getSheetTemplateStart(editing.t.key, editing.revision)}
          exportName={`${editing.t.key}-rev${editing.revision}`}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this template?"
          message={`"${deleting.name}" will no longer be offered when creating Sheet artifacts.`}
          warning="This cannot be undone. Artifacts already created from it are not affected."
          confirmLabel="Delete"
          busy={remove.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting)}
        />
      )}
      {creating && <NewTemplateDialog templates={templates} onClose={() => setCreating(false)} onCreated={invalidate} />}
      {meta && <TemplateMetaDialog t={meta} onClose={() => setMeta(null)} onSaved={invalidate} />}
    </AppShell>
  );
}

function NewTemplateDialog({ templates, onClose, onCreated }: {
  templates: SheetTemplate[]; onClose: () => void; onCreated: () => void;
}) {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fromKey, setFromKey] = useState('');
  const keyOk = /^[a-z0-9][a-z0-9-]{1,62}$/.test(key);

  const create = useMutation({
    mutationFn: () => createSheetTemplate({ key, name: name.trim(), description: description.trim(), fromKey: fromKey || undefined }),
    onSuccess: () => { onCreated(); toast('Template created — open "Edit sheet" to shape it.'); onClose(); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not create the template'),
  });

  return (
    <ModalShell open onClose={onClose} width={460} header={<Box sx={{ fontSize: 16, fontWeight: 700 }}>New sheet template</Box>}>
      <Field label="Key — lowercase letters, digits and dashes; cannot be changed">
        <TextInput value={key} onChange={(v) => setKey(v.toLowerCase())} placeholder="e.g. ip-register-map" error={!!key && !keyOk} />
      </Field>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="e.g. Register Map" />
      </Field>
      <Field label="Description">
        <TextArea value={description} onChange={setDescription} rows={2} />
      </Field>
      <Field label="Start from">
        <SelectInput
          value={fromKey}
          onChange={setFromKey}
          options={[{ value: '', label: 'Blank sheet' }, ...templates.map((t) => ({ value: t.key, label: `Copy of ${t.name}` }))]}
        />
      </Field>
      <SirenButton variant="primary" disabled={!keyOk || !name.trim() || create.isPending} onClick={() => create.mutate()}>
        <Icon name="check" /> Create
      </SirenButton>
    </ModalShell>
  );
}

function TemplateMetaDialog({ t, onClose, onSaved }: { t: SheetTemplate; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(t.name);
  const [description, setDescription] = useState(t.description);
  const save = useMutation({
    mutationFn: () => updateSheetTemplate(t.key, { name: name.trim(), description: description.trim() }),
    onSuccess: () => { onSaved(); toast('Saved'); onClose(); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not save'),
  });
  return (
    <ModalShell open onClose={onClose} width={460} header={<Box sx={{ fontSize: 16, fontWeight: 700 }}>Template details</Box>}>
      <Field label="Key">
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 12 }}>{t.key}</Box>
      </Field>
      <Field label="Name">
        <TextInput value={name} onChange={setName} />
      </Field>
      <Field label="Description">
        <TextArea value={description} onChange={setDescription} rows={3} />
      </Field>
      <SirenButton variant="primary" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
        <Icon name="check" /> Save
      </SirenButton>
    </ModalShell>
  );
}
