# 11. Sheet artifact — 엑셀처럼 편집하는 표

> 대상: Calypso(File Artifacts)의 새 콘텐츠 종류. 첫 사용처는 Liberty generator(HPC Service)가
> 읽는 **Port List**다. 관련 장: 04장(Artifact), 08장(서비스 연동), 10장(Auto Run).

## 1. 무엇을 하나

Port List처럼 **사람이 표로 채우고, HPC 서비스가 데이터로 읽는** 산출물이 필요하다. 엑셀 파일을
올리게 하면 HPC가 파일을 받아 파싱해야 하고, 파일은 HPC망으로 보낼 수 없다. 그래서 표 자체를
Calypso의 데이터로 두고, HPC에는 **API로 JSON**을 넘긴다.

- 편집기는 **SpreadJS**다. 사용자는 엑셀처럼 자유롭게 고친다(헤더·서식·병합·필터·붙여넣기 포함).
- 새 artifact를 만들 때 **template**을 고르면 기본 내용이 채워진 시트에서 시작한다. template은
  시작점일 뿐이다. 만든 뒤로는 template과 무관하다.
- **시스템은 내용을 검사하지 않는다**(사용자 결정). 사용자가 저장한 그대로 저장하고, 그대로
  열고, 소비자도 그대로 받는다. 값이 맞는지는 소비자(liberty generator)가 본다.

## 2. 콘텐츠 종류

Calypso artifact에 `contentKind`가 생겼다. 만들 때 정하고, 바꿀 수 없다.

| 값 | 뜻 |
|---|---|
| `file`(기본) | 지금까지의 artifact — 파일·OA 링크·HPC 경로 |
| `sheet` | 엑셀처럼 편집하는 표. 버전은 sheet 편집기로만 만든다 |

sheet artifact는 `templateId`·`templateKey`·`templateRevision`을 함께 가진다 — 만들 때 고른 template과 **그 순간의
개정본**이다. 나중에 Admin이 template을 고쳐도 이 artifact의 첫 시작 시트는 바뀌지 않는다.

sheet의 `network`는 **항상 OA로 고정**한다(사용자 결정). 만들 때 요청 값과 무관하게 OA로 저장하고, 바꾸기(`PATCH …/network`)는
Calypso가 거부한다. 화면에서도 생성 폼과 상세의 network 버튼을 막아 둔다.

## 3. Template

- **Calypso가 소유한다**(collection `sheetTemplates`). 쓰기는 Admin만, SIREN 화면의 Admin 메뉴
  **Sheet Templates**에서 한다.
- template을 고치면 항상 **새 개정본**이 쌓인다. 과거 개정본은 바뀌지 않는다.
- 개정본은 둘 중 하나를 갖는다.
  - `document` — Admin이 편집기로 저장한 SpreadJS 문서(오브젝트 스토리지).
  - `seed` — 기본 template의 중립 명세. 서버에는 SpreadJS가 없어 문서를 직접 만들 수 없으므로,
    편집기(sheet-host)가 이 명세로 워크북을 만든다(헤더 꾸밈·틀 고정·필터).
- 기본 template **Port List (Liberty)** 를 부팅 때 없으면 한 번 만든다. LibertyGenScript가 읽는 헤더
  한 줄(Block … Digital Reg, 19열)에 필터·틀 고정을 걸고, 그 아래는 빈 표다. `{cell name}` 행은 두지
  않는다(사용자 결정).
- 옛 양식을 새 양식으로 바꿀 때는 **고친다**(새 개정본). 더 이상 필요 없는 template은 **삭제한다**.
  - 삭제하면 관리 화면과 생성 화면에서 사라지고 되살릴 수 없다. 같은 key로 새 template을 만들 수 있다.
  - 이미 만든 artifact는 영향이 없다. 내부적으로 문서와 개정본을 남겨 두어, 그 template으로 만들고
    아직 첫 저장을 안 한 artifact도 고정된 개정본으로 시작한다. 그래서 artifact는 template을 key가
    아니라 **id**(`templateId`)로 가리킨다 — 삭제하면 key가 `deleted~<id>~<key>`로 바뀐다.
  - 삭제한 기본 template(Port List)은 재시작해도 다시 만들지 않는다.

## 4. latest · Save · Publish

sheet에는 버전 업로드가 없다. 대신 **latest**(작업본) 하나와 **published 버전**들이 있다(사용자 결정).

| | latest | published 버전 |
|---|---|---|
| 무엇 | 지금 고치고 있는 시트. 정식 버전이 아니다 | Publish할 때마다 생기는 major 버전(`1.0`, `2.0`, …) |
| 표시 | 마지막 published 버전 + `+` — `v0+`(아직 publish 전), `v1.0+` | `v1.0` |
| 생기는 때 | artifact를 만들 때부터 항상 있다. 첫 저장 전에는 template(또는 빈 시트)으로 시작한다 | Publish |
| 고치기 | edit 권한자. **Save = 확인 후 덮어쓰기** — 새 버전도, SIREN hub 이벤트도 없다 | 읽기 전용 |
| 누가 보나 | edit 권한자만(Calypso 화면). SIREN workflow·release는 모른다 | 기존 규칙 그대로(view는 released만) |

- **Publish**: latest 내용으로 새 published 버전(major +1 · minor 0)을 만들고, 이때만 SIREN에 버전 이벤트가
  간다. latest는 그대로 남아 계속 고칠 수 있다. 이전 published 버전과 같은지는 비교하지 않는다(사용자 결정) —
  한 번도 저장하지 않았거나, 저장 안 한 변경이 화면에 있을 때만 막는다(먼저 Save).
- 예전에 저장마다 minor 버전이 생기던 sheet는, latest가 아직 없으면 최신 미발행 버전(없으면 최신 published)을
  latest의 시작점으로 쓴다. 첫 Save부터 새 방식이 된다. 그 옛 minor 버전은 화면 트리에 보이지 않는다.

**Artifact 화면(SIREN FE `/projects/:id/artifacts/:id`).**

- 왼쪽에 카드 대신 **시트를 영역 전체로** 띄운다. 머리글에 버전·마지막으로 저장(발행)한 사람과 시각,
  Import/Export Excel, **Save**(latest일 때만)가 있다. published 버전을 보면 그때의 Version Note·Description이
  머리글 아래에 같이 보인다.
- 오른쪽 버전 트리는 맨 위 latest 행(`v1.0+ WORKING LATEST`) + published 버전들이다. published 버전을 고르면
  그 시트를 읽기 전용으로 띄우고(Save 없음), latest 행을 다시 골라야 고칠 수 있다. 저장 안 한 변경이 있으면
  옮기기 전에 확인한다. iframe은 한 번만 만들고 그 자리에서 다시 load한다(`sheet:load`).
- "Add a new version" 자리에 **Publish** 버튼(기본 강조색 배경·흰 글자, 다크 테마는 토큰이 맞춘다). 기존
  publish 다이얼로그를 그대로 쓴다.
- **workflow detail slide**는 지금처럼 카드로 published 버전만 보여준다(latest는 정식 버전이 아니라 보이지 않는다).

**저장 형식.** latest와 published 버전 모두 파일 두세 개다 — published 버전은 발행 순간의 latest 파일을 그대로
가리킨다(복사하지 않는다). 다음 Save는 새 파일을 쓰고, 어느 버전도 가리키지 않는 이전 latest 파일만 지운다.

| 파일 | 내용 | 누가 쓰나 |
|---|---|---|
| `<이름>.ssjson` | SpreadJS 문서 JSON(`workbook.toJSON`) | 편집기가 다시 연다 |
| `<이름>.grid.json` | 셀 값 격자(§5) | HPC·다른 서비스 |
| `<이름>.xlsx` | 같은 내용의 엑셀 | 사람이 내려받아 본다 |

Calypso가 보는 것은 **모양뿐**이다. `.ssjson`과 `.grid.json`이 정확히 하나씩 있어야 하고, 격자 파일이
§5의 모양이어야 한다. 셀 값은 보지 않는다.

## 5. 격자(grid) 형식 — 소비자가 받는 것

```json
{
  "format": "siren-sheet-grid",
  "version": 1,
  "sheets": [
    {
      "name": "Port list",
      "rows": [
        ["Block", "PORT", "Pin name", "Bits"],
        ["BLK_A", "PWR", "VDDA", "1"]
      ],
      "merges": [{ "row": 1, "col": 0, "rowCount": 3, "colCount": 1 }]
    }
  ]
}
```

- 모든 시트를 순서대로 담는다(숨긴 시트 포함).
- 값은 **화면에 보이는 문자열 그대로**다(SpreadJS `getText`). 숫자도 문자열이다. 수식은 결과 값이 들어간다.
- 끝의 빈 행·열은 잘린다. 중간의 빈 행은 그대로 있다.
- 병합은 0부터 센 `{row, col, rowCount, colCount}`다. 병합 셀의 값은 왼쪽 위 칸에만 있다.
- 몇 번째 행이 헤더인지 SIREN은 모른다. 사용자가 헤더를 옮기거나 바꿀 수 있으므로 소비자가 찾는다.

**Auto Run.** Calypso source 조회(`GET /auto-run/artifacts/:id/versions/:versionRef/contents`, 10장 §6.2)
응답에 `contentKind`와 `sheet: { grid }`가 실린다. HPC 서비스는 파일을 받지 않고 이 JSON만 읽으면 된다.

## 6. sheet-host — SpreadJS iframe

SpreadJS 라이선스는 SIREN 도메인이 아니라 **SDP_SPA 도메인**(`https://sdp.samsungds.net:44302`)에 묶여
있다. 그래서 편집기는 SDP_SPA의 `/sheet-host` 페이지를 iframe으로 띄우고, **postMessage로만** 주고받는다.

- SIREN 설정: `web/.env.*`의 `SHEET_HOST_URL`. 운영은 `https://sdp.samsungds.net:44302/sheet-host`,
  로컬은 `http://localhost:3000/sheet-host`(그래서 SIREN api의 dev 포트는 3001이다). SDP_SPA 개발 서버와
  이 저장소의 `sheet-host/` 개발 서버(SpreadJS 평가판 — 워터마크가 뜬다)가 같은 주소로 뜨므로 둘 중 하나만
  띄우면 된다.
- `sheet-host/src/sheetHost/`가 **참고 구현**이다. SDP_SPA에 옮기는 방법은
  `prompts/sdp-spa-sheet-host.md`.
- iframe에는 `sandbox`를 주지 않는다(붙여넣기·가져오기가 막힌다). 로그인·쿠키를 쓰지 않는다.
- 기존 SDP_SPA `/spreadSheet`(SFM용) 규약은 재사용하지 않는다 — origin 검사·요청 id·에러 메시지가 없다.

### 6.1 메시지 규약 v1

모든 메시지: `{ channel: 'siren-sheet', v: 1, type, requestId?, payload? }`

| 방향 | type | payload | 답 |
|---|---|---|---|
| host → SIREN | `sheet:ready` | `{ spreadVersion }` | — |
| SIREN → host | `sheet:load` | `{ mode: 'edit'│'view', document, seed }` | `sheet:loaded` |
| SIREN → host | `sheet:save` | `{ includeXlsx }` | `sheet:saved` `{ document, grid, xlsx }` |
| SIREN → host | `sheet:exportExcel` | `{}` | `sheet:exported` `{ xlsx }` |
| SIREN → host | `sheet:importExcel` | `{ file }` | `sheet:imported` |
| host → SIREN | `sheet:dirty` | `{ dirty: true }` | — |
| host → SIREN | `sheet:error` | `{ message }` | 요청의 답 대신 |

- 답은 요청과 같은 `requestId`를 단다. `sheet:error`가 오면 그 요청은 실패다.
- **origin 검사는 양쪽 다 한다.** host는 허용 목록(`allowedOrigins.js`)에 있는 부모 창의 메시지만 받고,
  답장은 확인된 origin으로만 보낸다. SIREN은 그 iframe 창에서, sheet-host origin으로 온 것만 받고,
  `targetOrigin`에 sheet-host origin을 준다. `'*'`는 데이터가 없는 `sheet:ready`에만 쓴다.
- `sheet:ready`는 워크북이 만들어진 **뒤에** 보낸다. 먼저 보내면 첫 `sheet:load`를 잃을 수 있다.
- `workbook.toJSON()` 결과에는 함수가 섞여 있어(`docProps.toString`) postMessage로 그대로 보낼 수 없다.
  `JSON.parse(JSON.stringify(...))`로 걸러서 보낸다. 그대로 보내면 SpreadJS `export` 콜백 안에서 복제
  오류가 나고, SpreadJS가 그 예외를 "Incorrect file format"으로 바꿔 보고해 원인을 찾기 어렵다.
- 필터 버튼은 필터 범위 **바로 위 행**에 달린다. 범위가 0행에서 시작하면 열 머리글(A·B·C)에 달리므로,
  헤더 아래부터 범위를 잡는다.
- view 모드는 모든 시트를 보호(`isProtected`)하고, 필터·정렬·열 너비 조절만 허용한다.

## 7. API 요약

SIREN FE는 SIREN BE만 부른다(07장 §2).

| SIREN BE | Calypso | 권한 |
|---|---|---|
| `POST /calypso-artifacts` (+`contentKind`, `templateKey`) | `POST /artifacts` | project member |
| `GET /calypso-artifacts/:id/sheet` (latest) | `GET /artifacts/:id/sheet` | edit |
| `PUT /calypso-artifacts/:id/sheet` (Save, multipart `files`) | `PUT /artifacts/:id/sheet` | edit |
| `POST /calypso-artifacts/:id/release` (Publish — sheet는 latest가 원본) | `POST /artifacts/:id/release` | edit |
| `GET /calypso-artifacts/:id/sheet/:versionRef` | `GET /artifacts/:id/sheet/:versionRef` | 다운로드와 같음 |
| `POST /calypso-artifacts/:id/versions` | `POST /artifacts/:id/versions` | edit (sheet는 400 — 업로드 없음) |
| `GET /calypso-sheet-templates` | `GET /sheet-templates` | 로그인 사용자 |
| `GET /calypso-sheet-templates/:key/start?revision=` | `GET /sheet-templates/:key/start` | 로그인 사용자 |
| `POST /calypso-sheet-templates` | `POST /sheet-templates` | Admin |
| `PATCH /calypso-sheet-templates/:key` (이름·설명) | `PATCH /sheet-templates/:key` | Admin |
| `DELETE /calypso-sheet-templates/:key` | `DELETE /sheet-templates/:key` | Admin |
| `POST /calypso-sheet-templates/:key/revisions` (multipart `document`) | `POST /sheet-templates/:key/revisions` | Admin |

## 8. 제약과 남은 일

- 엑셀은 `.xlsx`만 된다(SpreadJS IO). `.xls`가 필요하면 서버 변환을 따로 둬야 한다.
- 로컬 개발 sheet-host(평가판)는 내보낸 `.xlsx`에 "Evaluation Version" 시트를 끼워 넣는다. 그 파일을 다시
  가져오면 그 시트도 따라 들어온다. 라이선스 키가 있는 SDP_SPA에서는 생기지 않는다.
- 검증된 규모는 SDP_SPA 기존 화면 기준 500행이다. 수천 행이 필요하면 따로 성능 확인이 필요하다.
- 배포 전 확인: SpreadJS 라이선스가 iframe으로 SIREN 사용자에게 제공하는 사용을 허용하는지(계약),
  SIREN 사용자 대역에서 `sdp.samsungds.net:44302` 접근, SDP_SPA 배포 주체.
- 배포 뒤 SIREN에서 편집기를 열어 **워터마크·평가판 배너가 없는지** 눈으로 확인한다. 라이선스가 맞지
  않아도 SpreadJS는 멈추지 않고 배너만 띄운다.
