/**
 * ACRO 목업 데이터 시드 로직. 이미 resolve된 Model 묶음을 받아서 채워 넣기만 한다 -
 * 연결(실제 DB든 인메모리든)은 전적으로 호출자 책임이다.
 *
 * ★ 이 파일의 데이터는 UI 정본인 `analog-dashboard-v15.html` 목업의
 *   USERS / PROJS / COM_PH / IPS / ITEMS / NOTES / EDGES / HLDS 와 1:1로 일치한다.
 *   좌표(x,y)도 목업 seedXY()와 동일한 공식으로 계산한다.
 */
import { Model, Types } from 'mongoose';
import { UserDocument } from '../users/schemas/user.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { IpDocument } from '../ips/schemas/ip.schema';
import { DeliverableDocument } from '../deliverables/schemas/deliverable.schema';
import { MemoDocument } from '../memos/schemas/memo.schema';
import { EdgeDocument } from '../edges/schemas/edge.schema';
import { HldReleaseDocument } from '../hld/schemas/hld-release.schema';

export interface SeedModels {
  User: Model<UserDocument>;
  Project: Model<ProjectDocument>;
  Ip: Model<IpDocument>;
  Deliverable: Model<DeliverableDocument>;
  Memo: Model<MemoDocument>;
  Edge: Model<EdgeDocument>;
  HldRelease: Model<HldReleaseDocument>;
}

/* ── 목업 CONSTANTS (analog-dashboard-v15.html) ── */
const GRID = 10;
const ROW_H = 150;
const TOP_PAD = 40;
const NW = 160;
const NH = 82;
const MW = 160;
const MH = 68;
const LANE_PAD = 46;
const DEFAULT_PW = Math.round((180 + LANE_PAD * 2) * 2 * 0.7);
const snp = (v: number) => Math.round(v / GRID) * GRID;

/* ── 목업 COM_PH ── */
const COM_PH = [
  { id: 'KO', key: 'KO', label: 'Kick-off', start: '2026-01-05', end: '2026-02-16' },
  { id: 'ML1', key: 'ML1', label: 'Milestone 1', start: '2026-02-16', end: '2026-03-16' },
  { id: 'AR', key: 'AR', label: 'Architecture Review', start: '2026-03-16', end: '2026-04-13' },
  { id: 'ML2', key: 'ML2', label: 'Milestone 2', start: '2026-04-13', end: '2026-05-25' },
  { id: 'ML3', key: 'ML3', label: 'Milestone 3', start: '2026-05-25', end: '2026-06-22' },
  { id: 'MDR', key: 'MDR', label: 'Mid Design Review', start: '2026-06-22', end: '2026-07-20' },
  { id: 'ML4', key: 'ML4', label: 'Milestone 4', start: '2026-07-20', end: '2026-08-31' },
  { id: 'FDR', key: 'FDR', label: 'Final Design Review', start: '2026-08-31', end: '2026-09-21' },
  { id: 'MTO', key: 'MTO', label: 'Mask Tape-out', start: '2026-09-21', end: '2026-10-12' },
  { id: 'FABOUT', key: 'Fab out', label: 'Fab Out', start: '2026-10-12', end: '2026-12-21' },
];
const PHASE_INDEX: Record<string, number> = Object.fromEntries(COM_PH.map((p, i) => [p.id, i]));

/** 목업 seedXY(): x = snp(laneX + max(6,(laneW-w)/2)), y = TOP_PAD + row*ROW_H */
function seedXY(phaseId: string, row: number, w: number, h: number) {
  const laneX = (PHASE_INDEX[phaseId] ?? 0) * DEFAULT_PW;
  return {
    x: snp(laneX + Math.max(6, (DEFAULT_PW - w) / 2)),
    y: TOP_PAD + row * ROW_H,
    w,
    h,
  };
}

/** 목업의 "YYYY-MM-DD HH:mm" 문자열을 로컬 Date로 (FE에서 같은 포맷으로 되돌린다). */
const at = (s: string) => new Date(s.replace(' ', 'T') + ':00');

type MockUserKey = 'u1' | 'u2' | 'u3' | 'u4' | 'u5' | 'u6' | 'u7' | 'u8';

/* ── 목업 USERS ── */
const MOCK_USERS: { key: MockUserKey; empNo: string; name: string; dept: string; color: string }[] = [
  { key: 'u1', empNo: '20180114', name: '김선우', dept: 'analog', color: '#0c9a83' },
  { key: 'u2', empNo: '20190233', name: '박지훈', dept: 'analog', color: '#5849cf' },
  { key: 'u3', empNo: '20200591', name: '이수민', dept: 'digital', color: '#2563c9' },
  { key: 'u4', empNo: '20170842', name: '정하윤', dept: 'solution', color: '#ac6f08' },
  { key: 'u5', empNo: '20210377', name: '최다인', dept: 'pte', color: '#c8352c' },
  { key: 'u6', empNo: '20160925', name: '오세훈', dept: 'analog', color: '#3aa66b' },
  { key: 'u7', empNo: '20220148', name: '한지연', dept: 'aps', color: '#b3521e' },
  { key: 'u8', empNo: '20150663', name: '류다현', dept: 'pipd', color: '#7a4fbf' },
];

/* ── 목업 ITEMS (versions: [major,minor,kind,by,at,note,file]) ── */
type MockVer = [number, number, 'major' | 'minor', MockUserKey, string, string, string];
interface MockItem {
  id: string;
  ip: string;
  phase: string;
  row: number;
  name: string;
  type: string;
  net: 'OA' | 'HPC';
  recvDept?: string | null;
  recvContact?: MockUserKey | null;
  series?: string;
  seriesIdx?: number;
  seriesTotal?: number;
  versions: MockVer[];
}

const MOCK_ITEMS: MockItem[] = [
  { id:'d01', ip:'ip1', phase:'KO', row:0, name:'PLL 요구사양 접수서', type:'word', net:'OA', recvDept:'digital', recvContact:'u3',
    versions:[[1,0,'major','u1','2026-01-09 10:20','초판','PLL_req_v1.0.docx']] },
  { id:'d02', ip:'ip1', phase:'ML1', row:0, name:'PLL 아키텍처 검토서', type:'word', net:'OA',
    versions:[[1,0,'major','u1','2026-02-18 16:05','초판','PLL_arch_v1.0.docx']] },
  { id:'d03', ip:'ip1', phase:'AR', row:0, name:'AR 리뷰 패키지', type:'word', net:'OA', recvDept:'digital', recvContact:'u3',
    versions:[
      [2,1,'minor','u1','2026-04-02 09:30','액션아이템 추가','PLL_AR_v2.1.docx'],
      [2,0,'major','u1','2026-03-18 14:00','2차 릴리스','PLL_AR_v2.0.docx'],
      [1,0,'major','u1','2026-03-12 11:20','초판','PLL_AR_v1.0.docx'],
    ] },
  { id:'d04', ip:'ip1', phase:'ML2', row:0, name:'회로 설계 문서', type:'word', net:'OA',
    versions:[[1,0,'major','u1','2026-04-22 17:40','1차 릴리스','PLL_ckt_design_v1.0.docx']] },
  { id:'d05', ip:'ip1', phase:'ML2', row:1, name:'Loop Filter 계산서', type:'excel', net:'OA',
    versions:[[1,0,'major','u1','2026-04-21 13:10','1차','PLL_loopfilter_v1.0.xlsx']] },
  { id:'d06', ip:'ip1', phase:'ML3', row:0, name:'Pre-layout 시뮬 결과', type:'excel', net:'OA', recvDept:'pte', recvContact:'u5',
    versions:[
      [1,2,'minor','u1','2026-06-08 21:15','SS/FF corner','PLL_prelay_sim_v1.2.xlsx'],
      [1,0,'major','u1','2026-06-03 10:40','1차','PLL_prelay_sim_v1.0.xlsx'],
    ] },
  { id:'d07', ip:'ip1', phase:'ML3', row:1, name:'Netlist / PEX', type:'path', net:'HPC',
    versions:[[1,0,'major','u1','2026-06-04 19:55','RC 추출','/vwp/cis_a7/pll_main/pex/r1']] },
  { id:'d08', ip:'ip1', phase:'MDR', row:0, name:'설계 리뷰 패키지', type:'word', net:'OA',
    series:'d08', seriesIdx:1, seriesTotal:3, recvDept:'digital', recvContact:'u3',
    versions:[[1,0,'major','u1','2026-07-02 14:10','MDR 시점 릴리스','PLL_review_v1.0.docx']] },
  { id:'d08_ML4', ip:'ip1', phase:'ML4', row:1, name:'설계 리뷰 패키지', type:'word', net:'OA',
    series:'d08', seriesIdx:2, seriesTotal:3, recvDept:'digital', recvContact:'u3',
    versions:[[1,2,'minor','u1','2026-08-06 18:22','ML4 지적사항 반영중','PLL_review_v1.2.docx']] },
  { id:'d08_FDR', ip:'ip1', phase:'FDR', row:1, name:'설계 리뷰 패키지', type:'word', net:'OA',
    series:'d08', seriesIdx:3, seriesTotal:3, recvDept:'digital', recvContact:'u3', versions:[] },
  { id:'d09', ip:'ip1', phase:'ML4', row:0, name:'Post-layout 시뮬 결과', type:'excel', net:'OA', versions:[] },
  { id:'d10', ip:'ip1', phase:'ML4', row:1, name:'Layout DB', type:'path', net:'HPC', versions:[] },
  { id:'d11', ip:'ip1', phase:'FDR', row:0, name:'FDR 체크리스트', type:'word', net:'OA', recvDept:'digital', recvContact:'u3', versions:[] },
  { id:'d12', ip:'ip1', phase:'MTO', row:0, name:'MTO 서명 시트', type:'excel', net:'OA', recvDept:'pte', recvContact:'u5', versions:[] },
  { id:'d13', ip:'ip1', phase:'FABOUT', row:0, name:'Fab out 특성 평가 계획', type:'word', net:'OA', versions:[] },

  { id:'e01', ip:'ip2', phase:'KO', row:0, name:'LDO 요구사양 접수서', type:'word', net:'OA', recvDept:'solution', recvContact:'u4',
    versions:[[1,0,'major','u1','2026-01-10 09:40','초판','LDO_req_v1.0.docx']] },
  { id:'e02', ip:'ip2', phase:'ML1', row:0, name:'전원 트리 검토서', type:'word', net:'OA',
    versions:[[1,0,'major','u1','2026-02-19 15:10','초판','LDO_powertree_v1.0.docx']] },
  { id:'e03', ip:'ip2', phase:'AR', row:0, name:'AR 리뷰 패키지', type:'word', net:'OA',
    versions:[[1,0,'major','u1','2026-03-17 11:35','1차','LDO_AR_v1.0.docx']] },
  { id:'e04', ip:'ip2', phase:'ML3', row:0, name:'Load/Line Regulation 시뮬', type:'excel', net:'OA',
    versions:[[1,2,'minor','u1','2026-08-09 17:31','부하 스텝 추가','LDO_reg_v1.2.xlsx']] },
  { id:'e05', ip:'ip2', phase:'ML3', row:1, name:'Startup 시퀀스 파형', type:'path', net:'HPC',
    versions:[[1,0,'major','u1','2026-06-10 22:05','트랜지언트','/vwp/cis_a7/ldo_core/tran/startup']] },
  { id:'e06', ip:'ip2', phase:'MDR', row:0, name:'MDR 리뷰 패키지', type:'word', net:'OA', versions:[] },
  { id:'e07', ip:'ip2', phase:'ML4', row:0, name:'Post-layout 재검증', type:'excel', net:'OA', versions:[] },
  { id:'e08', ip:'ip2', phase:'FDR', row:0, name:'신뢰성 검토서', type:'word', net:'OA', recvDept:'solution', recvContact:'u4', versions:[] },
  { id:'e09', ip:'ip2', phase:'FABOUT', row:0, name:'양산 이관 패키지', type:'word', net:'OA', recvDept:'solution', recvContact:'u4', versions:[] },

  { id:'f01', ip:'ip3', phase:'KO', row:0, name:'ADC 요구사양 접수서', type:'word', net:'OA', recvDept:'pte', recvContact:'u5',
    versions:[[1,0,'major','u2','2026-01-08 13:50','초판','ADC_req_v1.0.docx']] },
  { id:'f02', ip:'ip3', phase:'AR', row:0, name:'아키텍처 리뷰 자료', type:'word', net:'OA',
    versions:[[2,0,'major','u2','2026-03-19 16:30','Ramp 확정','ADC_arch_v2.0.docx']] },
  { id:'f03', ip:'ip3', phase:'ML2', row:0, name:'INL/DNL 시뮬 결과', type:'excel', net:'OA',
    versions:[[2,0,'major','u2','2026-04-23 09:44','2차','ADC_inl_dnl_v2.0.xlsx']] },
  { id:'f04', ip:'ip3', phase:'ML3', row:0, name:'Noise 분석 리포트', type:'excel', net:'OA',
    versions:[[1,1,'minor','u2','2026-08-10 11:02','kTC noise','ADC_noise_v1.1.xlsx']] },
  { id:'f05', ip:'ip3', phase:'ML3', row:1, name:'Column Layout DB', type:'path', net:'HPC',
    versions:[[1,0,'major','u2','2026-06-05 20:40','레이아웃 프리즈','/vwp/cis_a7/adc_ramp/layout/r1']] },
  { id:'f06', ip:'ip3', phase:'MDR', row:0, name:'MDR 리뷰 패키지', type:'word', net:'OA', versions:[] },
  { id:'f07', ip:'ip3', phase:'ML4', row:0, name:'Post-layout 재검증', type:'excel', net:'OA', versions:[] },
  { id:'f08', ip:'ip3', phase:'FDR', row:0, name:'FDR 체크리스트', type:'word', net:'OA', recvDept:'pte', recvContact:'u5', versions:[] },
  { id:'f09', ip:'ip3', phase:'MTO', row:0, name:'MTO 서명 시트', type:'excel', net:'OA', versions:[] },
];

const MOCK_NOTES = [
  { id:'n1', ip:'ip1', phase:'ML2', row:2, text:'디지털팀 CDC 검토 회신 후 Post-layout 착수' },
  { id:'n2', ip:'ip1', phase:'ML4', row:2, text:'검증팀 리뷰 결과를 FDR 체크리스트에 반영' },
  { id:'n3', ip:'ip1', phase:'FABOUT', row:1, text:'→ 제품기술팀·양산기술팀으로 최종 전달' },
  { id:'n4', ip:'ip2', phase:'ML4', row:1, text:'MP 이관 전 신뢰성 항목(HTOL) 확인 필요' },
  { id:'n5', ip:'ip3', phase:'ML3', row:2, text:'레이아웃 DB는 HPC망에만 존재 — 경로만 전달' },
];

/** 목업 EDGES. 역방향 쌍(g7/g7r)이 곧 양방향 표현이므로 그대로 옮긴다. */
const MOCK_EDGES: { id: string; from: string; to: string; auto?: boolean }[] = [
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
];

interface MockHldItem { ver: string; file: string; at: string; cmt: string }
const MOCK_HLDS: { id:string; ip:string; ver:string; date:string; by:MockUserKey; note:string; items:Record<string,MockHldItem> }[] = [
  { id:'hl1', ip:'ip1', ver:'1.0', date:'2026-03-20', by:'u1', note:'AR 통과 시점 1차 HLD 확정', items:{
    d01:{ver:'1.0',file:'PLL_req_v1.0.docx',at:'2026-01-09 10:20',cmt:'초판 릴리스'},
    d02:{ver:'1.0',file:'PLL_arch_v1.0.docx',at:'2026-02-18 16:05',cmt:'초판 릴리스'},
    d03:{ver:'1.0',file:'PLL_AR_v1.0.docx',at:'2026-03-12 11:20',cmt:'리뷰 전 초판'},
  }},
  { id:'hl2', ip:'ip1', ver:'2.0', date:'2026-06-12', by:'u1', note:'ML3 완료 · 회로/시뮬 결과 반영', items:{
    d01:{ver:'1.0',file:'PLL_req_v1.0.docx',at:'2026-01-09 10:20',cmt:'초판 릴리스'},
    d02:{ver:'1.0',file:'PLL_arch_v1.0.docx',at:'2026-02-18 16:05',cmt:'초판 릴리스'},
    d03:{ver:'2.0',file:'PLL_AR_v2.0.docx',at:'2026-03-18 14:00',cmt:'2차 릴리스 — 아키텍처 확정'},
    d04:{ver:'1.0',file:'PLL_ckt_design_v1.0.docx',at:'2026-04-22 17:40',cmt:'1차 릴리스'},
    d05:{ver:'1.0',file:'PLL_loopfilter_v1.0.xlsx',at:'2026-04-21 13:10',cmt:'1차 릴리스'},
    d06:{ver:'1.0',file:'PLL_prelay_sim_v1.0.xlsx',at:'2026-06-03 10:40',cmt:'1차 릴리스'},
    d07:{ver:'1.0',file:'/vwp/cis_a7/pll_main/pex/r1',at:'2026-06-04 19:55',cmt:'RC 추출 완료'},
  }},
  { id:'hl3', ip:'ip2', ver:'1.0', date:'2026-03-25', by:'u1', note:'LDO 1차 HLD', items:{
    e01:{ver:'1.0',file:'LDO_req_v1.0.docx',at:'2026-01-10 09:40',cmt:'초판 릴리스'},
    e02:{ver:'1.0',file:'LDO_powertree_v1.0.docx',at:'2026-02-19 15:10',cmt:'초판 릴리스'},
    e03:{ver:'1.0',file:'LDO_AR_v1.0.docx',at:'2026-03-17 11:35',cmt:'1차 릴리스'},
  }},
  { id:'hl4', ip:'ip2', ver:'2.0', date:'2026-06-18', by:'u1', note:'Regulation·Startup 결과 추가', items:{
    e01:{ver:'1.0',file:'LDO_req_v1.0.docx',at:'2026-01-10 09:40',cmt:'초판 릴리스'},
    e02:{ver:'1.0',file:'LDO_powertree_v1.0.docx',at:'2026-02-19 15:10',cmt:'초판 릴리스'},
    e03:{ver:'1.0',file:'LDO_AR_v1.0.docx',at:'2026-03-17 11:35',cmt:'1차 릴리스'},
    e04:{ver:'1.0',file:'LDO_reg_v1.0.xlsx',at:'2026-06-02 14:20',cmt:'1차 릴리스'},
    e05:{ver:'1.0',file:'/vwp/cis_a7/ldo_core/tran/startup',at:'2026-06-10 22:05',cmt:'트랜지언트 결과 저장'},
  }},
  { id:'hl5', ip:'ip3', ver:'1.0', date:'2026-03-25', by:'u2', note:'ADC 1차 HLD', items:{
    f01:{ver:'1.0',file:'ADC_req_v1.0.docx',at:'2026-01-08 13:50',cmt:'초판 릴리스'},
    f02:{ver:'1.0',file:'ADC_arch_v1.0.docx',at:'2026-03-11 10:15',cmt:'초판'},
  }},
  { id:'hl6', ip:'ip3', ver:'2.0', date:'2026-06-20', by:'u2', note:'Ramp 방식 확정 · 레이아웃 프리즈', items:{
    f01:{ver:'1.0',file:'ADC_req_v1.0.docx',at:'2026-01-08 13:50',cmt:'초판 릴리스'},
    f02:{ver:'2.0',file:'ADC_arch_v2.0.docx',at:'2026-03-19 16:30',cmt:'2차 릴리스 — Ramp 방식 확정'},
    f03:{ver:'2.0',file:'ADC_inl_dnl_v2.0.xlsx',at:'2026-04-23 09:44',cmt:'2차 릴리스'},
    f04:{ver:'1.0',file:'ADC_noise_v1.0.xlsx',at:'2026-06-01 17:25',cmt:'1차 릴리스'},
    f05:{ver:'1.0',file:'/vwp/cis_a7/adc_ramp/layout/r1',at:'2026-06-05 20:40',cmt:'레이아웃 프리즈'},
  }},
];

export async function seedDatabase(models: SeedModels): Promise<void> {
  const {
    User: UserModel, Project: ProjectModel, Ip: IpModel,
    Deliverable: DeliverableModel, Memo: MemoModel,
    Edge: EdgeModel, HldRelease: HldReleaseModel,
  } = models;

  await Promise.all([
    UserModel.deleteMany({}), ProjectModel.deleteMany({}), IpModel.deleteMany({}),
    DeliverableModel.deleteMany({}), MemoModel.deleteMany({}),
    EdgeModel.deleteMany({}), HldReleaseModel.deleteMany({}),
  ]);

  /* ── Users ── */
  const userDocs = await UserModel.insertMany(
    MOCK_USERS.map((u) => ({
      empNo: u.empNo,
      name: u.name,
      email: `${u.key}@example.com`,
      department: u.dept,
      color: u.color,
      isActive: true,
    })),
  );
  const U: Record<string, Types.ObjectId> = {};
  MOCK_USERS.forEach((u, i) => (U[u.key] = userDocs[i]._id));

  /* ── Projects (Phase는 두 과제 공통) ── */
  const p1 = await ProjectModel.create({
    code: 'CIS-A7', name: '50MP 모바일 CIS', domain: 'ANALOG', phases: COM_PH, status: 'ACTIVE',
  });
  const p2 = await ProjectModel.create({
    code: 'CIS-B3', name: '8MP 오토모티브 CIS', domain: 'ANALOG', phases: COM_PH, status: 'ACTIVE',
  });

  /* ── IPs ── */
  const ip1 = await IpModel.create({
    projectId: p1._id, name: 'PLL_MAIN', description: '메인 클럭 생성 PLL',
    owners: [U.u1],
    viewGrants: [
      { userId: U.u3, department: 'digital', grantedAt: new Date() },
      { userId: U.u5, department: 'pte', grantedAt: new Date() },
    ],
    color: '#0c9a83',
  });
  const ip2 = await IpModel.create({
    projectId: p1._id, name: 'LDO_CORE', description: '코어 전원 레귤레이터',
    owners: [U.u1],
    viewGrants: [{ userId: U.u4, department: 'solution', grantedAt: new Date() }],
    color: '#5849cf',
  });
  const ip3 = await IpModel.create({
    projectId: p1._id, name: 'ADC_RAMP', description: 'Ramp 방식 컬럼 ADC',
    owners: [U.u2],
    viewGrants: [
      { userId: U.u5, department: 'pte', grantedAt: new Date() },
      { userId: U.u3, department: 'digital', grantedAt: new Date() },
    ],
    color: '#2563c9',
  });
  const IPID: Record<string, Types.ObjectId> = { ip1: ip1._id, ip2: ip2._id, ip3: ip3._id };

  /* ── Deliverables ── (series 참조를 위해 id를 먼저 확정) */
  const DID: Record<string, Types.ObjectId> = {};
  MOCK_ITEMS.forEach((m) => (DID[m.id] = new Types.ObjectId()));

  for (const m of MOCK_ITEMS) {
    const layout = seedXY(m.phase, m.row, NW, NH);
    await DeliverableModel.create({
      _id: DID[m.id],
      projectId: p1._id,
      ipId: IPID[m.ip],
      phaseKey: m.phase,
      name: m.name,
      docType: m.type,
      network: m.net,
      series: m.series ? DID[m.series] : null,
      seriesIdx: m.seriesIdx ?? 1,
      seriesTotal: m.seriesTotal ?? 1,
      recvDept: m.recvDept ?? null,
      recvContact: m.recvContact ? U[m.recvContact] : null,
      layout,
      versions: m.versions.map(([major, minor, kind, by, when, note, file]) => ({
        major, minor, kind,
        fileName: file,
        storageKey: m.net === 'OA' ? `mock/${file}` : null,
        hpcPath: m.net === 'HPC' ? file : null,
        note,
        createdBy: U[by],
        createdAt: at(when),
      })),
      createdBy: U[m.versions[0]?.[3] ?? 'u1'],
    });
  }

  /* ── Memos ── */
  for (const n of MOCK_NOTES) {
    await MemoModel.create({
      ipId: IPID[n.ip],
      phaseKey: n.phase,
      text: n.text,
      layout: seedXY(n.phase, n.row, MW, MH),
      createdBy: U.u1,
    });
  }

  /* ── Edges ── */
  await EdgeModel.insertMany(
    MOCK_EDGES.filter((e) => DID[e.from] && DID[e.to]).map((e) => {
      const ipKey = MOCK_ITEMS.find((m) => m.id === e.from)!.ip;
      return {
        ipId: IPID[ipKey],
        fromId: DID[e.from],
        toId: DID[e.to],
        bidirectional: false, // 목업과 동일하게 역방향 쌍으로 양방향을 표현한다
        auto: e.auto ?? false,
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
      ipId: IPID[h.ip],
      version: h.ver,
      date: h.date,
      releasedBy: U[h.by],
      note: h.note,
      items,
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seed 완료(목업 v15 기준): users=${MOCK_USERS.length}, projects=2, ips=3, ` +
      `deliverables=${MOCK_ITEMS.length}, memos=${MOCK_NOTES.length}, edges=${MOCK_EDGES.length}, hlds=${MOCK_HLDS.length}`,
  );
}
