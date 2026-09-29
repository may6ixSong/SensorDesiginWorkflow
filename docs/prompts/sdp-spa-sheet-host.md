# SDP_SPA `/sheet-host` 추가 프롬프트 (구현)

> SDP_SPA 저장소를 가진 **데스크톱 Claude Code 세션**에 그대로 붙여넣는 프롬프트다. 아래 `---` 사이를
> 복사하고 `{SDP_SPA_PATH}`, `{SIREN_REPO_PATH}` 두 곳만 실제 경로로 바꾼다.
> 배경은 SIREN 설계서 11장(docs/11-sheet-artifacts.md)이다.

---

너는 `{SDP_SPA_PATH}`(React 18 + CRA, JavaScript)에 **새 라우트 `/sheet-host`를 추가**한다. 이 페이지는
다른 사내 시스템 SIREN이 iframe으로 띄워 쓰는 SpreadJS 편집기다. SpreadJS 라이선스가 이 도메인
(`https://sdp.samsungds.net:44302`)에 묶여 있어서 SIREN이 직접 쓰지 못하고 이 페이지를 빌려 쓴다.

참고 구현이 `{SIREN_REPO_PATH}/sheet-host/`에 있다(같은 SpreadJS 17.1.10, 로컬에서 SIREN과 끝까지 검증함).
그 코드를 옮기는 것이 이번 작업이다. **새로 설계하지 말고 옮겨라.**

## 규칙

- 먼저 `git pull`로 최신 `develop`을 받는다. 로컬 체크아웃이 배포본보다 오래됐던 적이 있다.
- **기존 코드를 고치지 않는다.** 특히 `src/pages/spreadSheet/` 아래(기존 `/spreadSheet` 페이지, SFM용
  규약, customRibbon)는 읽기만 한다. 예외는 `src/App.js`에 라우트 한 줄 추가뿐이다.
- **라이선스 키 값은 절대 출력하지 않는다.** 새 파일에 키를 복사하지 말고, 기존
  `src/pages/spreadSheet/licenseKey.js`의 `SpreadJSKey`를 import한다. 다른 비밀 값도 마찬가지다.
- 패키지를 새로 설치하지 않는다. 필요한 것(`@mescius/spread-sheets`, `-react`, `-io` 17.1.10)은 이미 있다.
- 빌드는 확인용으로만 한다. **배포(FTP 업로드)는 하지 않는다** — 사람이 한다.
- 커밋은 새 브랜치에 하고, 푸시·PR 여부는 사용자에게 묻는다.

## 할 일

### 1. 파일 옮기기

`{SIREN_REPO_PATH}/sheet-host/src/sheetHost/`의 파일을 `{SDP_SPA_PATH}/src/pages/sheetHost/`로 옮긴다.

| 참고 구현 | SDP_SPA | 바꿀 것 |
|---|---|---|
| `SheetHost.jsx` | `sheetHost.js` | import 경로의 확장자만. CRA는 `.js` 안의 JSX를 처리한다 |
| `protocol.js` | `protocol.js` | 없음 |
| `grid.js` | `grid.js` | 없음 |
| `gridFormat.js` | `gridFormat.js` | 없음 |
| `seed.js` | `seed.js` | 없음 |
| `allowedOrigins.js` | `allowedOrigins.js` | 아래 2번 |
| `license.js` | `license.js` | import를 `../spreadSheet/licenseKey`로 |

`{SIREN_REPO_PATH}/sheet-host/src/dev/`(개발용 툴바·빈 키)와 `main.jsx`는 옮기지 않는다.

**참고 구현의 동작을 바꾸지 마라.** 특히 아래는 실제로 겪은 문제를 막으려고 넣은 코드다.
- `sheet:save`에서 `toJSON` 결과를 `JSON.parse(JSON.stringify(...))`로 거르는 것 — 안 거르면 postMessage
  복제가 실패하고, SpreadJS가 그 예외를 "Incorrect file format"으로 보고해 원인을 못 찾는다.
- `sheet:ready`를 워크북이 만들어진 뒤(`workbookInitialized` 이후)에 보내는 것.
- 필터 범위를 헤더 **아래**부터 잡는 것(버튼이 범위 바로 위 행에 달린다).
- origin 검사: 부모 창(`event.source === window.parent`) + 허용 목록 + 처음 확인한 origin 고정,
  답장은 그 origin으로만(`'*'` 금지, `sheet:ready`만 예외).

### 2. 허용 origin

`allowedOrigins.js`에 SIREN 운영 origin `https://siren.samsungds.net`을 둔다. 개발용
`http://localhost:5173`은 로컬 확인에 필요하니 남겨 두되, 운영 빌드에서 빼고 싶으면 CRA 환경변수
(`process.env.REACT_APP_...`)로 나누자고 사용자에게 제안만 한다(임의로 바꾸지 않는다).

### 3. 편집 도구 = 기존 customRibbon 재사용

`SheetHost`는 `renderToolbar(spread, mode)` prop으로 편집 도구를 받는다(편집 모드에서만 그린다).
`src/pages/spreadSheet/spreadSheet.js`가 customRibbon을 어떻게 그리고 어떤 props(워크북 인스턴스 등)를
넘기는지 읽고, **같은 방식으로** `renderToolbar`에서 그린다. 새 래퍼 컴포넌트
`src/pages/sheetHost/SheetHostPage.js`를 만들어 거기서 조립한다.

- customRibbon이 SFM 전용 동작(부모 창에 SFM 규약 메시지를 보내는 저장 버튼 등)을 갖고 있으면 그 버튼은
  이 페이지에서 **숨기거나 빼야 한다** — 이 페이지의 부모는 SIREN이고 SFM 규약을 모른다. customRibbon
  자체를 고치지 말고, props/옵션으로 끌 수 있는지 먼저 보고, 안 되면 사용자에게 방법을 물어라.
- 엑셀 가져오기·내보내기·저장 버튼은 SIREN 쪽 화면에 있다. 리본의 엑셀 내보내기 버튼은 남아 있어도 된다.

### 4. 라우트

`src/App.js`의 기존 `/spreadSheet` 라우트 옆에 한 줄:

```jsx
<Route path="/sheet-host" element={<SheetHostPage />} />
```

로그인 가드를 걸지 않는다(iframe 안에서는 서드파티 쿠키가 막힌다). 기존 `/spreadSheet`도 가드가 없다.

### 5. 로컬 확인

1. SDP_SPA를 `npm start`로 띄운다(보통 `http://localhost:3000`).
2. `{SIREN_REPO_PATH}`에서 SIREN을 띄운다 — `api`(3000과 겹치면 PORT를 바꾼다), `calypso`(3010), `web`(5173).
   `web/.env.development`의 `SHEET_HOST_URL`을 `http://localhost:3000/sheet-host`로 바꾼다.
3. SIREN에서 artifact를 "Sheet"(template: Port List)로 만들고 → Edit sheet → 값 입력·붙여넣기·리본 서식 →
   Import/Export Excel → Save as new version → Open sheet(읽기 전용)까지 해 본다.
4. 확인할 것:
   - 개발자 도구 콘솔에 origin 관련 경고·에러가 없다.
   - 저장한 버전에 `.ssjson`, `.grid.json`, `.xlsx` 세 파일이 있다.
   - 읽기 전용에서는 셀이 고쳐지지 않고, 리본이 안 보인다.
   - 기존 `/spreadSheet` 페이지(SFM)가 전과 똑같이 동작한다.

### 6. 보고

아래를 정리해서 알려준다.
- 추가·변경한 파일 목록(경로), 그리고 `src/App.js`의 diff.
- customRibbon을 붙인 방식과, 숨긴 버튼이 있다면 무엇을 어떻게 숨겼는지.
- 로컬 확인 결과(위 4번 항목별).
- 배포 담당자에게 넘길 것: 빌드 명령, 올릴 폴더(`WEBs\SDP_SPA`), 배포 뒤 확인할 것 —
  SIREN 운영 화면에서 편집기를 열었을 때 **SpreadJS 평가판 워터마크·배너가 없는지**(라이선스가 맞지 않아도
  SpreadJS는 멈추지 않고 배너만 띄운다).
- 선택 사항으로 제안만 할 것(직접 하지 않는다): IIS `web.config`에 `Content-Security-Policy:
  frame-ancestors`를 명시해 SIREN을 허용 목록에 두기. 사이트 전체에 걸리므로 SFM_WEB 등 기존에 이 사이트를
  iframe으로 띄우는 모든 origin을 함께 넣어야 한다 — 운영 담당자와 목록을 확정한 뒤에만.

---
