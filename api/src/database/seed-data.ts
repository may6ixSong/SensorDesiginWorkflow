/**
 * SIREN 목업 데이터 시드 로직. 이미 resolve된 Model 묶음을 받아서 채워 넣기만 한다 -
 * 연결(실제 DB든 인메모리든)은 전적으로 호출자 책임이다.
 *
 * ★ 2026-08 구조 변경 반영:
 *   - IP → Workflow 로 개념/명칭 통일.
 *   - 일정이 두 축으로 갈렸다. 과제 공통 일정 = Project.milestones, workflow마다 다른
 *     일정 = Workflow.phases. workflow를 만들면 마일스톤이 복사되지만 그 뒤로는 독립이며,
 *     칸 수·이름·날짜가 전부 달라도 되고 서로 겹쳐도 된다.
 *   - 산출물은 workflow의 phase id를 가리킨다(Deliverable.phaseId). 그 phase가 지워지면
 *     산출물은 캔버스 좌표를 유지한 채 "일정 유실" 상태로 남는다 — 이 시드도 그 상태를
 *     일부러 하나 만들어 둔다(COMP_BLOCK).
 */
import { Model, Types } from 'mongoose';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { DeliverableDocument } from '../deliverables/schemas/deliverable.schema';
import { MemoDocument } from '../memos/schemas/memo.schema';
import { EdgeDocument } from '../edges/schemas/edge.schema';
import { HldReleaseDocument } from '../hld/schemas/hld-release.schema';
import { ArtifactServiceDocument } from '../hub/schemas/artifact-service.schema';

export interface SeedModels {
  ArtifactService: Model<ArtifactServiceDocument>;
  Project: Model<ProjectDocument>;
  Workflow: Model<WorkflowDocument>;
  Deliverable: Model<DeliverableDocument>;
  Memo: Model<MemoDocument>;
  Edge: Model<EdgeDocument>;
  HldRelease: Model<HldReleaseDocument>;
}

/* ── 캔버스 좌표 상수 ──
 * FE의 web/src/lib/constants.ts 값과 반드시 일치해야 한다. 여기가 어긋나면 seedXY()가
 * 계산하는 절대 x좌표와 FE가 실제로 그리는 레인 폭(DEFAULT_PW)이 서로 달라져, 시드
 * 산출물들이 의도한 phase 레인을 벗어나 옆 레인과 겹쳐 보인다. */
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

/**
 * 캔버스 좌표: laneIndex번째 phase 레인 안쪽 가운데, row번째 줄.
 * laneIndex는 그 workflow의 phase를 start 오름차순으로 세웠을 때의 순번이다
 * (FE의 laneG()와 같은 기준).
 */
function seedXY(laneIndex: number, row: number, w: number, h: number) {
  const laneX = laneIndex * DEFAULT_PW;
  return {
    x: snp(laneX + Math.max(6, (DEFAULT_PW - w) / 2)),
    y: TOP_PAD + row * ROW_H,
    w,
    h,
  };
}

/* ── 과제 공통 일정(마일스톤) ──
 * 이름은 전부 사내에서 쓰는 짧은 표기 그대로다. full name(예: 'ML1' = 무엇의 약자인지)은
 * 저장하지 않는다 — workflow마다 일정을 다르게 잡을 수 있게 되면서 이 약어가 무엇을
 * 뜻하는지는 과제/조직마다 다르기 때문이다(추측해서 채우지 않는다). */
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

/** "YYYY-MM-DD HH:mm" 문자열을 로컬 Date로 (FE에서 같은 포맷으로 되돌린다). */
const at = (s: string) => new Date(s.replace(' ', 'T') + ':00');

type MockUserKey = 'u1' | 'u2' | 'u3' | 'u4' | 'u5' | 'u6' | 'u7' | 'u8';

/* ── 목업 사용자 ──
 * api는 users 컬렉션을 갖지 않으므로(src/common/actor.ts) 사용자는 KnoxID 문자열로만
 * 참조된다. 이름/부서/아바타색은 web의 목업 디렉터리(web/src/shared/constants/mock-users.ts)에
 * 있고, 실서비스에서는 공통 플랫폼(USER_GROUP_API)이 그 역할을 한다.
 *
 * u1 = 'sdp.op' - web AuthProvider의 개발용 DEV_USER와 동일한 KnoxID여야 한다.
 */
const KNOX: Record<MockUserKey, string> = {
  u1: 'sdp.op',
  u2: 'jihoon.park',
  u3: 'sumin.lee',
  u4: 'hayoon.jung',
  u5: 'dain.choi',
  u6: 'sehun.oh',
  u7: 'jiyeon.han',
  u8: 'dahyun.ryu',
};

/* ── Workflow 정의 ──
 * phases가 workflow마다 완전히 다르다는 것이 이 시드의 핵심이다:
 *   - PLL_MAIN  : 과제 마일스톤을 그대로 복사한 기본형(칸 10개).
 *   - LDO_CORE  : 칸을 크게 묶고 서로 겹치게 잡은 형태.
 *   - ADC_RAMP  : 자체 리듬 + AR이 ML1과 겹침.
 *   - BGR_REF   : 앞쪽에서 끝나는 짧은 일정.
 *   - TG_DRIVER : 중간이 길게 겹침.
 *   - COMP_BLOCK: 일부러 phase 하나를 "지운" 상태 — 그 phase를 가리키던 산출물 두 개가
 *                 캔버스에 유실 상태로 남는다(아래 ORPHAN_PHASE_ID).
 */
interface MockPhase { id: string; name: string; start: string; end: string }
interface MockWorkflow {
  key: string;
  name: string;
  domain: string;
  description: string;
  color: string;
  owners: MockUserKey[];
  viewGrants: { user: MockUserKey; department: string }[];
  phases: MockPhase[];
}

/** COMP_BLOCK이 예전에 갖고 있다가 지운 phase의 id — 어떤 workflow의 phase 목록에도 없다. */
const ORPHAN_PHASE_ID = 'ph_cmp_layout_removed';

const MOCK_WORKFLOWS: MockWorkflow[] = [
  {
    key: 'wf1', name: 'PLL_MAIN', domain: 'Digital', description: 'Main clock generation PLL',
    color: '#0c9a83', owners: ['u1'],
    viewGrants: [{ user: 'u3', department: 'digital' }, { user: 'u5', department: 'pte' }],
    phases: MILESTONES.map((m) => ({ ...m, id: `ph_pll_${m.id.slice(3)}` })),
  },
  {
    key: 'wf2', name: 'LDO_CORE', domain: 'Analog', description: 'Core power regulator',
    color: '#5849cf', owners: ['u1'],
    viewGrants: [{ user: 'u4', department: 'solution' }],
    phases: [
      { id: 'ph_ldo_ko', name: 'KO', start: '2026-01-05', end: '2026-02-28' },
      { id: 'ph_ldo_des', name: 'DES', start: '2026-02-10', end: '2026-05-10' },
      { id: 'ph_ldo_sim', name: 'SIM', start: '2026-04-20', end: '2026-07-31' },
      { id: 'ph_ldo_mdr', name: 'MDR', start: '2026-07-01', end: '2026-08-20' },
      { id: 'ph_ldo_so', name: 'SIGNOFF', start: '2026-09-01', end: '2026-11-30' },
    ],
  },
  {
    key: 'wf3', name: 'ADC_RAMP', domain: 'Analog', description: 'Ramp-type column ADC',
    color: '#2563c9', owners: ['u2'],
    viewGrants: [{ user: 'u5', department: 'pte' }, { user: 'u3', department: 'digital' }],
    phases: [
      { id: 'ph_adc_ko', name: 'KO', start: '2026-01-05', end: '2026-02-16' },
      { id: 'ph_adc_ml1', name: 'ML1', start: '2026-02-16', end: '2026-03-30' },
      { id: 'ph_adc_ar', name: 'AR', start: '2026-03-10', end: '2026-04-24' },
      { id: 'ph_adc_ml2', name: 'ML2', start: '2026-04-24', end: '2026-06-12' },
      { id: 'ph_adc_mdr', name: 'MDR', start: '2026-06-12', end: '2026-07-31' },
      { id: 'ph_adc_fdr', name: 'FDR', start: '2026-08-15', end: '2026-09-30' },
      { id: 'ph_adc_mto', name: 'MTO', start: '2026-09-30', end: '2026-10-20' },
    ],
  },
  {
    key: 'wf4', name: 'BGR_REF', domain: 'Analog', description: 'Bandgap voltage reference',
    color: '#ac6f08', owners: ['u1'],
    viewGrants: [{ user: 'u5', department: 'pte' }],
    phases: [
      { id: 'ph_bgr_ko', name: 'KO', start: '2026-01-05', end: '2026-02-10' },
      { id: 'ph_bgr_des', name: 'DES', start: '2026-02-10', end: '2026-04-10' },
      { id: 'ph_bgr_ver', name: 'VER', start: '2026-03-25', end: '2026-06-05' },
      { id: 'ph_bgr_ho', name: 'HANDOFF', start: '2026-06-05', end: '2026-07-10' },
    ],
  },
  {
    key: 'wf5', name: 'TG_DRIVER', domain: 'Digital', description: 'Timing generator output driver',
    color: '#0891b2', owners: ['u2'],
    viewGrants: [{ user: 'u3', department: 'digital' }],
    phases: [
      { id: 'ph_tg_ko', name: 'KO', start: '2026-01-12', end: '2026-03-02' },
      { id: 'ph_tg_tim', name: 'TIM', start: '2026-03-02', end: '2026-05-15' },
      { id: 'ph_tg_drv', name: 'DRV', start: '2026-05-01', end: '2026-07-30' },
      { id: 'ph_tg_fdr', name: 'FDR', start: '2026-08-31', end: '2026-09-21' },
    ],
  },
  {
    key: 'wf6', name: 'COMP_BLOCK', domain: 'Analog', description: 'ADC comparator block',
    color: '#be185d', owners: ['u2'],
    viewGrants: [{ user: 'u5', department: 'pte' }, { user: 'u3', department: 'digital' }],
    // 'LAYOUT'(ph_cmp_layout_removed)과 'MTO' 칸이 원래 있었다고 가정하고 지운 상태다.
    phases: [
      { id: 'ph_cmp_ko', name: 'KO', start: '2026-01-14', end: '2026-02-28' },
      { id: 'ph_cmp_ar', name: 'AR', start: '2026-02-28', end: '2026-04-20' },
      { id: 'ph_cmp_ml2', name: 'ML2', start: '2026-04-20', end: '2026-06-15' },
    ],
  },
];

/** workflow별 phase id → 레인 순번(start 오름차순). 좌표 계산용. */
const LANE_INDEX: Record<string, number> = {};
MOCK_WORKFLOWS.forEach((w) => {
  [...w.phases]
    .sort((a, b) => (a.start === b.start ? a.end.localeCompare(b.end) : a.start.localeCompare(b.start)))
    .forEach((p, i) => { LANE_INDEX[p.id] = i; });
});
// 유실된 phase의 산출물은 "원래 있던 자리"에 그대로 남아야 하므로, 지워지기 전 순번을
// 그대로 쓴다 — COMP_BLOCK의 4번째 레인.
LANE_INDEX[ORPHAN_PHASE_ID] = 3;

/* ── 목업 산출물 (versions: [major,minor,kind,by,at,note,file]) ── */
type MockVer = [number, number, 'major' | 'minor', MockUserKey, string, string, string];
interface MockItem {
  id: string;
  workflow: string;
  /** 그 workflow의 phase id. 목록에 없는 값(ORPHAN_PHASE_ID)이면 "일정 유실" 상태다. */
  phase: string;
  row: number;
  name: string;
  type: string;
  net: 'OA' | 'HPC';
  recvDept?: string | null;
  recvContact?: MockUserKey | null;
  /** 이 산출물을 받아야 하는 다른 workflow (recvDept와 별개, workflow↔workflow 핸드오프). */
  recvWorkflow?: string | null;
  /** 이 시스템에 없는 외부 부서(파운드리 등)로부터 받았음을 나타내는 자유 텍스트. */
  sourceDept?: string | null;
  series?: string;
  seriesIdx?: number;
  seriesTotal?: number;
  versions: MockVer[];
}

const MOCK_ITEMS: MockItem[] = [
  /* ── PLL_MAIN (Digital) ── */
  { id:'d01', workflow:'wf1', phase:'ph_pll_ko', row:0, name:'PLL Requirements Intake', type:'word', net:'OA', recvDept:'digital', recvContact:'u3',
    versions:[[1,0,'major','u1','2026-01-09 10:20','Initial draft','PLL_req_v1.0.docx']] },
  { id:'d02', workflow:'wf1', phase:'ph_pll_ml1', row:0, name:'PLL Architecture Review', type:'word', net:'OA', recvWorkflow:'wf5',
    versions:[[1,0,'major','u1','2026-02-18 16:05','Initial draft','PLL_arch_v1.0.docx']] },
  { id:'d03', workflow:'wf1', phase:'ph_pll_ar', row:0, name:'AR Review Package', type:'word', net:'OA', recvDept:'digital', recvContact:'u3', recvWorkflow:'wf5',
    versions:[
      [2,1,'minor','u1','2026-04-02 09:30','Added action items','PLL_AR_v2.1.docx'],
      [2,0,'major','u1','2026-03-18 14:00','2nd release','PLL_AR_v2.0.docx'],
      [1,0,'major','u1','2026-03-12 11:20','Initial draft','PLL_AR_v1.0.docx'],
    ] },
  { id:'d04', workflow:'wf1', phase:'ph_pll_ml2', row:0, name:'Circuit Design Document', type:'word', net:'OA',
    versions:[[1,0,'major','u1','2026-04-22 17:40','1st release','PLL_ckt_design_v1.0.docx']] },
  { id:'d05', workflow:'wf1', phase:'ph_pll_ml2', row:1, name:'Loop Filter Calculation Sheet', type:'excel', net:'OA',
    versions:[[1,0,'major','u1','2026-04-21 13:10','1st release','PLL_loopfilter_v1.0.xlsx']] },
  { id:'d06', workflow:'wf1', phase:'ph_pll_ml3', row:0, name:'Pre-layout Simulation Results', type:'excel', net:'OA', recvDept:'pte', recvContact:'u5',
    versions:[
      [1,2,'minor','u1','2026-06-08 21:15','SS/FF corner','PLL_prelay_sim_v1.2.xlsx'],
      [1,0,'major','u1','2026-06-03 10:40','1st release','PLL_prelay_sim_v1.0.xlsx'],
    ] },
  { id:'d07', workflow:'wf1', phase:'ph_pll_ml3', row:1, name:'Netlist / PEX', type:'path', net:'HPC',
    versions:[[1,0,'major','u1','2026-06-04 19:55','RC extraction','/vwp/cis_a7/pll_main/pex/r1']] },
  { id:'d08', workflow:'wf1', phase:'ph_pll_mdr', row:0, name:'Design Review Package', type:'word', net:'OA',
    series:'d08', seriesIdx:1, seriesTotal:3, recvDept:'digital', recvContact:'u3',
    versions:[[1,0,'major','u1','2026-07-02 14:10','Released at MDR','PLL_review_v1.0.docx']] },
  { id:'d08_ML4', workflow:'wf1', phase:'ph_pll_ml4', row:1, name:'Design Review Package', type:'word', net:'OA',
    series:'d08', seriesIdx:2, seriesTotal:3, recvDept:'digital', recvContact:'u3',
    versions:[[1,2,'minor','u1','2026-08-06 18:22','Addressing ML4 review comments','PLL_review_v1.2.docx']] },
  { id:'d08_FDR', workflow:'wf1', phase:'ph_pll_fdr', row:1, name:'Design Review Package', type:'word', net:'OA',
    series:'d08', seriesIdx:3, seriesTotal:3, recvDept:'digital', recvContact:'u3', versions:[] },
  { id:'d09', workflow:'wf1', phase:'ph_pll_ml4', row:0, name:'Post-layout Simulation Results', type:'excel', net:'OA', versions:[] },
  { id:'d10', workflow:'wf1', phase:'ph_pll_ml4', row:1, name:'Layout DB', type:'path', net:'HPC', versions:[] },
  { id:'d11', workflow:'wf1', phase:'ph_pll_fdr', row:0, name:'FDR Checklist', type:'word', net:'OA', recvDept:'digital', recvContact:'u3', versions:[] },
  { id:'d12', workflow:'wf1', phase:'ph_pll_mto', row:0, name:'MTO Sign-off Sheet', type:'excel', net:'OA', recvDept:'pte', recvContact:'u5', versions:[] },
  { id:'d13', workflow:'wf1', phase:'ph_pll_fab', row:0, name:'Fab-out Characterization Plan', type:'word', net:'OA', versions:[] },
  { id:'d14', workflow:'wf1', phase:'ph_pll_ml2', row:2, name:'Substrate/Package Outline Spec', type:'word', net:'OA', sourceDept:'Package (Foundry)',
    series:'d14', seriesIdx:1, seriesTotal:2,
    versions:[[1,0,'major','u1','2026-04-24 10:05','Received from foundry','PKG_outline_v1.0.docx']] },
  { id:'d14_ML3', workflow:'wf1', phase:'ph_pll_ml3', row:2, name:'Substrate/Package Outline Spec', type:'word', net:'OA', sourceDept:'Package (Foundry)',
    series:'d14', seriesIdx:2, seriesTotal:2, versions:[] },

  /* ── LDO_CORE (Analog) — 칸이 크고 서로 겹치는 일정 ── */
  { id:'e01', workflow:'wf2', phase:'ph_ldo_ko', row:0, name:'LDO Requirements Intake', type:'word', net:'OA', recvDept:'solution', recvContact:'u4',
    versions:[[1,0,'major','u1','2026-01-10 09:40','Initial draft','LDO_req_v1.0.docx']] },
  { id:'e02', workflow:'wf2', phase:'ph_ldo_des', row:0, name:'Power Tree Review', type:'word', net:'OA',
    versions:[[1,0,'major','u1','2026-02-19 15:10','Initial draft','LDO_powertree_v1.0.docx']] },
  { id:'e03', workflow:'wf2', phase:'ph_ldo_des', row:1, name:'AR Review Package', type:'word', net:'OA',
    versions:[[1,0,'major','u1','2026-03-17 11:35','1st release','LDO_AR_v1.0.docx']] },
  { id:'e04', workflow:'wf2', phase:'ph_ldo_sim', row:0, name:'Load/Line Regulation Simulation', type:'excel', net:'OA',
    versions:[[1,2,'minor','u1','2026-08-09 17:31','Added load step','LDO_reg_v1.2.xlsx']] },
  { id:'e05', workflow:'wf2', phase:'ph_ldo_sim', row:1, name:'Startup Sequence Waveform', type:'path', net:'HPC',
    versions:[[1,0,'major','u1','2026-06-10 22:05','Transient','/vwp/cis_a7/ldo_core/tran/startup']] },
  { id:'e06', workflow:'wf2', phase:'ph_ldo_mdr', row:0, name:'MDR Review Package', type:'word', net:'OA', versions:[] },
  { id:'e07', workflow:'wf2', phase:'ph_ldo_mdr', row:1, name:'Post-layout Re-verification', type:'excel', net:'OA', versions:[] },
  { id:'e08', workflow:'wf2', phase:'ph_ldo_so', row:0, name:'Reliability Review', type:'word', net:'OA', recvDept:'solution', recvContact:'u4', versions:[] },
  { id:'e09', workflow:'wf2', phase:'ph_ldo_so', row:1, name:'Mass Production Handover Package', type:'word', net:'OA', recvDept:'solution', recvContact:'u4', versions:[] },

  /* ── ADC_RAMP (Analog) ── */
  { id:'f01', workflow:'wf3', phase:'ph_adc_ko', row:0, name:'ADC Requirements Intake', type:'word', net:'OA', recvDept:'pte', recvContact:'u5',
    versions:[[1,0,'major','u2','2026-01-08 13:50','Initial draft','ADC_req_v1.0.docx']] },
  { id:'f02', workflow:'wf3', phase:'ph_adc_ar', row:0, name:'Architecture Review Material', type:'word', net:'OA',
    versions:[[2,0,'major','u2','2026-03-19 16:30','Ramp finalized','ADC_arch_v2.0.docx']] },
  { id:'f03', workflow:'wf3', phase:'ph_adc_ml2', row:0, name:'INL/DNL Simulation Results', type:'excel', net:'OA',
    versions:[[2,0,'major','u2','2026-04-23 09:44','2nd release','ADC_inl_dnl_v2.0.xlsx']] },
  { id:'f04', workflow:'wf3', phase:'ph_adc_ml2', row:1, name:'Noise Analysis Report', type:'excel', net:'OA',
    versions:[[1,1,'minor','u2','2026-08-10 11:02','kTC noise','ADC_noise_v1.1.xlsx']] },
  { id:'f05', workflow:'wf3', phase:'ph_adc_mdr', row:0, name:'Column Layout DB', type:'path', net:'HPC',
    versions:[[1,0,'major','u2','2026-06-05 20:40','Layout freeze','/vwp/cis_a7/adc_ramp/layout/r1']] },
  { id:'f06', workflow:'wf3', phase:'ph_adc_mdr', row:1, name:'MDR Review Package', type:'word', net:'OA', versions:[] },
  { id:'f07', workflow:'wf3', phase:'ph_adc_fdr', row:0, name:'Post-layout Re-verification', type:'excel', net:'OA', versions:[] },
  { id:'f08', workflow:'wf3', phase:'ph_adc_fdr', row:1, name:'FDR Checklist', type:'word', net:'OA', recvDept:'pte', recvContact:'u5', versions:[] },
  { id:'f09', workflow:'wf3', phase:'ph_adc_mto', row:0, name:'MTO Sign-off Sheet', type:'excel', net:'OA', versions:[] },

  /* ── BGR_REF (Analog) — 앞쪽에서 끝나는 짧은 일정 ── */
  { id:'g01', workflow:'wf4', phase:'ph_bgr_ko', row:0, name:'BGR Requirements Intake', type:'word', net:'OA', recvDept:'pte', recvContact:'u5',
    versions:[[1,0,'major','u1','2026-01-11 10:00','Initial draft','BGR_req_v1.0.docx']] },
  { id:'g02', workflow:'wf4', phase:'ph_bgr_des', row:0, name:'BGR Architecture Note', type:'word', net:'OA', recvWorkflow:'wf1',
    versions:[[1,0,'major','u1','2026-02-20 14:00','1st release','BGR_arch_v1.0.docx']] },
  { id:'g03', workflow:'wf4', phase:'ph_bgr_des', row:1, name:'AR Review Package', type:'word', net:'OA', recvWorkflow:'wf2',
    versions:[[1,0,'major','u1','2026-03-18 09:00','1st release','BGR_AR_v1.0.docx']] },
  { id:'g04', workflow:'wf4', phase:'ph_bgr_ver', row:0, name:'Temp Coefficient Simulation', type:'excel', net:'OA', recvWorkflow:'wf2',
    versions:[[1,1,'minor','u1','2026-06-09 12:00','Corner sweep added','BGR_tempco_v1.1.xlsx']] },
  { id:'g05', workflow:'wf4', phase:'ph_bgr_ho', row:0, name:'Reference Handoff Package', type:'word', net:'OA', versions:[] },
  { id:'g06', workflow:'wf4', phase:'ph_bgr_ho', row:1, name:'Reference Checklist', type:'word', net:'OA', recvDept:'pte', recvContact:'u5', versions:[] },

  /* ── TG_DRIVER (Digital) ── */
  { id:'h01', workflow:'wf5', phase:'ph_tg_ko', row:0, name:'TG Requirements Intake', type:'word', net:'OA', recvDept:'digital', recvContact:'u3',
    versions:[[1,0,'major','u2','2026-01-12 11:20','Initial draft','TG_req_v1.0.docx']] },
  { id:'h02', workflow:'wf5', phase:'ph_tg_tim', row:0, name:'Timing Diagram Spec', type:'word', net:'OA',
    versions:[[1,0,'major','u2','2026-04-24 10:15','1st release','TG_timing_v1.0.docx']] },
  { id:'h03', workflow:'wf5', phase:'ph_tg_drv', row:0, name:'Driver Strength Simulation', type:'excel', net:'OA',
    versions:[[1,0,'major','u2','2026-06-06 15:40','1st release','TG_drv_sim_v1.0.xlsx']] },
  { id:'h04', workflow:'wf5', phase:'ph_tg_drv', row:1, name:'Post-layout Re-verification', type:'excel', net:'OA', versions:[] },
  { id:'h05', workflow:'wf5', phase:'ph_tg_fdr', row:0, name:'FDR Checklist', type:'word', net:'OA', recvDept:'digital', recvContact:'u3', versions:[] },

  /* ── COMP_BLOCK (Analog) ──
   * k04/k05는 지워진 phase(ORPHAN_PHASE_ID)를 가리킨다 — 캔버스에서 원래 좌표 그대로
   * 남되 "일정 유실"로 표시되어야 한다(사용자 요청). 이 두 개가 그 동작의 실물 예시다. */
  { id:'k01', workflow:'wf6', phase:'ph_cmp_ko', row:0, name:'Comparator Requirements Intake', type:'word', net:'OA', recvDept:'pte', recvContact:'u5',
    versions:[[1,0,'major','u2','2026-01-14 09:30','Initial draft','COMP_req_v1.0.docx']] },
  { id:'k02', workflow:'wf6', phase:'ph_cmp_ar', row:0, name:'Architecture Review Material', type:'word', net:'OA', recvWorkflow:'wf3',
    versions:[[1,0,'major','u2','2026-03-20 13:10','1st release','COMP_arch_v1.0.docx']] },
  { id:'k03', workflow:'wf6', phase:'ph_cmp_ml2', row:0, name:'Offset Simulation Results', type:'excel', net:'OA', recvWorkflow:'wf3',
    versions:[[1,2,'minor','u2','2026-04-25 16:20','Monte Carlo added','COMP_offset_v1.2.xlsx']] },
  { id:'k04', workflow:'wf6', phase:ORPHAN_PHASE_ID, row:0, name:'Layout DB', type:'path', net:'HPC',
    versions:[[1,0,'major','u2','2026-06-07 18:00','Layout freeze','/vwp/cis_a7/comp_block/layout/r1']] },
  { id:'k05', workflow:'wf6', phase:ORPHAN_PHASE_ID, row:1, name:'MTO Sign-off Sheet', type:'excel', net:'OA', versions:[] },
];

const MOCK_NOTES: { id: string; workflow: string; phase: string; row: number; text: string }[] = [
  { id:'n1', workflow:'wf1', phase:'ph_pll_ml2', row:2, text:'Start post-layout once Digital team returns CDC review' },
  { id:'n2', workflow:'wf1', phase:'ph_pll_ml4', row:2, text:'Reflect Verification team review results in the FDR checklist' },
  { id:'n3', workflow:'wf1', phase:'ph_pll_fab', row:1, text:'→ Final handoff to Product Engineering & MP Engineering' },
  { id:'n4', workflow:'wf2', phase:'ph_ldo_mdr', row:2, text:'Reliability item (HTOL) must be confirmed before MP handover' },
  { id:'n5', workflow:'wf3', phase:'ph_adc_mdr', row:2, text:'Layout DB exists only on the HPC network — path shared only' },
  { id:'n6', workflow:'wf6', phase:'ph_cmp_ml2', row:1, text:'LAYOUT phase was dropped — the two artifacts left behind still need a home' },
];

/**
 * 목업 EDGES. 역방향 쌍(g7/g7r)이 곧 양방향 표현이다.
 * `workflow`가 없으면 from 산출물의 소유 workflow에 귀속된다. workflow↔workflow 핸드오프
 * edge(아래 x1~x7)는 받는 쪽 workflow에 귀속시켜야 그 보드에서 렌더되므로 명시한다.
 */
const MOCK_EDGES: { id: string; from: string; to: string; auto?: boolean; workflow?: string }[] = [
  { id:'g1', from:'d01', to:'d02' }, { id:'g2', from:'d02', to:'d03' }, { id:'g3', from:'d03', to:'d04' },
  { id:'g4', from:'d03', to:'d05' }, { id:'g5', from:'d04', to:'d06' }, { id:'g6', from:'d05', to:'d06' },
  { id:'g7', from:'d06', to:'d07' }, { id:'g7r', from:'d07', to:'d06' },
  { id:'g8', from:'d06', to:'d08' }, { id:'g9', from:'d08', to:'d09' },
  { id:'sq1', from:'d08', to:'d08_ML4', auto:true }, { id:'sq2', from:'d08_ML4', to:'d08_FDR', auto:true },
  { id:'g10', from:'d07', to:'d10' }, { id:'g11', from:'d09', to:'d11' }, { id:'g12', from:'d11', to:'d12' },
  { id:'g13', from:'d12', to:'d13' },
  { id:'h1', from:'e01', to:'e02' }, { id:'h2', from:'e02', to:'e03' }, { id:'h3', from:'e03', to:'e04' },
  { id:'h4', from:'e03', to:'e05' }, { id:'h5', from:'e04', to:'e06' }, { id:'h6', from:'e06', to:'e07' },
  { id:'h7', from:'e07', to:'e08' }, { id:'h8', from:'e08', to:'e09' },
  { id:'i1', from:'f01', to:'f02' }, { id:'i2', from:'f02', to:'f03' }, { id:'i3', from:'f03', to:'f04' },
  { id:'i4', from:'f03', to:'f05' }, { id:'i5', from:'f04', to:'f06' }, { id:'i6', from:'f05', to:'f07' },
  { id:'i7', from:'f06', to:'f07' }, { id:'i8', from:'f07', to:'f08' }, { id:'i9', from:'f08', to:'f09' },
  { id:'j1', from:'g01', to:'g02' }, { id:'j2', from:'g02', to:'g03' }, { id:'j3', from:'g03', to:'g04' },
  { id:'j4', from:'g04', to:'g05' }, { id:'j5', from:'g05', to:'g06' },
  { id:'l1', from:'h01', to:'h02' }, { id:'l2', from:'h02', to:'h03' }, { id:'l3', from:'h03', to:'h04' },
  { id:'l4', from:'h04', to:'h05' },
  // k03 → k04는 "살아 있는 산출물 → 일정을 잃은 산출물" 연결이다. 유실 상태여도 flow는
  // 그대로 남는다(좌표를 안 건드리므로 선도 끊기지 않는다).
  { id:'m1', from:'k01', to:'k02' }, { id:'m2', from:'k02', to:'k03' }, { id:'m3', from:'k03', to:'k04' },
  { id:'m4', from:'k04', to:'k05' },

  /* workflow↔workflow 핸드오프 edge — recvWorkflow로 지정된 산출물이 받는 쪽 캔버스에서
   * 자기 own 산출물과 실제로 이어져 보이도록 한다. */
  { id:'x1', from:'g02', to:'d02', workflow:'wf1' },
  { id:'x2', from:'g03', to:'e03', workflow:'wf2' },
  { id:'x3', from:'g04', to:'e04', workflow:'wf2' },
  { id:'x4', from:'k02', to:'f02', workflow:'wf3' },
  { id:'x5', from:'k03', to:'f03', workflow:'wf3' },
  { id:'x6', from:'d02', to:'h02', workflow:'wf5' },
  { id:'x7', from:'d03', to:'h03', workflow:'wf5' },
];

interface MockHldItem { ver: string; file: string; at: string; cmt: string }
const MOCK_HLDS: { id:string; workflow:string; ver:string; date:string; by:MockUserKey; note:string; items:Record<string,MockHldItem> }[] = [
  { id:'hl1', workflow:'wf1', ver:'1.0', date:'2026-03-20', by:'u1', note:'First HLD finalized at AR pass', items:{
    d01:{ver:'1.0',file:'PLL_req_v1.0.docx',at:'2026-01-09 10:20',cmt:'Initial release'},
    d02:{ver:'1.0',file:'PLL_arch_v1.0.docx',at:'2026-02-18 16:05',cmt:'Initial release'},
    d03:{ver:'1.0',file:'PLL_AR_v1.0.docx',at:'2026-03-12 11:20',cmt:'Draft before review'},
  }},
  { id:'hl2', workflow:'wf1', ver:'2.0', date:'2026-06-12', by:'u1', note:'Circuit / simulation results reflected', items:{
    d01:{ver:'1.0',file:'PLL_req_v1.0.docx',at:'2026-01-09 10:20',cmt:'Initial release'},
    d02:{ver:'1.0',file:'PLL_arch_v1.0.docx',at:'2026-02-18 16:05',cmt:'Initial release'},
    d03:{ver:'2.0',file:'PLL_AR_v2.0.docx',at:'2026-03-18 14:00',cmt:'2nd release — architecture finalized'},
    d04:{ver:'1.0',file:'PLL_ckt_design_v1.0.docx',at:'2026-04-22 17:40',cmt:'1st release'},
    d05:{ver:'1.0',file:'PLL_loopfilter_v1.0.xlsx',at:'2026-04-21 13:10',cmt:'1st release'},
    d06:{ver:'1.0',file:'PLL_prelay_sim_v1.0.xlsx',at:'2026-06-03 10:40',cmt:'1st release'},
    d07:{ver:'1.0',file:'/vwp/cis_a7/pll_main/pex/r1',at:'2026-06-04 19:55',cmt:'RC extraction complete'},
  }},
  { id:'hl3', workflow:'wf2', ver:'1.0', date:'2026-03-25', by:'u1', note:'LDO first HLD', items:{
    e01:{ver:'1.0',file:'LDO_req_v1.0.docx',at:'2026-01-10 09:40',cmt:'Initial release'},
    e02:{ver:'1.0',file:'LDO_powertree_v1.0.docx',at:'2026-02-19 15:10',cmt:'Initial release'},
    e03:{ver:'1.0',file:'LDO_AR_v1.0.docx',at:'2026-03-17 11:35',cmt:'1st release'},
  }},
  { id:'hl4', workflow:'wf2', ver:'2.0', date:'2026-06-18', by:'u1', note:'Added regulation/startup results', items:{
    e01:{ver:'1.0',file:'LDO_req_v1.0.docx',at:'2026-01-10 09:40',cmt:'Initial release'},
    e02:{ver:'1.0',file:'LDO_powertree_v1.0.docx',at:'2026-02-19 15:10',cmt:'Initial release'},
    e03:{ver:'1.0',file:'LDO_AR_v1.0.docx',at:'2026-03-17 11:35',cmt:'1st release'},
    e04:{ver:'1.0',file:'LDO_reg_v1.0.xlsx',at:'2026-06-02 14:20',cmt:'1st release'},
    e05:{ver:'1.0',file:'/vwp/cis_a7/ldo_core/tran/startup',at:'2026-06-10 22:05',cmt:'Transient results saved'},
  }},
  { id:'hl5', workflow:'wf3', ver:'1.0', date:'2026-03-25', by:'u2', note:'ADC first HLD', items:{
    f01:{ver:'1.0',file:'ADC_req_v1.0.docx',at:'2026-01-08 13:50',cmt:'Initial release'},
    f02:{ver:'1.0',file:'ADC_arch_v1.0.docx',at:'2026-03-11 10:15',cmt:'Initial draft'},
  }},
  { id:'hl6', workflow:'wf3', ver:'2.0', date:'2026-06-20', by:'u2', note:'Ramp scheme finalized · layout freeze', items:{
    f01:{ver:'1.0',file:'ADC_req_v1.0.docx',at:'2026-01-08 13:50',cmt:'Initial release'},
    f02:{ver:'2.0',file:'ADC_arch_v2.0.docx',at:'2026-03-19 16:30',cmt:'2nd release — Ramp scheme finalized'},
    f03:{ver:'2.0',file:'ADC_inl_dnl_v2.0.xlsx',at:'2026-04-23 09:44',cmt:'2nd release'},
    f04:{ver:'1.0',file:'ADC_noise_v1.0.xlsx',at:'2026-06-01 17:25',cmt:'1st release'},
    f05:{ver:'1.0',file:'/vwp/cis_a7/adc_ramp/layout/r1',at:'2026-06-05 20:40',cmt:'Layout freeze'},
  }},
];

export async function seedDatabase(models: SeedModels): Promise<void> {
  const {
    ArtifactService: ArtifactServiceModel,
    Project: ProjectModel, Workflow: WorkflowModel,
    Deliverable: DeliverableModel, Memo: MemoModel,
    Edge: EdgeModel, HldRelease: HldReleaseModel,
  } = models;

  /* ── Hub 레지스트리 ──
   * Calypso는 여기 없다 - Hub가 "연동하는 외부 서비스"가 아니라 SIREN이 직접 만든
   * 산출물 관리 기능이다(ArtifactListPage/ArtifactDetailPage, calypsoClient.ts로
   * 직접 호출). Service Manage(§13.4)는 실제로 연동을 맺는 서비스 목록이라 여기 끼워
   * 넣지 않는다. 나머지 셋(SSM/SimHub/LayoutDB)은 siren-orchestration-map.html에서
   * 구조를 설명할 때 쓴 예시와 같은 메타데이터로, 대문이 실제 레지스트리를 반영한다는
   * 걸(§15.4) 원래 그림과 같은 구성으로 보여주기 위해 심는다 - 아직 어댑터가 없어
   * baseUrl은 비워둔다. 실서비스 등록은 Service Manage 화면(§13.4)에서 한다. */
  // insertMany를 쓴다 - 인메모리 페이크 모델(in-memory-driver.ts)의 create()는 단건만
  // 받는다. 실제 Mongoose에도 있는 메서드라 양쪽 모드에서 동일하게 동작한다.
  await ArtifactServiceModel.deleteMany({ isMock: true });
  await ArtifactServiceModel.insertMany([
    {
      key: 'ssm',
      name: 'SSM',
      contractVersion: '1.0',
      defaultTier: 'B',
      transport: 'shared-db',
      baseUrl: null,
      viewUrlTemplate: 'https://ssm.local/spec/{artifactId}',
      embedUploadUrlTemplate: null,
      isBuiltIn: false,
      enabled: true,
      isMock: true,
    },
    {
      key: 'simhub',
      name: 'SimHub',
      contractVersion: '1.0',
      defaultTier: 'A',
      transport: 'http',
      baseUrl: null,
      viewUrlTemplate: 'https://simhub.local/run/{artifactId}',
      embedUploadUrlTemplate: null,
      isBuiltIn: false,
      enabled: true,
      isMock: true,
    },
    {
      key: 'layoutdb',
      name: 'LayoutDB',
      contractVersion: '1.0',
      defaultTier: 'B',
      transport: 'shared-db',
      baseUrl: null,
      viewUrlTemplate: 'https://layoutdb.local/cell/{artifactId}',
      embedUploadUrlTemplate: null,
      isBuiltIn: false,
      enabled: true,
      isMock: true,
    },
  ]);

  // 목업 문서만 지운다 (isMock:true). 실제 DB에 붙은 상태로도 안전하게 재실행할 수 있어야
  // 하므로 deleteMany({})는 절대 쓰지 않는다 - 사용자가 만든 데이터를 날려버린다.
  await Promise.all([
    ProjectModel.deleteMany({ isMock: true }), WorkflowModel.deleteMany({ isMock: true }),
    DeliverableModel.deleteMany({ isMock: true }), MemoModel.deleteMany({ isMock: true }),
    EdgeModel.deleteMany({ isMock: true }), HldReleaseModel.deleteMany({ isMock: true }),
  ]);

  const U = KNOX;

  /* ── Projects ──
   * milestones: 과제 공통 일정. workflow를 새로 만들면 이 목록이 복사되지만, 아래 목업
   * workflow들은 일부러 저마다 다른 phase를 들고 시작한다("일정은 workflow마다 다르다"를
   * 화면에서 바로 확인할 수 있어야 하므로).
   * members: 과제 단위 부서별 팀원 로스터 (Project Info 페이지) — workflow owners/viewGrants
   * (접근 권한)와는 별개의 정보성 명단이라 여기 departments는 실제 소속과 다를 수 있다.
   * departments 필드는 일부러 세팅하지 않는다 - ProjectsService.ensureDepartments가 처음
   * 조회되는 시점에 기본 6개로 채우는 경로를 목업에서도 그대로 타게 하기 위해서다.
   * u1/u2는 일부러 두 부서에 걸쳐 있다 - 한 멤버가 여러 부서(팀)에 속할 수 있음을
   * 시연한다. */
  const p1 = await ProjectModel.create({
    code: 'CIS-A7', name: '50MP Mobile CIS',
    milestones: MILESTONES, status: 'ACTIVE', isMock: true,
    // 일부러 u7/u8은 비워둔다 - "부서별 멤버 추가" UI를 실제로 시연/검증할 후보가 남아있어야
    // 하고, 빈 상태(empty state) 렌더링도 함께 보여주기 때문.
    members: [
      { knoxId: U.u1, departments: ['Analog', 'Digital'], addedAt: new Date('2026-01-05') },
      { knoxId: U.u2, departments: ['Analog', 'Digital'], addedAt: new Date('2026-01-05') },
      { knoxId: U.u6, departments: ['Analog'], addedAt: new Date('2026-01-06') },
      { knoxId: U.u3, departments: ['Digital'], addedAt: new Date('2026-01-07') },
      { knoxId: U.u4, departments: ['Solution'], addedAt: new Date('2026-01-08') },
      { knoxId: U.u5, departments: ['PTE'], addedAt: new Date('2026-01-08') },
    ],
  });
  const p2 = await ProjectModel.create({
    code: 'CIS-B3', name: '8MP Automotive CIS',
    milestones: MILESTONES, status: 'ACTIVE', isMock: true,
  });

  /* ── Workflows ── */
  const WFID: Record<string, Types.ObjectId> = {};
  for (const w of MOCK_WORKFLOWS) {
    const doc = await WorkflowModel.create({
      projectId: p1._id,
      name: w.name,
      domain: w.domain,
      description: w.description,
      color: w.color,
      phases: w.phases,
      owners: w.owners.map((k) => U[k]),
      viewGrants: w.viewGrants.map((g) => ({
        knoxId: U[g.user], department: g.department, grantedAt: new Date(),
      })),
      isMock: true,
    });
    WFID[w.key] = doc._id;
  }

  /* ── Deliverables ── (series 참조를 위해 id를 먼저 확정) */
  const DID: Record<string, Types.ObjectId> = {};
  MOCK_ITEMS.forEach((m) => (DID[m.id] = new Types.ObjectId()));

  /**
   * 목업을 이름으로 3개 서비스에 나눈다 - 대문(§15.4)이 실제 레지스트리를 반영할 때,
   * 슬랩 하나만 떠 있는 게 아니라 여러 서비스가 각자의 버전 이력을 갖고 보이게 하기
   * 위해서다. 위 레지스트리 시드의 3개 키와 정확히 대응한다. Calypso는 대상이 아니다 -
   * Hub가 연동하는 서비스가 아니므로 목업 산출물의 serviceKey로도 배정하지 않는다.
   */
  function inferServiceKey(name: string): 'ssm' | 'simhub' | 'layoutdb' {
    const n = name.toLowerCase();
    if (n.includes('simulation')) return 'simhub';
    if (n.includes('layout') || n.includes('netlist') || n.includes('pex')) return 'layoutdb';
    return 'ssm';
  }
  /** 각 서비스의 viewUrlTemplate과 같은 경로 세그먼트 - 레지스트리 시드와 짝을 맞춘다. */
  const SERVICE_PATH: Record<string, string> = {
    ssm: 'spec', simhub: 'run', layoutdb: 'cell',
  };
  const SERVICE_TIER: Record<string, 'A' | 'B'> = {
    ssm: 'B', simhub: 'A', layoutdb: 'B',
  };

  for (const m of MOCK_ITEMS) {
    const layout = seedXY(LANE_INDEX[m.phase] ?? 0, m.row, NW, NH);
    const serviceKey = inferServiceKey(m.name);
    const tier = SERVICE_TIER[serviceKey];
    await DeliverableModel.create({
      _id: DID[m.id],
      projectId: p1._id,
      workflowId: WFID[m.workflow],
      phaseId: m.phase,
      name: m.name,
      serviceKey,
      externalArtifactId: `mock-${m.id}`,
      network: m.net,
      series: m.series ? DID[m.series] : null,
      seriesIdx: m.seriesIdx ?? 1,
      seriesTotal: m.seriesTotal ?? 1,
      recvDept: m.recvDept ?? null,
      recvContact: m.recvContact ? U[m.recvContact] : null,
      recvWorkflowId: m.recvWorkflow ? WFID[m.recvWorkflow] : null,
      sourceDept: m.sourceDept ?? null,
      layout,
      // 목업 버전은 그 산출물이 배정된 서비스가 소유한 것으로 만든다 - 실물 파일은
      // SIREN에 없고 versionRef/viewUrl 참조만 들고 있는 게 새 구조다(Hub 설계서 §1.2).
      versions: m.versions.map(([major, minor, kind, by, when, note, file]) => ({
        tier,
        versionLabel: `${major}.${minor}`,
        isReleased: kind === 'major',
        versionRef: `${serviceKey}:mock-${m.id}@${major}.${minor}`,
        giverKnoxId: U[by],
        giverDept: null,
        sourceRefs: [],
        viewUrl: m.net === 'OA' ? `https://${serviceKey}.local/${SERVICE_PATH[serviceKey]}/mock-${m.id}` : null,
        hpcPath: m.net === 'HPC' ? file : null,
        note,
        assertedBy: null,
        assertedAt: null,
        observedAt: at(when),
        createdAt: at(when),
      })),
      createdBy: U[m.versions[0]?.[3] ?? 'u1'],
      isMock: true,
    });
  }

  /* ── Memos ── */
  for (const n of MOCK_NOTES) {
    await MemoModel.create({
      workflowId: WFID[n.workflow],
      phaseId: n.phase,
      text: n.text,
      layout: seedXY(LANE_INDEX[n.phase] ?? 0, n.row, MW, MH),
      createdBy: U.u1,
      isMock: true,
    });
  }

  /* ── Edges ── */
  await EdgeModel.insertMany(
    MOCK_EDGES.filter((e) => DID[e.from] && DID[e.to]).map((e) => {
      const wfKey = e.workflow ?? MOCK_ITEMS.find((m) => m.id === e.from)!.workflow;
      return {
        workflowId: WFID[wfKey],
        fromId: DID[e.from],
        toId: DID[e.to],
        bidirectional: false, // 목업과 동일하게 역방향 쌍으로 양방향을 표현한다
        auto: e.auto ?? false,
        isMock: true,
      };
    }),
  );

  /* ── HLD Releases ── */
  for (const h of MOCK_HLDS) {
    const items: Record<string, unknown> = {};
    for (const [mockId, rec] of Object.entries(h.items)) {
      if (!DID[mockId]) continue;
      items[DID[mockId].toString()] = {
        version: rec.ver,
        file: rec.file,
        at: rec.at,
        comment: rec.cmt,
      };
    }
    await HldReleaseModel.create({
      workflowId: WFID[h.workflow],
      version: h.ver,
      date: h.date,
      releasedBy: U[h.by],
      note: h.note,
      items,
      isMock: true,
    });
  }

  void p2;

  // eslint-disable-next-line no-console
  console.log(
    `Seed complete: projects=2, workflows=${MOCK_WORKFLOWS.length}, ` +
      `deliverables=${MOCK_ITEMS.length}, memos=${MOCK_NOTES.length}, edges=${MOCK_EDGES.length}, hlds=${MOCK_HLDS.length}`,
  );
}
