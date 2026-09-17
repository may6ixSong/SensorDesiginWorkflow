import { Badge } from '@/components/common/SirenButton';
import { T } from '@/theme/tokens';

/**
 * Artifact 출처/권한 칩 3종 — "새 Artifact 추가"/"소스 변경" 피커(ArtifactSourcePicker)와
 * 캔버스의 artifact 상세 슬라이드(ArtifactSlide)가 공유한다(사용자 요청 — 두 화면에서 같은
 * 뜻은 같은 배지·같은 색으로 보여야 한다). 셋 다 독립적으로 뜨거나 안 뜬다:
 *   - Edit: 그 artifact에 edit 권한이 있을 때만.
 *   - OA/HPC: network가 정해진 것에 대해서만 — Tier B(File Artifacts)가 아직 File/OA-link/
 *     HPC-path 중 하나를 고르기 전(network===null)이면 안 뜬다.
 *   - OA Service/HPC Service: admin이 등록한 실제 Hub Service(Tier A/C)에서 온 것에만 —
 *     Calypso(File Artifacts, Tier B)는 network가 OA/HPC로 잠겨도 "Service"는 아니다.
 */

/**
 * T.select(캔버스 select/flow 전용 청록)는 soft/line 짝이 없어 color-mix로 그 자리에서
 * 만든다 — HPC Service 칩 하나에만 쓰는 색이라 tokens.ts에 전용 짝을 새로 추가할 만큼은
 * 아니다(Edit/OA/HPC/OA Service/HPC Service 5개 칩이 전부 다른 색이어야 한다).
 */
const HPC_SERVICE_SOFT_BG = 'color-mix(in srgb, var(--s-select) 16%, transparent)';
const HPC_SERVICE_SOFT_LINE = 'color-mix(in srgb, var(--s-select) 45%, transparent)';

/** Edit 권한이 있을 때만 — view는 캡션("view only — …")이나 그 화면의 다른 요소가 따로 설명한다. */
export function EditChip({ level }: { level: 'edit' | 'view' | null }) {
  if (level !== 'edit') return null;
  return <Badge color={T.pr} bg={T.prSoft} borderColor={T.prLine}>EDIT</Badge>;
}

/** network가 정해진 것에 대해서만(File인 Tier B는 아직 null이라 안 뜬다). */
export function NetworkChip({ network }: { network: 'OA' | 'HPC' | null | undefined }) {
  if (!network) return null;
  return network === 'HPC'
    ? <Badge color={T.warn} bg={T.warnSoft} borderColor={T.warnLine}>HPC</Badge>
    : <Badge color={T.ok} bg={T.okSoft} borderColor={T.okLine}>OA</Badge>;
}

/** admin이 등록한 실제 OA/HPC Service(Tier A/C)에서 온 것에만 — Calypso(File Artifacts)는 해당 없다. */
export function ServiceChip({ source }: { source: 'live' | 'hpc' }) {
  return source === 'hpc'
    ? <Badge color={T.select} bg={HPC_SERVICE_SOFT_BG} borderColor={HPC_SERVICE_SOFT_LINE}>HPC SERVICE</Badge>
    : <Badge color={T.info} bg={T.infoSoft} borderColor={T.infoLine}>OA SERVICE</Badge>;
}
