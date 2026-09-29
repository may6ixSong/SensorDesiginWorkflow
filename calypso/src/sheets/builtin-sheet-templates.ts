import { SheetSeed } from './sheet-format';

export interface BuiltinSheetTemplate {
  key: string;
  name: string;
  description: string;
  seed: SheetSeed;
}

/**
 * 부팅 때 없으면 한 번 만들어 두는 기본 template. 이후로는 Admin이 SIREN 화면(편집기)에서
 * 고친다 — 여기 값을 바꿔도 이미 있는 template은 덮어쓰지 않는다(SheetTemplatesService.seedBuiltins).
 *
 * Liberty Port List — LibertyGenScript `port_list_reader.py`가 읽는 헤더 한 줄. "{cell name}"
 * 행은 두지 않는다(사용자 결정). 헤더에 필터를 달고 틀 고정한다. 그 아래는 빈 표다 — 초기
 * 데이터는 필요 없다(사용자 결정). 사용자는 이후 엑셀처럼 자유롭게 고친다(헤더 포함).
 */
const PORT_LIST_COLUMNS: [label: string, width: number][] = [
  ['Block', 90],
  ['PORT', 70],
  ['Pin name', 180],
  ['Bits', 56],
  ['Num', 56],
  ['I/O', 56],
  ['Volts', 70],
  ['Cap', 60],
  ['Map', 110],
  ['Related power', 170],
  ['Related ground', 170],
  ['Related Pin', 130],
  ['Timing reference', 130],
  ['Max transition', 110],
  ['Functional Description', 220],
  ['Description', 260],
  ['Type', 80],
  ['Default (binary/hex)', 120],
  ['Digital Reg', 150],
];

export const BUILTIN_SHEET_TEMPLATES: BuiltinSheetTemplate[] = [
  {
    key: 'liberty-port-list',
    name: 'Port List (Liberty)',
    description: 'Pin list for Liberty generation — one row per pin (PORT / PWR / GND).',
    seed: {
      sheets: [
        {
          name: 'Port list',
          rows: [PORT_LIST_COLUMNS.map(([label]) => label)],
          merges: [],
          headerRowCount: 1,
          filter: true,
          columnWidths: PORT_LIST_COLUMNS.map(([, width]) => width),
          headerStyle: { backColor: '#DDEBF7', foreColor: '#1F1F1F' },
        },
      ],
    },
  },
];
