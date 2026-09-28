# SpreadJS 운영 시스템 조사 프롬프트 (분석 전용)

> 이 문서는 SpreadJS를 이미 쓰고 있는 사내 시스템의 코드를 **데스크톱 Claude Code 세션**이 분석해서,
> SIREN 쪽 작업에 필요한 정보를 모아 오도록 그대로 붙여넣는 프롬프트다. 아래 `---` 사이를 복사해
> 쓰고, `{SPREADJS_PROJECT_PATH}`만 실제 경로로 바꾼다.

---

너는 지금부터 `{SPREADJS_PROJECT_PATH}`에 있는 프로젝트를 **읽기만 해서** 분석한다. 이 프로젝트는
SpreadJS(MESCIUS/GrapeCity 스프레드시트 컴포넌트) 라이선스를 가지고 운영 중인 사내 웹 시스템이다.

## 배경 — 왜 조사하나

다른 사내 시스템 SIREN(과 그 안의 산출물 관리 기능 Calypso)에서 "엑셀처럼 편집하는 표"가 필요하다.
SpreadJS 라이선스는 SIREN 도메인이 아니라 **이 프로젝트가 배포된 도메인**에 묶여 있어서, 계획은
이렇다:

- 이 프로젝트가 배포된 도메인에 SpreadJS만 담은 작은 정적 페이지(가칭 `sheet-host`)를 하나 더 올린다.
- SIREN 화면이 그 페이지를 `<iframe>`으로 띄우고, 둘은 `window.postMessage`로만 데이터를 주고받는다
  (시작 시트 내려주기, 사용자가 편집한 시트 받아오기).
- 저장 형식은 SpreadJS 문서 JSON(`workbook.toJSON()`)과, 그 시트의 셀 값을 격자(2차원 문자열
  배열)로 뽑은 JSON 두 가지다. 엑셀 가져오기/내보내기도 필요하다.

이 계획이 이 프로젝트의 배포 구조·라이선스·보안 설정에서 실제로 가능한지, 가능하다면 어떻게
맞춰야 하는지를 알아내는 게 목적이다.

## 규칙

- **아무 파일도 수정하지 않는다.** 커밋·빌드·배포·패키지 설치도 하지 않는다. 읽기와 검색만 한다.
- **라이선스 키 값 자체는 절대 출력하지 않는다.** 어디에서 어떻게 설정되는지(파일 경로, 변수 이름,
  주입 방식)만 적는다. 다른 비밀 값(토큰·비밀번호·접속 문자열)도 마찬가지로 값은 가리고 위치만 적는다.
- 추측과 확인한 사실을 구분한다. 코드에서 확인한 것은 **파일 경로:줄 번호**를 근거로 붙이고,
  코드만으로 알 수 없는 것은 "확인 불가 — 운영 담당자에게 물어볼 것"으로 따로 모은다.

## 조사 항목

### 1. 프로젝트와 배포 구조
1. 프레임워크와 언어(React/Angular/Vue/바닐라, TypeScript 여부), 빌드 도구(Vite/Webpack/CLI 등)와 버전.
2. 빌드 결과물이 어디로 어떻게 배포되는가 — 배포 스크립트, CI 설정, 웹 서버 종류(IIS/nginx/Apache/
   Node 서버 등), 배포 경로(가상 디렉터리·base path).
3. 이 시스템이 실제로 서비스되는 **도메인/URL**(운영·개발·스테이징 각각). 코드·설정·README·환경
   파일에 나오는 호스트명을 전부 모은다.
4. 이 도메인 아래에 **새 정적 페이지나 새 경로를 추가**하려면 어떻게 해야 하는가 — 라우팅 방식,
   정적 파일 폴더, base href, 웹 서버의 rewrite 규칙(SPA fallback 등). 별도 폴더에 정적 파일을
   두는 것만으로 서비스될지, 기존 앱의 라우트로 넣어야 할지 판단 근거를 적는다.

### 2. SpreadJS 사용 정보
1. `package.json`(과 lock 파일)에서 SpreadJS 관련 패키지를 **전부**, 정확한 버전으로 나열한다 —
   `@mescius/spread-sheets*` 또는 `@grapecity/spread-sheets*`, `-io`, `-designer`, `-designer-resources-*`,
   `-react`/`-angular`/`-vue` 래퍼, `-charts`/`-shapes`/`-print`/`-pdf`/`-barcode`/`-languagepackages`,
   구버전 `@grapecity/spread-excelio` 등. CDN이나 로컬 복사본으로 넣었다면 그 파일 경로와 버전.
2. **라이선스 키 설정 방식** — `GC.Spread.Sheets.LicenseKey`, `Designer.LicenseKey`,
   `spread-excelio`의 `LicenseKey` 등을 어디서(파일·환경변수·서버에서 내려받기·빌드 시 주입) 설정하는지.
   Designer·IO 모듈 라이선스가 따로 있는지, 개발용 키와 운영용 키가 나뉘는지.
3. 라이선스가 묶인 도메인/호스트에 대한 단서(주석, 문서, 환경별 키 분기 등).
4. culture/언어 설정(`GC.Spread.Common.CultureManager` 등), 테마 CSS를 어떻게 불러오는지.

### 3. iframe 임베드 현황 (가장 중요)
1. 이 시스템이 **지금 다른 시스템에 iframe으로 들어가는 방식** — 누가(SIREN 포함) 어떤 URL로 띄우는지,
   쿼리 파라미터, 초기 데이터 전달 방법.
2. `postMessage` 사용 여부와 **메시지 규약 전체** — 메시지 타입 이름, payload 모양, 요청/응답
   상관관계(requestId 등), 준비 완료 신호, 에러 처리. 보내는 쪽과 받는 쪽 코드를 모두 찾는다.
3. origin 검사 — 허용 origin 목록이 어디에 있고 어떻게 관리되는지(`event.origin` 확인 코드,
   `targetOrigin` 값).
4. 응답 헤더 — `X-Frame-Options`, `Content-Security-Policy`(`frame-ancestors`, `script-src`,
   `connect-src`), CORS 설정. 웹 서버 설정 파일(web.config, nginx.conf 등)과 앱 코드 양쪽에서 찾는다.
   SIREN 도메인에서 iframe으로 띄울 수 있게 허용돼 있는지 판단한다.
5. 인증 — iframe 안 페이지가 로그인(SSO·쿠키·토큰)을 요구하는가? 요구한다면 iframe 안에서 어떻게
   인증을 통과하는가(서드파티 쿠키 제약 포함). 로그인 없이 뜨는 공개 경로가 있는가.
6. iframe 속성 — `sandbox`, `allow="clipboard-read; clipboard-write"` 등을 쓰는지, 붙여넣기·파일
   다운로드가 iframe 안에서 동작하는지에 대한 단서.

### 4. SpreadJS 기능 사용 방식 (코드 예시 포함)
각 항목마다 실제 코드 조각(파일 경로:줄 번호)을 붙인다. 안 쓰면 "사용 안 함".
1. Workbook 생성·초기화 코드(옵션 포함).
2. 데이터 저장/불러오기 — `toJSON`/`fromJSON` 사용 여부와 옵션, 저장 대상(서버 API·파일), 크기 제한.
3. 엑셀 가져오기/내보내기 — `spread-sheets-io`(`import`/`export`), 구 `ExcelIO`, 서버 쪽 변환 중 무엇을
   쓰는지, `.xls` 지원 여부.
4. 클립보드 — `clipBoardOptions`, `allowCopyPasteExcelStyle`, 붙여넣기 이벤트 처리.
5. 필터(`RowFilter`/`HideRowFilter`), 정렬, 틀 고정(frozen), 병합 셀, 셀 서식·테두리, 데이터 유효성
   검사, 시트 보호(`isProtected`, `protectionOptions`).
6. 사용하는 이벤트(`CellChanged`, `ClipboardPasted`, `RangeChanged` 등)와 되돌리기(undo) 처리.
7. 대용량 성능 관련 설정(`suspendPaint`/`resumePaint`, `suspendCalcService` 등), 실제로 다루는 최대 행 수.
8. SpreadJS Designer(리본 UI) 사용 여부.

### 5. 제약
1. 지원 브라우저, 빌드 산출물 크기, SpreadJS 지연 로딩 여부.
2. 이 프로젝트 배포에 새 파일을 올릴 때 필요한 절차·권한(누가, 어떤 승인으로).

## 결과 보고 형식

아래 순서의 마크다운 보고서 하나로 답한다.

1. **요약** — 아래 두 질문에 대한 결론부터:
   - 이 도메인에 SIREN용 페이지(`sheet-host`)를 **새로 올릴 수 있는가?** 올린다면 어떤 방식(정적 폴더/
     기존 앱 라우트)이 맞는가?
   - 서비스 **도메인 주소**와 **SpreadJS 패키지 이름·정확한 버전**은?
2. 조사 항목 1~5별 결과(근거 파일 경로:줄 번호 포함).
3. 기존 postMessage 규약이 있다면 그 전체 명세(메시지 표: 방향 / type / payload / 응답).
4. 최소 초기화 코드 예시 — 라이선스 설정 ~ Workbook 생성 ~ `fromJSON`/`toJSON`까지, 이 프로젝트 방식
   그대로(키 값은 `<LICENSE_KEY>`로 가린다).
5. SIREN이 iframe으로 띄울 때 **막히는 것**(헤더·인증·origin·라이선스)과 풀 방법.
6. 확인 불가 항목과 운영 담당자에게 물어볼 질문 목록.

---
