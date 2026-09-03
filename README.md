# SIREN — Sensor(CIS) Design Work flow

CIS(CMOS Image Sensor) 개발의 설계 산출물을 workflow 단위 캔버스 위에서 흐름(flow)으로
관리하고 버전·권한을 통제하는 시스템. 설계서는 [`docs/siren-design-v2.md`](docs/siren-design-v2.md)를
참고한다 — **일정 모델은 그 문서의 「부록 A. v3 개정」이 본문보다 우선한다.**

**산출물의 소유 구조는 [`docs/siren-artifact-hub-design.md`](docs/siren-artifact-hub-design.md)가
v2보다 우선한다.** 산출물의 실물 데이터·버전 이력·접근 판정은 각 산출물 서비스(Hub)가 소유하고,
SIREN은 참조만 관측한다. v2의 "SIREN이 파일과 버전을 직접 보관한다"는 전제는 그 문서로 대체됐다.

## UI 원칙 — 시스템 설명 문구 금지

**모든 페이지에서, UI에 시스템이 무엇인지·어떻게 동작하는지 설명하는 문구를 쓰지 않는다.**
소개 문구, 아키텍처 개념 설명, 사용법 안내, 각 영역이 무엇인지 알려주는 캡션·범례가 모두 해당한다.
데이터(산출물명·버전·날짜·담당자), 상태 표시(`NO SCHEDULE`, `접근 권한 없음`), 컨트롤 라벨,
오류 메시지는 허용한다. 판단 기준은 **"화면에 실제 데이터가 채워졌을 때 그 문구가 여전히 필요한가"** —
필요 없으면 쓰지 않는다. 설명이 필요한 개념은 `docs/`와 `/guide` 페이지에 둔다.
자세한 내용은 [설계서 §14](docs/siren-artifact-hub-design.md#14-ui-원칙).

## 일정 모델 (2026-08 개정)

일정 축이 둘로 갈려 있다. 헷갈리면 이 표만 보면 된다.

| | 소유자 | 어디서 고치나 | 성격 |
|---|---|---|---|
| **마일스톤(milestone)** | 과제(Project) | Project Information → Edit milestones | 과제 공통 일정. 새 workflow의 초기값이자 타임라인/3D 뷰의 날짜축 배경 |
| **Phase** | Workflow | 그 workflow 보드 → Edit phases | workflow마다 완전히 다른 자기 일정. 서로 겹쳐도 된다 |

- workflow를 만들면 마일스톤이 **복사**되어 phase가 된다. 그 뒤로는 독립이라 마일스톤을 고쳐도
  기존 workflow는 안 따라간다.
- 순서는 저장하지 않는다 — 항상 시작일 오름차순이고, 그게 캔버스의 좌 → 우 순서다.
- phase를 지우면 그걸 가리키던 산출물은 **지워지지도 옮겨지지도 않는다.** 캔버스의 원래 자리에
  남아 "릴리즈 일정 없음"으로 표시되고, 산출물 상세의 Release schedule에서 새 phase를 골라야
  다시 일정에 올라온다.

> 이번 세션에는 UI 정본인 `analog-dashboard-v15.html` 목업 파일이 첨부되지 않았다. 캔버스 레이아웃
> 상수(`web/src/lib/layoutConstants.ts`)와 색상 토큰(`web/src/theme/theme.ts`)은 설계서 3장/7.1절의
> 서술을 근거로 합리적인 기본값을 새로 정의한 것이며, 실제 목업을 받으면 두 파일의 값만 교체하면 된다.

## 구조

완전 분리 레포 원칙([A] 응답 기준)을 하나의 저장소 안에서 디렉터리로 구현했다.

```
api/    NestJS + Mongoose 백엔드
web/    Vite + React + TypeScript + MUI 프론트엔드
docs/   설계서, 킥오프 프롬프트
```

`DEPARTMENTS` 같은 FE/BE 공유 상수는 `api/src/common/constants/departments.ts`와
`web/src/shared/constants/departments.ts`에 중복 정의되어 있다. 값을 바꿀 때는 반드시 두 파일을 함께 수정한다.
일정 정렬/검증 규칙도 마찬가지로 `api/src/common/schedule.ts`와 `web/src/lib/schedule.ts`에 각각 있다 —
정렬 기준(시작일 오름차순 → 종료일 → 이름 → id)이 두 쪽에서 어긋나면 캔버스 순서와 저장 순서가 갈린다.

## 실행 방법

### 1) MongoDB (DB 없이 바로 시작하기)

**DB를 아직 구성하지 않았다면 아무것도 안 해도 된다 — 실제 DB에 전혀 연결하지 않는다.**
`.env`의 `MONGODB_URI`가 비어 있으면 `api/`가 순수 인메모리(JS 프로세스 메모리) 데이터 계층으로
동작하며 부팅 시점에 목업 데이터를 자동 시드한다. 네트워크 연결·바이너리 다운로드가 전혀
없다(`src/database/in-memory-driver.ts`). 그냥 `npm run start:dev`만 실행하면 된다.
재시작하면 데이터는 초기화된다.

지속되는 데이터가 필요해지면, 킥오프 프롬프트 [A]에 지정된 개발 DB
(`mongodb://10.172.42.128:27017/`)나 로컬 `mongod`/`docker run -p 27017:27017 mongo:7`을 쓰고
`.env`의 `MONGODB_URI`에 채워 넣는다 — 그러면 `MongooseModule`로 실제 DB에 연결하는 원래 경로로
전환된다.

### 2) API (`api/`)

```bash
cd api
cp .env.example .env   # 기본값은 MONGODB_URI가 비어있음(=DB 연결 없이 인메모리로 자동 시작)
npm install
npm run start:dev       # http://localhost:3000/api/v1 - 인메모리 모드면 목업 데이터 자동 시드
```

인메모리 모드에서는 매 부팅마다 목업이 자동 시드된다
(과제 2개, workflow 6개 — 저마다 다른 phase 목록, 산출물 51개, 그중 2개는 일부러 "일정을 잃은"
상태로 둬서 유실 표시를 바로 확인할 수 있다).

Object Storage(S3) 관련 값은 `.env.example`에 비어 있다 — 개발자가 로컬 환경에서 채워 넣을 값이며,
비어 있는 동안 `storage` 모듈은 `mock://` presigned URL을 반환해 업로드 플로우 개발이 막히지 않게 한다.

### 3) Web (`web/`)

```bash
cd web
cp .env.example .env   # VITE_API_BASE_URL 확인 (기본 http://localhost:3000/api/v1)
npm install
npm run dev              # http://localhost:5173
```

### 4) 로그인 (SSO 대체)

사내 SSO 연동 전까지는 로그인 검사를 생략한다(설계서 1.3). 웹 앱 접속 시 시드된 사용자 목록의
첫 번째 사용자로 자동 로그인되어 바로 보드 화면으로 들어간다. 다른 사용자로 전환하려면
상단바의 사용자 스위처를 쓰면 된다. `// TODO: SSO 연동 지점` 주석이 달린 위치
(`api/src/auth/*`, `web/src/App.tsx`, `web/src/store/authStore.ts`)를 실제 IdP 연동으로 교체하면 된다.

## 권한 재검증 원칙

FE의 `canEdit`류 판정은 UX 게이트일 뿐이며, 모든 쓰기 API와 민감 필드 응답은 BE가 다시 검증한다
(설계서 1.3, 6장). 특히:

- `workflows.owners` 추가 시 대상 사용자의 부서가 `analog`인지 BE가 검증한다 (`api/src/workflows/workflows.service.ts`).
- 산출물 `recvContact` 지정 시 `recvContact.department === recvDept`를 BE가 검증한다
  (`api/src/deliverables/deliverables.service.ts`).
- 산출물 응답은 `toDeliverableDto()` 단일 통로를 거쳐 `workingVersion`(작업중 minor)을
  Edit 권한자에게만 채워 넣는다 (`api/src/deliverables/dto/deliverable.dto.ts`).
