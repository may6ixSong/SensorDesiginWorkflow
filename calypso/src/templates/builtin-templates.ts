import { TableTemplateDef } from './table-validation';

/**
 * 부팅 시 없으면 한 번 만들어 두는 기본 template. 이후로는 Admin이 SIREN 화면에서 고친다 —
 * 여기 값을 바꿔도 이미 만들어진 template은 덮어쓰지 않는다(TemplatesService.seedBuiltins).
 *
 * Liberty Port List — LibertyGenScript `src/step1_setup/field_defs.py`·`port_list_reader.py`의
 * 규칙을 그대로 옮겼다:
 *   - 컬럼 key는 스크립트의 표준 컬럼명(PORT_LIST_REQUIRED/OPTIONAL_COLUMNS, _HEADER_ALIASES)과
 *     같다 — HPC 쪽은 JSON 행을 read_port_list_rows()의 record와 같은 모양으로 받는다.
 *   - 필수 컬럼: Port, Pin name, Bits, Num, I/O, Volts, Cap, Map
 *   - Bits는 정수, Port는 PORT/PWR/GND, I/O는 I·O로 시작(input/output 판정), Volts는 단위 허용
 *     숫자, Cap은 숫자(스크립트는 파싱 실패 시 결측 처리한다 — 여기서 미리 막는다)
 *   - Related power/ground는 PWR/GND 행의 Pin name을, Related Pin은 아무 행의 Pin name을
 *     가리킨다(bit 범위 무시) — 못 찾으면 경고
 *   - 엑셀의 "{cell name}" 행은 쓰지 않는다(사용자 결정) — 헤더는 한 줄이다
 *   - Block은 엑셀에서 같은 값끼리 병합해 둔다 — 가져올 때 풀어서 채우고, 내보낼 때 다시 병합
 */
export const BUILTIN_TEMPLATES: Omit<TableTemplateDef, 'version'>[] = [
  {
    key: 'liberty-port-list',
    name: 'Port List (Liberty)',
    description: 'Pin list for Liberty generation — one row per pin (PORT / PWR / GND).',
    sheetName: 'Port list',
    columns: [
      { key: 'Block', label: 'Block', type: 'string', fillDown: true, mergeOnExport: true, width: 90 },
      {
        key: 'Port', label: 'PORT', type: 'enum', required: true, options: ['PORT', 'PWR', 'GND'], width: 70,
        description: 'PORT = I/O signal pin, PWR = power pin, GND = ground pin.',
      },
      {
        key: 'Pin name', label: 'Pin name', type: 'string', required: true, unique: true, width: 180,
        pattern: '^[^\\s\\[\\]]+(\\[\\d+:\\d+\\])?$',
        patternMessage: 'Pin name must have no spaces, optionally followed by [MSB:LSB].',
        caseSensitive: true,
      },
      { key: 'Bits', label: 'Bits', type: 'integer', required: true, min: 1, width: 56 },
      { key: 'Num', label: 'Num', type: 'string', required: true, width: 56 },
      {
        key: 'I/O', label: 'I/O', type: 'string', required: true, width: 56,
        pattern: '^[IO]', patternMessage: 'I/O must start with I (input) or O (output).',
      },
      { key: 'Volts', label: 'Volts', type: 'number', required: true, allowUnit: true, width: 70 },
      { key: 'Cap', label: 'Cap', type: 'number', required: true, width: 60 },
      {
        key: 'Map', label: 'Map', type: 'string', required: true, width: 110,
        description: '"analog" marks the pin as analog (is_analog).',
      },
      {
        key: 'Related Power', label: 'Related power', type: 'ref', width: 170,
        ref: { column: 'Pin name', where: { column: 'Port', equals: 'PWR' }, severity: 'warning' },
        emptyTokens: ['N/A', '-'],
      },
      {
        key: 'Related ground', label: 'Related ground', type: 'ref', width: 170,
        ref: { column: 'Pin name', where: { column: 'Port', equals: 'GND' }, severity: 'warning' },
        emptyTokens: ['N/A', '-'],
      },
      {
        key: 'Related Pin', label: 'Related Pin', type: 'ref', width: 130,
        ref: { column: 'Pin name', stripBitRange: true, severity: 'warning' },
        emptyTokens: ['N/A', '-'],
      },
      { key: 'Timing reference', label: 'Timing reference', type: 'string', width: 130, emptyTokens: ['N/A', '-'] },
      { key: 'Max transition', label: 'Max transition', type: 'string', width: 110, emptyTokens: ['N/A', '-'] },
      { key: 'Functional Description', label: 'Functional Description', type: 'string', width: 220 },
      { key: 'Description', label: 'Description', type: 'string', width: 260 },
      {
        key: 'Type', label: 'Type', type: 'string', width: 80,
        description: '"clock" makes the pin_type clock.',
      },
      {
        key: 'Default(binary/hex)', label: 'Default (binary/hex)', type: 'string', width: 120,
        aliases: ['Default'],
      },
      { key: 'Digital Reg', label: 'Digital Reg', type: 'string', width: 150 },
    ],
  },
];
