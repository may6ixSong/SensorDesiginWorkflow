/**
 * SIREN 목업 데이터 시드. 이미 resolve된 Model 묶음을 받아 채워 넣기만 한다 —
 * 연결(실제 DB든 인메모리든)은 전적으로 호출자 책임이다.
 *
 * ★ v3 구조를 그대로 반영한다:
 *   - 산출물의 **실체(Artifact)**와 캔버스 위의 **자리(Block)**가 분리되어 있다.
 *   - Artifact는 과제 단위로 스코프되고, 같은 artifact가 여러 workflow에 놓일 수 있다.
 *   - B/C/D는 SIREN이 권한을 들고 있고 **viewAccess가 곧 recipient**다.
 *     A는 그 서비스가 권한을 판정하고, recipient는 **block마다** 따로 붙는다.
 *   - Release는 부서별 배송 기록이며 캔버스 스냅샷을 담지 않는다.
 *
 * 이 시드는 아래 상황을 일부러 만들어 둔다 — 화면에서 바로 확인할 수 있게:
 *   · 일정을 잃은 블록(그 phase가 지워진 상태)
 *   · publish된 적 없는 산출물 / 마지막 release 이후 major가 올라간 산출물
 *   · A Tier인데 recipient가 비어 있어 아무도 slide를 못 여는 산출물
 *   · source가 미발행이라 release 표에 `없음(None)`으로 남는 항목
 */
import { Model, Types } from 'mongoose';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { ArtifactDocument } from '../artifacts/schemas/artifact.schema';
import { BlockDocument } from '../blocks/schemas/block.schema';
import { MemoDocument } from '../memos/schemas/memo.schema';
import { EdgeDocument } from '../edges/schemas/edge.schema';
import { ReleaseDocument } from '../releases/schemas/release.schema';
import { ArtifactServiceDocument } from '../hub/schemas/artifact-service.schema';

export interface SeedModels {
  ArtifactService: Model<ArtifactServiceDocument>;
  Project: Model<ProjectDocument>;
  Workflow: Model<WorkflowDocument>;
  Artifact: Model<ArtifactDocument>;
  Block: Model<BlockDocument>;
  Memo: Model<MemoDocument>;
  Edge: Model<EdgeDocument>;
  Release: Model<ReleaseDocument>;
}

/* ── 캔버스 좌표 상수 ──
 * FE의 web/src/lib/constants.ts 값과 반드시 일치해야 한다. 어긋나면 seedXY()가 계산하는
 * 절대 x좌표와 FE가 그리는 레인 폭이 달라져 블록이 옆 레인과 겹쳐 보인다. */
const GRID = 10;
const ROW_H = 220;
const TOP_PAD = 60;
const NW = 295;
const NH = 160;
const MW = 295;
const MH = 120;
const LANE_PAD = 68;
const DEFAULT_PW = Math.round((NW + LANE_PAD * 2) * 2 * 0.72);
const snp = (v: number) => Math.round(v / GRID) * GRID;

/** laneIndex번째 phase 레인 안쪽 가운데, row번째 줄. */
function seedXY(laneIndex: number, row: number, w: number, h: number) {
  const laneX = laneIndex * DEFAULT_PW;
  return {
    x: snp(laneX + Math.max(6, (DEFAULT_PW - w) / 2)),
    y: TOP_PAD + row * ROW_H,
    w,
    h,
  };
}

const at = (s: string) => new Date(s.replace(' ', 'T') + ':00');

/* ── 목업 사용자 ──
 * api는 users 컬렉션을 갖지 않으므로 사용자는 KnoxID 문자열로만 참조된다. 이름은 web이
 * SDPCommonAPI로 조회한다(설계서 01장 §6).
 * u1 = 'sdp.op' — web AuthProvider의 개발용 기본 사용자와 같은 KnoxID여야 한다. */
type UserKey = 'u1' | 'u2' | 'u3' | 'u4' | 'u5' | 'u6' | 'u7' | 'u8';
const KNOX: Record<UserKey, string> = {
  u1: 'sdp.op',
  u2: 'jihoon.park',
  u3: 'sumin.lee',
  u4: 'hayoon.jung',
  u5: 'dain.choi',
  u6: 'sehun.oh',
  u7: 'jiyeon.han',
  u8: 'dahyun.ryu',
};

const DEPTS = ['Analog', 'Digital', 'APS', 'PI/PD', 'Solution', 'PTE'];

/* ── 과제 공통 일정(마일스톤) ──
 * 이름은 사내에서 쓰는 짧은 표기 그대로다. 약어의 full name은 저장하지 않는다. */
const MILESTONES = [
  { id: 'ms_ko', name: 'KO', start: '2026-01-05', end: '2026-02-16' },
  { id: 'ms_ml1', name: 'ML1', start: '2026-02-16', end: '2026-03-16' },
  { id: 'ms_ar', name: 'AR', start: '2026-03-16', end: '2026-04-13' },
  { id: 'ms_ml2', name: 'ML2', start: '2026-04-13', end: '2026-05-25' },
  { id: 'ms_ml3', name: 'ML3', start: '2026-05-25', end: '2026-06-22' },
  { id: 'ms_mdr', name: 'MDR', start: '2026-06-22', end: '2026-07-20' },
  { id: 'ms_ml4', name: 'ML4', start: '2026-07-20', end: '2026-08-31' },
  { id: 'ms_fdr', name: 'FDR', start: '2026-08-31', end: '2026-09-21' },
  { id: 'ms_mto', name: 'MTO', start: '2026-09-21', end: '2026-10-12' },
  { id: 'ms_fab', name: 'Fab out', start: '2026-10-12', end: '2026-12-21' },
];

/** 어떤 workflow의 phase 목록에도 없는 id — 이걸 가리키는 블록이 "일정 유실" 상태로 남는다. */
const ORPHAN_PHASE_ID = 'ph_cmp_layout_removed';

interface MockWorkflow {
  key: string;
  name: string;
  department: string;
  description: string;
  color: string;
  owner: UserKey;
  /** 소속 부서는 서버가 자동으로 editAccess에 넣으므로 여기엔 **추가** 부서/사용자만 적는다. */
  editExtra?: { departments?: string[]; users?: UserKey[] };
  viewAccess?: { departments?: string[]; users?: UserKey[] };
  phases: { id: string; name: string; start: string; end: string }[];
}

const MOCK_WORKFLOWS: MockWorkflow[] = [
  {
    key: 'wf1', name: 'PLL_MAIN', department: 'Analog',
    description: 'Main clock generation PLL', color: '#0c9a83', owner: 'u1',
    viewAccess: { departments: ['Digital', 'PTE'], users: ['u5'] },
    phases: MILESTONES.map((m) => ({ ...m, id: `ph_pll_${m.id.slice(3)}` })),
  },
  {
    key: 'wf2', name: 'LDO_CORE', department: 'Analog',
    description: 'Core LDO regulator', color: '#5849cf', owner: 'u2',
    editExtra: { users: ['u1'] },
    viewAccess: { departments: ['PI/PD'] },
    phases: [
      { id: 'ph_ldo_a', name: 'KO', start: '2026-01-05', end: '2026-03-16' },
      { id: 'ph_ldo_b', name: 'Design', start: '2026-03-02', end: '2026-06-22' },
      { id: 'ph_ldo_c', name: 'Verify', start: '2026-06-01', end: '2026-09-21' },
      { id: 'ph_ldo_d', name: 'MTO', start: '2026-09-21', end: '2026-12-21' },
    ],
  },
  {
    key: 'wf3', name: 'ADC_RAMP', department: 'APS',
    description: 'Ramp generator for column ADC', color: '#2563c9', owner: 'u4',
    viewAccess: { departments: ['Analog'] },
    phases: [
      { id: 'ph_adc_ko', name: 'KO', start: '2026-01-05', end: '2026-02-16' },
      { id: 'ph_adc_ml1', name: 'ML1', start: '2026-02-16', end: '2026-04-06' },
      { id: 'ph_adc_ar', name: 'AR', start: '2026-03-16', end: '2026-05-04' },
      { id: 'ph_adc_ml3', name: 'ML3', start: '2026-05-04', end: '2026-07-20' },
      { id: 'ph_adc_fdr', name: 'FDR', start: '2026-07-20', end: '2026-10-12' },
    ],
  },
  {
    key: 'wf4', name: 'BGR_REF', department: 'Analog',
    description: 'Bandgap voltage reference', color: '#ac6f08', owner: 'u2',
    phases: [
      { id: 'ph_bgr_ko', name: 'KO', start: '2026-01-05', end: '2026-02-16' },
      { id: 'ph_bgr_ml1', name: 'ML1', start: '2026-02-16', end: '2026-04-13' },
      { id: 'ph_bgr_ml2', name: 'ML2', start: '2026-04-13', end: '2026-06-22' },
    ],
  },
  {
    key: 'wf5', name: 'TG_DRIVER', department: 'Digital',
    description: 'Transfer gate driver', color: '#c8352c', owner: 'u3',
    editExtra: { departments: ['Analog'] },
    viewAccess: { departments: ['APS'] },
    phases: [
      { id: 'ph_tg_ko', name: 'KO', start: '2026-01-05', end: '2026-03-16' },
      { id: 'ph_tg_mid', name: 'Design', start: '2026-02-16', end: '2026-08-31' },
      { id: 'ph_tg_fdr', name: 'FDR', start: '2026-08-31', end: '2026-12-21' },
    ],
  },
  {
    key: 'wf6', name: 'COMP_BLOCK', department: 'PI/PD',
    description: 'Comparator block — phase 하나를 지운 상태(유실 표시 확인용)', color: '#0891b2',
    owner: 'u6',
    viewAccess: { users: ['u1'] },
    phases: [
      { id: 'ph_cmp_ko', name: 'KO', start: '2026-01-05', end: '2026-03-16' },
      { id: 'ph_cmp_design', name: 'Design', start: '2026-03-16', end: '2026-07-20' },
      // 'ph_cmp_layout_removed' 는 여기 없다 — 아래 블록 두 개가 그걸 가리켜 유실 상태가 된다.
      { id: 'ph_cmp_fdr', name: 'FDR', start: '2026-09-21', end: '2026-12-21' },
    ],
  },
];

/** phase id → 그 workflow 안에서 start 오름차순 순번(캔버스 레인 번호). */
const LANE_INDEX: Record<string, number> = {};
for (const wf of MOCK_WORKFLOWS) {
  [...wf.phases]
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
    .forEach((p, i) => {
      LANE_INDEX[p.id] = i;
    });
}
LANE_INDEX[ORPHAN_PHASE_ID] = 2; // 유실된 블록이 놓여 있던 원래 자리

/* ── Artifact 정의 ──
 * versions는 [label, isPublished, when, note] 형태로 짧게 적고 아래에서 펼친다.
 * 최신이 배열 앞(index 0)이라는 불변식을 여기서도 지킨다. */
type VerTuple = [string, boolean, string, string];

interface MockArtifact {
  key: string;
  project: 'p1' | 'p2';
  name: string;
  tier: 'A' | 'B' | 'C' | 'D';
  network: 'OA' | 'HPC';
  serviceKey?: string | null;
  externalArtifactId?: string | null;
  externalUrl?: string | null;
  /** B/C/D 전용. viewAccess가 곧 recipient다. A는 비워 둔다. */
  editAccess?: { departments?: string[]; users?: UserKey[] };
  viewAccess?: { departments?: string[]; users?: UserKey[] };
  versions: VerTuple[];
  giver: UserKey;
  hpcPath?: string;
}

const MOCK_ARTIFACTS: MockArtifact[] = [
  /* ── A Tier — 서비스가 권한을 판정한다. recipient는 block마다 따로 붙는다 ── */
  { key: 'a_pll_sim', project: 'p1', name: 'PLL Pre-layout Simulation', tier: 'A', network: 'OA',
    serviceKey: 'simhub', externalArtifactId: 'SIM-PLL-0421', giver: 'u1',
    versions: [['v2.0', true, '2026-06-03 10:40', '2nd release'], ['v1.0', true, '2026-04-21 13:10', '1st release']] },
  { key: 'a_pll_post', project: 'p1', name: 'PLL Post-layout Simulation', tier: 'A', network: 'OA',
    serviceKey: 'simhub', externalArtifactId: 'SIM-PLL-0812', giver: 'u1',
    // latest+ = RPM류 서비스가 보내는 "아직 official 버전이 아닌 snapshot" 자리표시자.
    versions: [['latest+', false, '2026-08-12 09:00', 'in progress'], ['v1.0', true, '2026-07-28 18:22', '1st release']] },
  { key: 'a_rpm_spec', project: 'p1', name: 'ADC Ramp Spec (RPM)', tier: 'A', network: 'OA',
    serviceKey: 'rpm', externalArtifactId: 'RPM-ADC-771', giver: 'u4',
    versions: [['v3', true, '2026-05-11 11:00', 'ML3 release'], ['v2', true, '2026-03-20 15:30', 'AR release']] },

  /* ── B Tier — HPC 공용 DB 경유. SIREN이 권한을 들고 있고 viewAccess가 곧 recipient ── */
  { key: 'b_pll_pex', project: 'p1', name: 'PLL Netlist / PEX', tier: 'B', network: 'HPC',
    serviceKey: 'ssm', externalArtifactId: 'SSM-PEX-PLL', giver: 'u1',
    hpcPath: '/vwp/cis_a7/pll_main/pex/r1',
    editAccess: { departments: ['Analog'] },
    viewAccess: { departments: ['Digital', 'PTE'] },
    versions: [['r1', true, '2026-06-04 19:55', 'RC extraction']] },
  { key: 'b_ldo_spec', project: 'p1', name: 'LDO Spec Data', tier: 'B', network: 'OA',
    serviceKey: 'ssm', externalArtifactId: 'SSM-LDO-SPEC', giver: 'u2',
    editAccess: { departments: ['Analog'], users: ['u2'] },
    viewAccess: { departments: ['PI/PD', 'Solution'] },
    versions: [['v2.1', true, '2026-05-18 14:20', 'Updated dropout'], ['v1.0', true, '2026-03-02 09:15', 'Initial']] },
  { key: 'b_tg_timing', project: 'p1', name: 'TG Timing Table', tier: 'B', network: 'OA',
    serviceKey: 'ssm', externalArtifactId: 'SSM-TG-TIM', giver: 'u3',
    editAccess: { departments: ['Digital'] },
    viewAccess: { departments: ['Analog', 'APS'] },
    versions: [['v1.0', true, '2026-04-10 10:00', 'Initial']] },

  /* ── C Tier — 링크만 있고 버전은 사람이 입력 ── */
  { key: 'c_pll_req', project: 'p1', name: 'PLL Requirements Intake', tier: 'C', network: 'OA',
    externalUrl: 'https://docs.local/cis-a7/pll-req', giver: 'u1',
    editAccess: { departments: ['Analog'] },
    viewAccess: { departments: ['Digital'] },
    versions: [['v1.0', true, '2026-01-09 10:20', 'Initial draft']] },
  { key: 'c_adc_ar', project: 'p1', name: 'ADC AR Review Package', tier: 'C', network: 'OA',
    externalUrl: 'https://docs.local/cis-a7/adc-ar', giver: 'u4',
    editAccess: { departments: ['APS'] },
    viewAccess: { departments: ['Analog', 'PTE'] },
    versions: [['v2.1', false, '2026-04-02 09:30', 'Added action items'], ['v2.0', true, '2026-03-18 14:00', '2nd release']] },

  /* ── D Tier — 시스템 자체가 없다. 출처를 자유 텍스트로 기록 ── */
  { key: 'd_bgr_meas', project: 'p1', name: 'BGR Measurement Report (vendor)', tier: 'D', network: 'OA',
    giver: 'u2',
    editAccess: { departments: ['Analog'] },
    viewAccess: { departments: ['PTE'] },
    versions: [['rev.B', true, '2026-05-02 16:40', 'From vendor']] },
  { key: 'd_cmp_note', project: 'p1', name: 'Comparator Hand Calc', tier: 'D', network: 'OA',
    giver: 'u6',
    editAccess: { departments: ['PI/PD'] },
    viewAccess: { departments: ['Analog'] },
    versions: [] }, // publish된 적 없음 — 캔버스에서 "미발행" 배지로 보인다

  /* ── 두 번째 과제 ── */
  { key: 'p2_iso', project: 'p2', name: 'Isolation Spec', tier: 'C', network: 'OA',
    externalUrl: 'https://docs.local/cis-b3/iso', giver: 'u7',
    editAccess: { departments: ['Analog'] },
    viewAccess: { departments: ['Digital'] },
    versions: [['v1.0', true, '2026-02-11 11:00', 'Initial']] },
];

/* ── Block 정의 (캔버스 위의 자리) ── */
interface MockBlock {
  key: string;
  workflow: string;
  phase: string;
  row: number;
  /** artifact를 가리키지 않는 "정상 빈 상태"면 생략. 그 경우 name이 표시된다. */
  artifact?: string;
  name: string;
  /** A Tier에서만 의미가 있다 — workflow마다 독립인 recipient. */
  recipients?: {
    editAccess?: { departments?: string[]; users?: UserKey[] };
    viewAccess?: { departments?: string[]; users?: UserKey[] };
  };
  series?: string;
  seriesIdx?: number;
  seriesTotal?: number;
}

const MOCK_BLOCKS: MockBlock[] = [
  /* ── PLL_MAIN ── */
  { key: 'k01', workflow: 'wf1', phase: 'ph_pll_ko', row: 0, artifact: 'c_pll_req', name: 'PLL Requirements Intake' },
  { key: 'k02', workflow: 'wf1', phase: 'ph_pll_ml2', row: 0, artifact: 'a_pll_sim', name: 'PLL Pre-layout Simulation',
    // A Tier — 이 workflow에서는 Digital·PTE가 받는다.
    recipients: { editAccess: { users: ['u1'] }, viewAccess: { departments: ['Digital', 'PTE'] } } },
  { key: 'k03', workflow: 'wf1', phase: 'ph_pll_ml3', row: 0, artifact: 'b_pll_pex', name: 'PLL Netlist / PEX' },
  { key: 'k04', workflow: 'wf1', phase: 'ph_pll_ml4', row: 0, artifact: 'a_pll_post', name: 'PLL Post-layout Simulation',
    // 일부러 recipient를 비워 둔다 — A Tier 게이트 1에서 막히는 상황을 화면에서 확인할 수 있다.
    recipients: {} },
  { key: 'k05', workflow: 'wf1', phase: 'ph_pll_mdr', row: 0, name: 'Design Review Package',
    series: 'k05', seriesIdx: 1, seriesTotal: 2 },
  { key: 'k06', workflow: 'wf1', phase: 'ph_pll_fdr', row: 1, name: 'Design Review Package',
    series: 'k05', seriesIdx: 2, seriesTotal: 2 },
  { key: 'k07', workflow: 'wf1', phase: 'ph_pll_mto', row: 0, name: 'MTO Sign-off Sheet' },

  /* ── LDO_CORE ── */
  { key: 'k10', workflow: 'wf2', phase: 'ph_ldo_a', row: 0, artifact: 'b_ldo_spec', name: 'LDO Spec Data' },
  { key: 'k11', workflow: 'wf2', phase: 'ph_ldo_b', row: 0, name: 'LDO Schematic Review' },
  { key: 'k12', workflow: 'wf2', phase: 'ph_ldo_c', row: 0, artifact: 'd_bgr_meas', name: 'BGR Measurement Report (vendor)' },

  /* ── ADC_RAMP ── */
  { key: 'k20', workflow: 'wf3', phase: 'ph_adc_ko', row: 0, artifact: 'a_rpm_spec', name: 'ADC Ramp Spec (RPM)',
    recipients: { editAccess: { users: ['u4'] }, viewAccess: { departments: ['Analog'] } } },
  { key: 'k21', workflow: 'wf3', phase: 'ph_adc_ar', row: 0, artifact: 'c_adc_ar', name: 'ADC AR Review Package' },
  { key: 'k22', workflow: 'wf3', phase: 'ph_adc_ml3', row: 0, name: 'Ramp Linearity Report' },

  /* ── BGR_REF ── */
  { key: 'k30', workflow: 'wf4', phase: 'ph_bgr_ml1', row: 0, artifact: 'd_bgr_meas', name: 'BGR Measurement Report (vendor)' },
  { key: 'k31', workflow: 'wf4', phase: 'ph_bgr_ml2', row: 0, name: 'BGR Corner Summary' },

  /* ── TG_DRIVER ── */
  { key: 'k40', workflow: 'wf5', phase: 'ph_tg_ko', row: 0, artifact: 'b_tg_timing', name: 'TG Timing Table' },
  { key: 'k41', workflow: 'wf5', phase: 'ph_tg_mid', row: 0, name: 'TG Driver Sizing' },

  /* ── COMP_BLOCK — 유실 상태 두 개 ── */
  { key: 'k50', workflow: 'wf6', phase: 'ph_cmp_ko', row: 0, artifact: 'd_cmp_note', name: 'Comparator Hand Calc' },
  { key: 'k51', workflow: 'wf6', phase: ORPHAN_PHASE_ID, row: 0, name: 'Comparator Layout DB' },
  { key: 'k52', workflow: 'wf6', phase: ORPHAN_PHASE_ID, row: 1, name: 'Comparator Offset Sim' },
];

const MOCK_MEMOS: { workflow: string; phase: string; row: number; text: string }[] = [
  { workflow: 'wf1', phase: 'ph_pll_ml1', row: 0, text: 'ML1 리뷰 코멘트 반영 후 AR 패키지에 합칠 것' },
  { workflow: 'wf2', phase: 'ph_ldo_b', row: 1, text: 'dropout 목표 200mV — 재측정 필요' },
  { workflow: 'wf6', phase: 'ph_cmp_design', row: 0, text: 'layout phase를 지운 상태 — 위 두 블록이 유실로 표시된다' },
];

const MOCK_EDGES: { from: string; to: string; bidirectional?: boolean }[] = [
  { from: 'k01', to: 'k02' },
  { from: 'k02', to: 'k03' },
  { from: 'k03', to: 'k04' },
  { from: 'k04', to: 'k05' },
  { from: 'k05', to: 'k06' },
  { from: 'k02', to: 'k07', bidirectional: true },
  { from: 'k10', to: 'k11' },
  { from: 'k11', to: 'k12' },
  { from: 'k20', to: 'k21' },
  { from: 'k21', to: 'k22' },
  { from: 'k40', to: 'k41' },
];

export async function seedDatabase(models: SeedModels): Promise<void> {
  const {
    ArtifactService: ArtifactServiceModel,
    Project: ProjectModel,
    Workflow: WorkflowModel,
    Artifact: ArtifactModel,
    Block: BlockModel,
    Memo: MemoModel,
    Edge: EdgeModel,
    Release: ReleaseModel,
  } = models;

  /* ── Hub 레지스트리 ──
   * Calypso는 여기 없다 — Hub가 "연동하는 외부 서비스"가 아니라 SIREN이 직접 만든 산출물
   * 관리 기능이라서다.
   *
   * ★ A Tier(simhub/rpm)의 baseUrl은 **SIREN 자신이 띄우는 가짜 observer**를 가리킨다
   *   (src/hub/mock/mock-observer.controller.ts). 개발 환경에는 실서비스가 없어 게이트 2가
   *   항상 실패하고, 그러면 A Tier 산출물이 아무에게도 안 보여 UI를 만들 수 없기 때문이다.
   *   이렇게 해두면 ObserverClientService의 실제 fetch 경로가 그대로 실행된다 — 권한
   *   로직을 우회하지 않는다. */
  const MOCK_OBSERVER = `http://localhost:${process.env.PORT ?? 3000}/api/v1/__mock-observer`;
  await ArtifactServiceModel.deleteMany({ isMock: true });
  await ArtifactServiceModel.insertMany([
    { key: 'ssm', name: 'SSM', contractVersion: '1.0', defaultTier: 'B', transport: 'shared-db',
      baseUrl: null, viewUrlTemplate: 'https://ssm.local/spec/{artifactId}',
      embedUploadUrlTemplate: null, isBuiltIn: false, enabled: true, isMock: true },
    { key: 'simhub', name: 'SimHub', contractVersion: '1.0', defaultTier: 'A', transport: 'http',
      baseUrl: MOCK_OBSERVER, viewUrlTemplate: 'https://simhub.local/run/{artifactId}',
      embedUploadUrlTemplate: null, isBuiltIn: false, enabled: true, isMock: true },
    { key: 'rpm', name: 'RPM', contractVersion: '1.0', defaultTier: 'A', transport: 'http',
      baseUrl: MOCK_OBSERVER, viewUrlTemplate: 'https://rpm.local/artifact/{artifactId}',
      embedUploadUrlTemplate: null, isBuiltIn: false, enabled: true, isMock: true },
    { key: 'layoutdb', name: 'LayoutDB', contractVersion: '1.0', defaultTier: 'B', transport: 'shared-db',
      baseUrl: null, viewUrlTemplate: null,
      embedUploadUrlTemplate: null, isBuiltIn: false, enabled: true, isMock: true },
  ]);

  /* ── 과제 ──
   * revision은 'EVT' + 정수다. code와 함께 생성 후 수정할 수 없다. */
  const [p1] = await ProjectModel.insertMany([
    {
      code: 'CIS-A7', revision: 'EVT1', name: '50MP 모바일 CIS',
      departments: [...DEPTS], departmentsSeeded: true,
      milestones: MILESTONES,
      managers: [KNOX.u1],
      members: [
        { knoxId: KNOX.u1, departments: ['Analog'], addedAt: at('2026-01-02 09:00') },
        { knoxId: KNOX.u2, departments: ['Analog'], addedAt: at('2026-01-02 09:00') },
        { knoxId: KNOX.u3, departments: ['Digital'], addedAt: at('2026-01-02 09:00') },
        { knoxId: KNOX.u4, departments: ['APS'], addedAt: at('2026-01-02 09:00') },
        { knoxId: KNOX.u5, departments: ['PTE'], addedAt: at('2026-01-02 09:00') },
        { knoxId: KNOX.u6, departments: ['PI/PD'], addedAt: at('2026-01-02 09:00') },
        // u7은 두 부서에 동시에 속한다 — workflow 생성 시 dropdown이 실제로 필요한 경우.
        { knoxId: KNOX.u7, departments: ['Solution', 'PTE'], addedAt: at('2026-01-02 09:00') },
      ],
      meta: {}, status: 'ACTIVE', isMock: true,
    },
    {
      code: 'CIS-B3', revision: 'EVT0', name: '108MP 플래그십 CIS',
      departments: [...DEPTS], departmentsSeeded: true,
      milestones: MILESTONES.map((m) => ({ ...m, id: `b3_${m.id}` })),
      managers: [KNOX.u7],
      members: [
        { knoxId: KNOX.u7, departments: ['Analog'], addedAt: at('2026-01-02 09:00') },
        { knoxId: KNOX.u8, departments: ['Digital'], addedAt: at('2026-01-02 09:00') },
      ],
      meta: {}, status: 'ACTIVE', isMock: true,
    },
  ]);
  const projectIds: Record<'p1' | 'p2', Types.ObjectId> = {
    p1: p1._id,
    p2: (await ProjectModel.findOne({ code: 'CIS-B3' }).exec())!._id,
  };

  /* ── Workflow ──
   * 소속 부서는 editAccess.departments에 자동으로 들어간다(서버와 같은 규칙을 시드도 지킨다). */
  const grant = (g?: { departments?: string[]; users?: UserKey[] }) => ({
    departments: [...(g?.departments ?? [])],
    users: (g?.users ?? []).map((u) => KNOX[u]),
  });

  const workflowDocs = await WorkflowModel.insertMany(
    MOCK_WORKFLOWS.map((wf) => {
      const extra = grant(wf.editExtra);
      return {
        projectId: projectIds.p1,
        name: wf.name,
        description: wf.description,
        department: wf.department,
        ownerKnoxId: KNOX[wf.owner],
        editAccess: {
          // 소속 부서가 항상 맨 앞에 온다 — 이 항목은 화면에서 삭제할 수 없다.
          departments: [wf.department, ...extra.departments.filter((d) => d !== wf.department)],
          users: extra.users,
        },
        viewAccess: grant(wf.viewAccess),
        phases: wf.phases,
        phaseWidths: {},
        canvasLock: null,
        releaseSeq: 0,
        color: wf.color,
        isMock: true,
      };
    }),
  );
  const workflowIds: Record<string, Types.ObjectId> = {};
  MOCK_WORKFLOWS.forEach((wf, i) => {
    workflowIds[wf.key] = (workflowDocs[i] as any)._id;
  });

  /* ── Artifact ── */
  const artifactDocs = await ArtifactModel.insertMany(
    MOCK_ARTIFACTS.map((a) => {
      const isA = a.tier === 'A';
      const versions = a.versions.map(([label, isPublished, when, note]) => ({
        tier: a.tier,
        versionLabel: label,
        isPublished,
        versionRef: a.serviceKey ? `${a.serviceKey}:${a.externalArtifactId}:${label}` : null,
        giverKnoxId: KNOX[a.giver],
        giverDept: null,
        sourceRefs: [],
        viewUrl: a.externalUrl ?? null,
        hpcPath: a.network === 'HPC' ? (a.hpcPath ?? null) : null,
        note,
        assertedBy: a.tier === 'C' || a.tier === 'D' ? KNOX[a.giver] : null,
        assertedAt: a.tier === 'C' || a.tier === 'D' ? at(when) : null,
        observedAt: a.tier === 'A' || a.tier === 'B' ? at(when) : null,
        publishedAt: isPublished ? at(when) : null,
        createdAt: at(when),
      }));
      return {
        projectId: projectIds[a.project],
        name: a.name,
        tier: a.tier,
        network: a.network,
        serviceKey: a.serviceKey ?? null,
        externalArtifactId: a.externalArtifactId ?? null,
        artifactTypeKey: null,
        externalUrl: a.externalUrl ?? null,
        // A Tier는 그 서비스가 권한을 판정하므로 SIREN 쪽 권한을 비워 둔다.
        editAccess: isA ? { departments: [], users: [] } : grant(a.editAccess),
        viewAccess: isA ? { departments: [], users: [] } : grant(a.viewAccess),
        versions,
        createdBy: KNOX[a.giver],
        isMock: true,
      };
    }),
  );
  const artifactIds: Record<string, Types.ObjectId> = {};
  MOCK_ARTIFACTS.forEach((a, i) => {
    artifactIds[a.key] = (artifactDocs[i] as any)._id;
  });

  /* ── Block ── */
  const blockDocs = await BlockModel.insertMany(
    MOCK_BLOCKS.map((b) => ({
      projectId: projectIds.p1,
      workflowId: workflowIds[b.workflow],
      phaseId: b.phase,
      artifactId: b.artifact ? artifactIds[b.artifact] : null,
      name: b.name,
      layout: seedXY(LANE_INDEX[b.phase] ?? 0, b.row, NW, NH),
      intent: 'own',
      recipients: {
        editAccess: grant(b.recipients?.editAccess),
        viewAccess: grant(b.recipients?.viewAccess),
      },
      series: null,
      seriesIdx: b.seriesIdx ?? 1,
      seriesTotal: b.seriesTotal ?? 1,
      createdBy: KNOX.u1,
      isMock: true,
    })),
  );
  const blockIds: Record<string, Types.ObjectId> = {};
  MOCK_BLOCKS.forEach((b, i) => {
    blockIds[b.key] = (blockDocs[i] as any)._id;
  });

  // series 연결 — 원본 블록의 _id를 회차 인스턴스가 가리킨다.
  await BlockModel.updateOne({ _id: blockIds['k06'] }, { $set: { series: blockIds['k05'] } }).exec();

  /* ── Memo ── */
  await MemoModel.insertMany(
    MOCK_MEMOS.map((m) => ({
      workflowId: workflowIds[m.workflow],
      phaseId: m.phase,
      text: m.text,
      layout: seedXY(LANE_INDEX[m.phase] ?? 0, m.row, MW, MH),
      createdBy: KNOX.u1,
      isMock: true,
    })),
  );

  /* ── Edge ── */
  await EdgeModel.insertMany(
    MOCK_EDGES.map((e) => {
      const wfKey = MOCK_BLOCKS.find((b) => b.key === e.from)!.workflow;
      return {
        workflowId: workflowIds[wfKey],
        fromId: blockIds[e.from],
        toId: blockIds[e.to],
        bidirectional: e.bidirectional ?? false,
        auto: false,
        isMock: true,
      };
    }),
  );

  /* ── Release ──
   * wf1에 두 번의 release를 심는다. 두 번째에서 PLL Pre-layout Simulation의 major가
   * v1 → v2로 올라가 `changed: true`가 되고, 표에서 highlight된다.
   * PLL Post-layout Simulation은 두 번째 release 시점에 아직 publish 전이라
   * `Not published`로 실린다 — 그래도 알림은 함께 간다는 규칙을 보여준다. */
  const releasedVersion = (label: string, when: string, majorKey: string) => ({
    versionLabel: label,
    versionRef: `simhub:SIM-PLL-0421:${label}`,
    majorKey,
    publishedAt: at(when),
    viewUrl: null,
    hpcPath: null,
    giverKnoxId: KNOX.u1,
  });

  await ReleaseModel.insertMany([
    {
      projectId: projectIds.p1,
      workflowId: workflowIds['wf1'],
      seq: 1,
      releasedAt: at('2026-05-04 11:00'),
      releasedBy: KNOX.u1,
      note: 'ML2 산출물 1차 전달',
      workflowAt: { name: 'PLL_MAIN', department: 'Analog' },
      items: [
        {
          blockId: blockIds['k02'].toString(),
          artifactId: artifactIds['a_pll_sim'].toString(),
          artifactName: 'PLL Pre-layout Simulation',
          tier: 'A', network: 'OA',
          phaseId: 'ph_pll_ml2', phaseName: 'ML2',
          published: releasedVersion('v1.0', '2026-04-21 13:10', '1'),
          changed: true, firstTime: true,
          recipients: { departments: ['Digital', 'PTE'], users: [KNOX.u1] },
          sources: [
            {
              blockId: blockIds['k01'].toString(),
              artifactId: artifactIds['c_pll_req'].toString(),
              artifactName: 'PLL Requirements Intake',
              selected: {
                versionLabel: 'v1.0', versionRef: null, majorKey: '1',
                publishedAt: at('2026-01-09 10:20'), viewUrl: null, hpcPath: null, giverKnoxId: KNOX.u1,
              },
            },
          ],
          lookupFailed: false,
        },
      ],
      recipientDepartments: ['Digital', 'PTE'],
      recipientUsers: [KNOX.u1],
      isMock: true,
    },
    {
      projectId: projectIds.p1,
      workflowId: workflowIds['wf1'],
      seq: 2,
      releasedAt: at('2026-06-10 15:30'),
      releasedBy: KNOX.u1,
      note: 'ML3 PEX 및 시뮬레이션 갱신본 전달',
      workflowAt: { name: 'PLL_MAIN', department: 'Analog' },
      items: [
        {
          blockId: blockIds['k02'].toString(),
          artifactId: artifactIds['a_pll_sim'].toString(),
          artifactName: 'PLL Pre-layout Simulation',
          tier: 'A', network: 'OA',
          phaseId: 'ph_pll_ml2', phaseName: 'ML2',
          published: releasedVersion('v2.0', '2026-06-03 10:40', '2'),
          // major가 1 → 2로 바뀌었다.
          changed: true, firstTime: false,
          recipients: { departments: ['Digital', 'PTE'], users: [KNOX.u1] },
          sources: [
            {
              blockId: blockIds['k01'].toString(),
              artifactId: artifactIds['c_pll_req'].toString(),
              artifactName: 'PLL Requirements Intake',
              selected: {
                versionLabel: 'v1.0', versionRef: null, majorKey: '1',
                publishedAt: at('2026-01-09 10:20'), viewUrl: null, hpcPath: null, giverKnoxId: KNOX.u1,
              },
            },
          ],
          lookupFailed: false,
        },
        {
          blockId: blockIds['k03'].toString(),
          artifactId: artifactIds['b_pll_pex'].toString(),
          artifactName: 'PLL Netlist / PEX',
          tier: 'B', network: 'HPC',
          phaseId: 'ph_pll_ml3', phaseName: 'ML3',
          published: {
            versionLabel: 'r1', versionRef: 'ssm:SSM-PEX-PLL:r1', majorKey: 'r1',
            publishedAt: at('2026-06-04 19:55'), viewUrl: null,
            hpcPath: '/vwp/cis_a7/pll_main/pex/r1', giverKnoxId: KNOX.u1,
          },
          changed: true, firstTime: true,
          recipients: { departments: ['Digital', 'PTE', 'Analog'], users: [] },
          sources: [
            {
              blockId: blockIds['k02'].toString(),
              artifactId: artifactIds['a_pll_sim'].toString(),
              artifactName: 'PLL Pre-layout Simulation',
              selected: {
                versionLabel: 'v2.0', versionRef: 'simhub:SIM-PLL-0421:v2.0', majorKey: '2',
                publishedAt: at('2026-06-03 10:40'), viewUrl: null, hpcPath: null, giverKnoxId: KNOX.u1,
              },
            },
          ],
          lookupFailed: false,
        },
        {
          blockId: blockIds['k04'].toString(),
          artifactId: artifactIds['a_pll_post'].toString(),
          artifactName: 'PLL Post-layout Simulation',
          tier: 'A', network: 'OA',
          phaseId: 'ph_pll_ml4', phaseName: 'ML4',
          // 이 시점에 publish된 버전이 없다 — 표에는 `Not published`로, 받는 쪽에는
          // "아직 전달되지 않음"으로 보인다. release 자체는 막지 않는다.
          published: null,
          changed: true, firstTime: true,
          recipients: { departments: [], users: [] },
          sources: [
            {
              blockId: blockIds['k03'].toString(),
              artifactId: artifactIds['b_pll_pex'].toString(),
              artifactName: 'PLL Netlist / PEX',
              selected: {
                versionLabel: 'r1', versionRef: 'ssm:SSM-PEX-PLL:r1', majorKey: 'r1',
                publishedAt: at('2026-06-04 19:55'), viewUrl: null,
                hpcPath: '/vwp/cis_a7/pll_main/pex/r1', giverKnoxId: KNOX.u1,
              },
            },
          ],
          lookupFailed: false,
        },
      ],
      recipientDepartments: ['Digital', 'PTE', 'Analog'],
      recipientUsers: [KNOX.u1],
      isMock: true,
    },
  ]);

  // releaseSeq를 실제 release 수와 맞춰 둔다 — 다음 release가 v3부터 시작한다.
  await WorkflowModel.updateOne({ _id: workflowIds['wf1'] }, { $set: { releaseSeq: 2 } }).exec();
}
