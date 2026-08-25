import { useState } from 'react';
import { Box } from '@mui/material';
import { IpDto } from '@/types/domain';
import { Card, Ey, Field, Row, SelectInput, TextInput } from '@/components/common/Panel';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { toast } from '@/store/toastStore';
import { useUpdateIpDomain, useUpdateIpDomains } from '@/api/hooks/useProjects';
import { T } from '@/theme/tokens';

/** 도메인 비교는 항상 이 기준으로 — FE의 domainOf()/BE의 updateIpDomains와 같은 규칙. */
const norm = (v: string | null | undefined) => (v ?? '').trim().toUpperCase();

const errText = (e: any, fallback: string) => e?.response?.data?.message ?? fallback;

/**
 * 목록에 없는 도메인을 이미 가진 IP도 있을 수 있다 — 목록을 도입하기 전에 저장된 값이나
 * DB를 직접 고친 경우다. 그걸 ''로 눌러 버리면 셀렉트가 "Unassigned"라고 거짓말을 하므로
 * 현재 값을 후보에 끼워 넣어 그대로 보여 준다(다른 값을 고르면 자연히 정리된다).
 */
function optionsFor(ip: IpDto, ipDomains: string[]) {
  const cur = (ip.domain ?? '').trim();
  const orphan = cur && !ipDomains.some((d) => norm(d) === norm(cur));
  return [
    { value: '', label: 'Unassigned' },
    ...(orphan ? [{ value: cur, label: `${cur} (not in list)` }] : []),
    ...ipDomains.map((d) => ({ value: d, label: d })),
  ];
}

function selectedFor(ip: IpDto, ipDomains: string[]) {
  const cur = (ip.domain ?? '').trim();
  if (!cur) return '';
  return ipDomains.find((d) => norm(d) === norm(cur)) ?? cur;
}

/**
 * 과제의 설계 도메인 목록을 관리하고, IP를 그 도메인에 배정하는 섹션.
 *
 * 두 블록을 한 화면에 같이 두는 이유: 목록만 고칠 수 있으면 Total workflow view의
 * 항성계가 안 바뀌어 편집한 효과가 전혀 안 보인다. 배정까지 여기서 끝내야 한다.
 *
 * IP 편집 진입점을 IpPermissionDialog(권한 전용)에 얹지 않은 것은 의도적이다 —
 * 도메인은 권한이 아니고, 후보 목록이 과제에 있어서 과제 화면이 제자리다.
 */
export function DesignDomainsSection({
  projectId, ipDomains, ips, own,
}: {
  projectId: string; ipDomains: string[]; ips: IpDto[]; own: boolean;
}) {
  const updateDomains = useUpdateIpDomains(projectId);
  const updateIpDomain = useUpdateIpDomain(projectId);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const countFor = (domain: string) => ips.filter((ip) => norm(ip.domain) === norm(domain)).length;
  const unassigned = ips.filter((ip) => !norm(ip.domain)).length;

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    if (ipDomains.some((d) => norm(d) === norm(name))) {
      setErr(`'${name}' is already in the list.`);
      return;
    }
    setErr(null);
    updateDomains.mutate([...ipDomains, name], {
      onSuccess: () => { setDraft(''); toast('Design domain added'); },
      onError: (e) => setErr(errText(e, 'Failed to add domain')),
    });
  };

  const remove = (domain: string) => {
    setErr(null);
    updateDomains.mutate(ipDomains.filter((d) => norm(d) !== norm(domain)), {
      onSuccess: () => toast('Design domain removed'),
      // 아직 IP가 붙어 있으면 BE가 그 IP 이름을 담아 400을 준다.
      onError: (e) => setErr(errText(e, 'Failed to remove domain')),
    });
  };

  const assign = (ipId: string, domain: string) => {
    setErr(null);
    updateIpDomain.mutate({ ipId, domain }, {
      onSuccess: () => toast(domain ? `Assigned to ${domain}` : 'Domain cleared'),
      onError: (e) => setErr(errText(e, 'Failed to assign domain')),
    });
  };

  const busy = updateDomains.isPending || updateIpDomain.isPending;

  return (
    <Box sx={{ mt: '26px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '12px' }}>
        <Box sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em' }}>
          Design domains
          <Box component="span" sx={{ fontWeight: 400, color: T.dm2, ml: '7px', fontSize: 13 }}>
            Total workflow view splits the map by these
          </Box>
        </Box>
      </Box>

      {err && (
        <Box sx={{ fontSize: 12, color: T.rd, mb: '10px' }}>{err}</Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '13px' }}>
        <Card>
          <Ey sx={{ mb: '9px' }}>Domains · {ipDomains.length}</Ey>

          {ipDomains.map((d) => (
            <Box
              key={d}
              sx={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '7px 0', borderBottom: `1px solid ${T.ln}`,
              }}
            >
              <Box sx={{ flex: 1, fontSize: 13 }}>{d}</Box>
              <Box sx={{ fontSize: 11, color: T.dm2 }}>{countFor(d)} IP</Box>
              {own && (
                <SirenButton
                  variant="ghost"
                  disabled={busy}
                  onClick={() => remove(d)}
                  title={countFor(d) > 0 ? 'Reassign its IPs first' : 'Remove domain'}
                >
                  <Icon name="trash" />
                </SirenButton>
              )}
            </Box>
          ))}

          {ipDomains.length === 0 && (
            <Box sx={{ fontSize: 12, color: T.dm2, padding: '7px 0' }}>
              No domains yet — every IP shows up as Unassigned.
            </Box>
          )}

          {own && (
            <Row sx={{ mt: '11px', alignItems: 'flex-end' }}>
              <Field label="Add domain" sx={{ mb: 0, flex: 1 }}>
                <TextInput value={draft} onChange={setDraft} placeholder="e.g. Analog" />
              </Field>
              <SirenButton disabled={busy || !draft.trim()} onClick={add}>
                <Icon name="plus" /> Add
              </SirenButton>
            </Row>
          )}
        </Card>

        <Card>
          <Ey sx={{ mb: '9px' }}>
            IP assignment{unassigned > 0 ? ` · ${unassigned} unassigned` : ''}
          </Ey>

          {ips.map((ip) => (
            <Box
              key={ip.id}
              sx={{
                display: 'flex', alignItems: 'center', gap: '9px',
                padding: '7px 0', borderBottom: `1px solid ${T.ln}`,
              }}
            >
              <Box sx={{ width: '3px', alignSelf: 'stretch', background: ip.color, borderRadius: '2px' }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ fontSize: 13, fontWeight: 600 }}>{ip.name}</Box>
                <Box sx={{ fontSize: 11, color: T.dm2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ip.description}
                </Box>
              </Box>
              <Box sx={{ width: 148, flex: '0 0 auto' }}>
                <SelectInput
                  value={selectedFor(ip, ipDomains)}
                  disabled={!own || busy}
                  onChange={(v) => assign(ip.id, v)}
                  options={optionsFor(ip, ipDomains)}
                />
              </Box>
            </Box>
          ))}

          {ips.length === 0 && (
            <Box sx={{ fontSize: 12, color: T.dm2, padding: '7px 0' }}>No IPs in this project.</Box>
          )}
        </Card>
      </Box>
    </Box>
  );
}
