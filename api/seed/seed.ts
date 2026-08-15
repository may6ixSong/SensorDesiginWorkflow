/**
 * ARBOR 개발용 목업 데이터 시드 스크립트.
 * 실행: npm run seed  (사전에 .env의 MONGODB_URI가 설정되어 있어야 함)
 *
 * 생성 데이터: 과제 2개, IP 3개, 산출물 약 30개(+series 인스턴스 포함), HLD 스냅샷 2건.
 * 설계서(docs/arbor-design-v2.md) 4장 데이터 모델, 8.2-6(Phase는 seed로 고정) 기준.
 */
import mongoose, { Types } from 'mongoose';
import { UserSchema } from '../src/users/schemas/user.schema';
import { ProjectSchema } from '../src/projects/schemas/project.schema';
import { IpSchema } from '../src/ips/schemas/ip.schema';
import { DeliverableSchema, DeliverableVersion } from '../src/deliverables/schemas/deliverable.schema';
import { MemoSchema } from '../src/memos/schemas/memo.schema';
import { EdgeSchema } from '../src/edges/schemas/edge.schema';
import { HldReleaseSchema } from '../src/hld/schemas/hld-release.schema';

const UserModel = mongoose.model('User', UserSchema);
const ProjectModel = mongoose.model('Project', ProjectSchema);
const IpModel = mongoose.model('Ip', IpSchema);
const DeliverableModel = mongoose.model('Deliverable', DeliverableSchema);
const MemoModel = mongoose.model('Memo', MemoSchema);
const EdgeModel = mongoose.model('Edge', EdgeSchema);
const HldReleaseModel = mongoose.model('HldRelease', HldReleaseSchema);

const PHASE_TEMPLATE = [
  { key: 'KO', label: 'Kick-off', order: 0 },
  { key: 'ML1', label: 'Model 1', order: 1 },
  { key: 'AR', label: 'Architecture Review', order: 2 },
  { key: 'ML2', label: 'Model 2', order: 3 },
  { key: 'ML3', label: 'Model 3', order: 4 },
  { key: 'MDR', label: 'Mid Design Review', order: 5 },
  { key: 'ML4', label: 'Model 4', order: 6 },
  { key: 'FDR', label: 'Final Design Review', order: 7 },
  { key: 'MTO', label: 'Mask Tape Out', order: 8 },
  { key: 'Fab out', label: 'Fab Out', order: 9 },
];

function buildPhases(anchorStart: string) {
  // MDR 구간에 오늘(2026-08-15)이 포함되도록 CIS-A7 기준 날짜로 고정.
  const ranges: [string, string][] = [
    ['2026-01-05', '2026-02-16'],
    ['2026-02-16', '2026-03-30'],
    ['2026-03-30', '2026-04-27'],
    ['2026-04-27', '2026-06-08'],
    ['2026-06-08', '2026-07-20'],
    ['2026-07-20', '2026-08-24'],
    ['2026-08-24', '2026-10-05'],
    ['2026-10-05', '2026-10-19'],
    ['2026-10-19', '2026-11-02'],
    ['2026-11-02', '2026-11-16'],
  ];
  return PHASE_TEMPLATE.map((p, i) => ({
    key: p.key,
    label: p.label,
    order: p.order,
    start: ranges[i][0],
    end: ranges[i][1],
  }));
}

function minorVersion(major: number, minor: number, fileName: string, createdBy: Types.ObjectId, daysAgo: number, note = ''): DeliverableVersion {
  return {
    major,
    minor,
    kind: minor === 0 ? 'major' : 'minor',
    fileName,
    storageKey: `mock/${fileName}`,
    hpcPath: null,
    note,
    createdBy,
    createdAt: new Date(Date.now() - daysAgo * 86400000),
  } as DeliverableVersion;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI가 설정되어 있지 않습니다. api/.env를 확인하세요.');
  await mongoose.connect(uri);
  console.log(`Connected: ${uri}`);

  await Promise.all([
    UserModel.deleteMany({}),
    ProjectModel.deleteMany({}),
    IpModel.deleteMany({}),
    DeliverableModel.deleteMany({}),
    MemoModel.deleteMany({}),
    EdgeModel.deleteMany({}),
    HldReleaseModel.deleteMany({}),
  ]);

  // --- Users ---
  const [swKim, dhLee, jmPark, yjChoi, hnJung, smHan, jhBae, msOh, tyKang] = await UserModel.insertMany([
    { empNo: '10001', name: '김선우', email: 'sw.kim@example.com', department: 'analog' },
    { empNo: '10002', name: '이도현', email: 'dh.lee@example.com', department: 'analog' },
    { empNo: '10003', name: '박지민', email: 'jm.park@example.com', department: 'analog' },
    { empNo: '20001', name: '최유진', email: 'yj.choi@example.com', department: 'digital' },
    { empNo: '30001', name: '정하늘', email: 'hn.jung@example.com', department: 'aps' },
    { empNo: '40001', name: '한소미', email: 'sm.han@example.com', department: 'pipd' },
    { empNo: '50001', name: '배준혁', email: 'jh.bae@example.com', department: 'solution' },
    { empNo: '60001', name: '오민서', email: 'ms.oh@example.com', department: 'pte' },
    { empNo: '20002', name: '강태양', email: 'ty.kang@example.com', department: 'digital' },
  ]);

  // --- Projects ---
  const cisA7 = await ProjectModel.create({
    code: 'CIS-A7',
    name: '50MP 모바일 CIS',
    domain: 'ANALOG',
    phases: buildPhases('2026-01-05'),
    status: 'ACTIVE',
  });
  const cisB2 = await ProjectModel.create({
    code: 'CIS-B2',
    name: '13MP 광각 CIS',
    domain: 'ANALOG',
    phases: buildPhases('2026-01-05'),
    status: 'ACTIVE',
  });

  // --- IPs ---
  const pllMain = await IpModel.create({
    projectId: cisA7._id,
    name: 'PLL_MAIN',
    description: '메인 클럭 생성 PLL',
    owners: [swKim._id, dhLee._id],
    viewGrants: [
      { userId: yjChoi._id, department: 'digital', grantedAt: new Date() },
      { userId: smHan._id, department: 'pipd', grantedAt: new Date() },
    ],
    color: '#0c9a83',
  });
  const adcTop = await IpModel.create({
    projectId: cisA7._id,
    name: 'ADC_TOP',
    description: '컬럼 ADC 통합 블록',
    owners: [jmPark._id],
    viewGrants: [
      { userId: hnJung._id, department: 'aps', grantedAt: new Date() },
      { userId: jhBae._id, department: 'solution', grantedAt: new Date() },
    ],
    color: '#2f6fed',
  });
  const ldoReg = await IpModel.create({
    projectId: cisB2._id,
    name: 'LDO_REG',
    description: '아날로그 코어 LDO 레귤레이터',
    owners: [jmPark._id, dhLee._id],
    viewGrants: [{ userId: msOh._id, department: 'pte', grantedAt: new Date() }],
    color: '#c2410c',
  });

  // --- Deliverables ---
  type DRow = {
    ipId: Types.ObjectId;
    projectId: Types.ObjectId;
    phaseKey: string;
    name: string;
    docType: string;
    network: 'OA' | 'HPC';
    versions: DeliverableVersion[];
    recvDept?: string;
    recvContact?: Types.ObjectId;
    createdBy: Types.ObjectId;
    x: number;
    y: number;
  };

  const rows: DRow[] = [];

  // PLL_MAIN (10개)
  const pllPlan: [string, string, string, 'OA' | 'HPC', number][] = [
    ['KO', 'Spec 정의서', 'word', 'OA', 2],
    ['ML1', 'Behavior 모델', 'path', 'HPC', 1],
    ['ML1', 'Testbench 등록', 'path', 'HPC', 1],
    ['AR', 'Architecture Review 자료', 'ppt', 'OA', 1],
    ['ML2', 'Schematic 리뷰본', 'word', 'OA', 3],
    ['ML2', 'Pre-layout 시뮬 결과', 'excel', 'OA', 2],
    ['ML3', 'Post-layout 시뮬 결과', 'excel', 'OA', 2],
    ['ML3', 'Layout 파일 경로', 'path', 'HPC', 1],
    ['MDR', 'Mid Design Review 자료', 'ppt', 'OA', 1],
    ['ML4', 'Corner 재검증 결과', 'excel', 'OA', 2],
  ];
  for (const [phaseKey, name, docType, network, verCount] of pllPlan) {
    const versions: DeliverableVersion[] = [];
    for (let i = verCount; i >= 1; i--) {
      const isRelease = i === verCount && verCount > 1;
      versions.push(
        isRelease
          ? minorVersion(1, 0, `${name}_v1.0.${docType === 'excel' ? 'xlsx' : docType === 'ppt' ? 'pptx' : 'docx'}`, dhLee._id, i * 5)
          : minorVersion(verCount > 1 ? 1 : 0, verCount > 1 ? 0 : i, `${name}_draft.${docType}`, swKim._id, i * 5),
      );
    }
    versions.reverse(); // 최신이 index 0
    rows.push({
      ipId: pllMain._id,
      projectId: cisA7._id,
      phaseKey,
      name,
      docType,
      network,
      versions,
      recvDept: name.includes('시뮬') ? 'digital' : undefined,
      recvContact: name.includes('시뮬') ? yjChoi._id : undefined,
      createdBy: swKim._id,
      x: 40,
      y: 40,
    });
  }

  // ADC_TOP (10개)
  const adcPlan: [string, string, string, 'OA' | 'HPC', number][] = [
    ['KO', 'ADC Spec 정의서', 'word', 'OA', 2],
    ['ML1', 'ADC Behavior 모델', 'path', 'HPC', 1],
    ['ML2', 'ADC Schematic 리뷰본', 'word', 'OA', 2],
    ['ML2', 'Column ADC 시뮬 결과', 'excel', 'OA', 2],
    ['ML2', 'Column ADC 재추출 파일', 'path', 'HPC', 1],
    ['ML3', 'ADC Post-layout 시뮬', 'excel', 'OA', 2],
    ['MDR', 'ADC MDR 자료', 'ppt', 'OA', 1],
    ['ML4', 'ADC Noise 분석 결과', 'excel', 'OA', 1],
    ['FDR', 'ADC FDR 자료', 'ppt', 'OA', 1],
    ['MTO', 'ADC 최종 GDS 경로', 'path', 'HPC', 1],
  ];
  for (const [phaseKey, name, docType, network, verCount] of adcPlan) {
    const versions: DeliverableVersion[] = [];
    for (let i = verCount; i >= 1; i--) {
      versions.push(
        i === verCount && verCount > 1
          ? minorVersion(1, 0, `${name}_v1.0.${docType}`, jmPark._id, i * 4)
          : minorVersion(0, i, `${name}_draft.${docType}`, jmPark._id, i * 4),
      );
    }
    versions.reverse();
    rows.push({
      ipId: adcTop._id,
      projectId: cisA7._id,
      phaseKey,
      name,
      docType,
      network,
      versions,
      recvDept: name.includes('시뮬') || name.includes('재추출') ? 'aps' : undefined,
      recvContact: name.includes('시뮬') || name.includes('재추출') ? hnJung._id : undefined,
      createdBy: jmPark._id,
      x: 40,
      y: 40,
    });
  }

  // LDO_REG (9개)
  const ldoPlan: [string, string, string, 'OA' | 'HPC', number][] = [
    ['KO', 'LDO Spec 정의서', 'word', 'OA', 1],
    ['ML1', 'LDO Behavior 모델', 'path', 'HPC', 1],
    ['ML2', 'LDO Schematic 리뷰본', 'word', 'OA', 2],
    ['ML2', 'LDO 안정성 시뮬 결과', 'excel', 'OA', 2],
    ['ML3', 'LDO Post-layout 시뮬', 'excel', 'OA', 1],
    ['MDR', 'LDO MDR 자료', 'ppt', 'OA', 1],
    ['ML4', 'LDO PSRR 분석 결과', 'excel', 'OA', 1],
    ['FDR', 'LDO FDR 자료', 'ppt', 'OA', 1],
    ['MTO', 'LDO 최종 GDS 경로', 'path', 'HPC', 1],
  ];
  for (const [phaseKey, name, docType, network, verCount] of ldoPlan) {
    const versions: DeliverableVersion[] = [];
    for (let i = verCount; i >= 1; i--) {
      versions.push(
        i === verCount && verCount > 1
          ? minorVersion(1, 0, `${name}_v1.0.${docType}`, dhLee._id, i * 6)
          : minorVersion(0, i, `${name}_draft.${docType}`, jmPark._id, i * 6),
      );
    }
    versions.reverse();
    rows.push({
      ipId: ldoReg._id,
      projectId: cisB2._id,
      phaseKey,
      name,
      docType,
      network,
      versions,
      recvDept: name.includes('시뮬') ? 'pte' : undefined,
      recvContact: name.includes('시뮬') ? msOh._id : undefined,
      createdBy: jmPark._id,
      x: 40,
      y: 40,
    });
  }

  // 레인 안에서 겹치지 않도록 phase별로 x를 지그재그 배치 (Auto Fit 이전 상태를 흉내)
  const laneCounter = new Map<string, number>();
  const created: InstanceType<typeof DeliverableModel>[] = [];
  for (const row of rows) {
    const laneKey = `${row.ipId.toString()}:${row.phaseKey}`;
    const idx = laneCounter.get(laneKey) ?? 0;
    laneCounter.set(laneKey, idx + 1);
    const d = await DeliverableModel.create({
      projectId: row.projectId,
      ipId: row.ipId,
      phaseKey: row.phaseKey,
      name: row.name,
      docType: row.docType,
      network: row.network,
      series: null,
      seriesIdx: 1,
      seriesTotal: 1,
      recvDept: row.recvDept ?? null,
      recvContact: row.recvContact ?? null,
      layout: { x: 24 + (idx % 2) * 88, y: 40 + Math.floor(idx / 2) * 110, w: 160, h: 82 },
      versions: row.versions,
      createdBy: row.createdBy,
    });
    created.push(d);
  }

  // --- Series 예시: PLL_MAIN의 "Corner 재검증 결과"를 ML2/ML3/ML4에 걸쳐 반복 릴리스 (설계서 3.6) ---
  const cornerOrigin = created.find((d) => d.name === 'Corner 재검증 결과')!;
  cornerOrigin.phaseKey = 'ML2';
  cornerOrigin.seriesTotal = 3;
  cornerOrigin.seriesIdx = 1;
  await cornerOrigin.save();

  const cornerMl3 = await DeliverableModel.create({
    projectId: cisA7._id,
    ipId: pllMain._id,
    phaseKey: 'ML3',
    name: cornerOrigin.name,
    docType: cornerOrigin.docType,
    network: cornerOrigin.network,
    series: cornerOrigin._id,
    seriesIdx: 2,
    seriesTotal: 3,
    recvDept: null,
    recvContact: null,
    layout: { x: 24, y: 260, w: 160, h: 82 },
    versions: [minorVersion(1, 0, 'corner_ml3_v1.0.xlsx', swKim._id, 10)],
    createdBy: swKim._id,
  });
  const cornerMl4 = await DeliverableModel.create({
    projectId: cisA7._id,
    ipId: pllMain._id,
    phaseKey: 'ML4',
    name: cornerOrigin.name,
    docType: cornerOrigin.docType,
    network: cornerOrigin.network,
    series: cornerOrigin._id,
    seriesIdx: 3,
    seriesTotal: 3,
    recvDept: null,
    recvContact: null,
    layout: { x: 24, y: 260, w: 160, h: 82 },
    versions: [],
    createdBy: swKim._id,
  });

  // --- Edges ---
  const byName = (ipId: Types.ObjectId, name: string) =>
    created.find((d) => d.ipId.toString() === ipId.toString() && d.name === name)!;

  await EdgeModel.insertMany([
    // PLL_MAIN: 단방향 순차 흐름
    { ipId: pllMain._id, fromId: byName(pllMain._id, 'Spec 정의서')._id, toId: byName(pllMain._id, 'Behavior 모델')._id, bidirectional: false, auto: false },
    { ipId: pllMain._id, fromId: byName(pllMain._id, 'Schematic 리뷰본')._id, toId: byName(pllMain._id, 'Pre-layout 시뮬 결과')._id, bidirectional: false, auto: false },
    // 양방향: 시뮬 결과 <-> 재추출 성격의 관계를 흉내 (Post-layout 결과가 Layout 경로를 참조/갱신)
    { ipId: pllMain._id, fromId: byName(pllMain._id, 'Post-layout 시뮬 결과')._id, toId: byName(pllMain._id, 'Layout 파일 경로')._id, bidirectional: true, auto: false },
    // series 자동 연결 체인
    { ipId: pllMain._id, fromId: cornerOrigin._id, toId: cornerMl3._id, bidirectional: false, auto: true },
    { ipId: pllMain._id, fromId: cornerMl3._id, toId: cornerMl4._id, bidirectional: false, auto: true },

    // ADC_TOP
    { ipId: adcTop._id, fromId: byName(adcTop._id, 'ADC Spec 정의서')._id, toId: byName(adcTop._id, 'ADC Behavior 모델')._id, bidirectional: false, auto: false },
    { ipId: adcTop._id, fromId: byName(adcTop._id, 'Column ADC 시뮬 결과')._id, toId: byName(adcTop._id, 'Column ADC 재추출 파일')._id, bidirectional: true, auto: false },

    // LDO_REG
    { ipId: ldoReg._id, fromId: byName(ldoReg._id, 'LDO Spec 정의서')._id, toId: byName(ldoReg._id, 'LDO Behavior 모델')._id, bidirectional: false, auto: false },
  ]);

  // --- Memos (Edit 권한자 전용) ---
  await MemoModel.insertMany([
    { ipId: pllMain._id, phaseKey: 'ML2', text: '디지털팀 CDC 검토 회신 후 착수', layout: { x: 220, y: 40, w: 160, h: 68 }, createdBy: swKim._id },
    { ipId: adcTop._id, phaseKey: 'ML3', text: 'APS팀 노이즈 목표치 재확인 필요', layout: { x: 220, y: 40, w: 160, h: 68 }, createdBy: jmPark._id },
  ]);

  // --- HLD Releases (PLL_MAIN 기준 2건) ---
  const pllDeliverables = created.filter((d) => d.ipId.toString() === pllMain._id.toString());
  const itemsV1: Record<string, unknown> = {};
  for (const d of pllDeliverables) {
    const released = d.versions.find((v) => v.kind === 'major');
    if (released) {
      itemsV1[d._id.toString()] = {
        version: `${released.major}.${released.minor}`,
        file: released.fileName,
        at: released.createdAt.toISOString(),
        comment: released.note ?? '',
      };
    }
  }
  await HldReleaseModel.create({
    ipId: pllMain._id,
    version: '1.0',
    date: '2026-05-20',
    releasedBy: swKim._id,
    note: 'ML2 완료 · Schematic 리뷰 반영',
    items: itemsV1,
  });
  await HldReleaseModel.create({
    ipId: pllMain._id,
    version: '2.0',
    date: '2026-07-25',
    releasedBy: swKim._id,
    note: 'MDR 진입 · Post-layout 결과 반영',
    items: itemsV1,
  });

  console.log(`Seed 완료: users=9, projects=2, ips=3, deliverables=${created.length + 2}, hldReleases=2`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
