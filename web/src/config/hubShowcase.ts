/**
 * Home 대문 3D 씬(HomePage.tsx)에 쓰는 고정 목업 — API 호출 없이 이 파일만으로 렌더한다.
 *
 * 대문은 그냥 대문이다 — 산출물 목록이나 승인 화면처럼 실제 데이터가 정확해야 하는
 * 자리가 아니라서, 여기 값은 의미를 담을 필요가 없다. 슬랩·버전 이름·구성을 바꾸고
 * 싶으면 이 배열만 고치면 된다 — 다른 코드는 안 건드려도 된다.
 */
export interface HubShowcaseItem {
  name: string;
  versionLabel: string;
}

export interface HubShowcaseSlab {
  key: string;
  name: string;
  contractVersion: string;
  transport: string;
  enabled: boolean;
  items: HubShowcaseItem[];
}

export const HUB_SHOWCASE_SLABS: HubShowcaseSlab[] = [
  {
    key: 'calypso',
    name: 'Calypso',
    contractVersion: '1.0',
    transport: 'http',
    enabled: true,
    items: [
      { name: 'Circuit Design Document', versionLabel: '1.0' },
      { name: 'Loop Filter Calculation Sheet', versionLabel: '1.0' },
      { name: 'Substrate/Package Outline Spec', versionLabel: '1.0' },
    ],
  },
  {
    key: 'ssm',
    name: 'SSM',
    contractVersion: '1.0',
    transport: 'shared-db',
    enabled: true,
    items: [
      { name: 'PLL Requirements Intake', versionLabel: '1.0' },
      { name: 'PLL Architecture Review', versionLabel: '1.0' },
      { name: 'AR Review Package', versionLabel: '2.0' },
    ],
  },
  {
    key: 'simhub',
    name: 'SimHub',
    contractVersion: '1.0',
    transport: 'http',
    enabled: true,
    items: [
      { name: 'Pre-layout Simulation Results', versionLabel: '1.0' },
      { name: 'INL/DNL Simulation Results', versionLabel: '2.0' },
      { name: 'Driver Strength Simulation', versionLabel: '1.0' },
    ],
  },
  {
    key: 'layoutdb',
    name: 'LayoutDB',
    contractVersion: '1.0',
    transport: 'shared-db',
    enabled: true,
    items: [
      { name: 'Netlist / PEX', versionLabel: '1.0' },
      { name: 'Column Layout DB', versionLabel: '1.0' },
      { name: 'Layout DB', versionLabel: '1.0' },
    ],
  },
];
