# SIREN — Sensor(CIS) Design Workflow

CIS(CMOS Image Sensor) 개발의 설계 산출물을 workflow 단위 캔버스 위에서 흐름(flow)으로
관리하고, 부서 단위로 전달(**release**)하는 시스템.

> **설계서 정본은 [`docs/`](docs/) 다. 반드시 [`docs/README.md`](docs/README.md)부터 읽는다.**
>
> 이전의 `docs/siren-design-v2.md` · `docs/siren-artifact-hub-design.md` ·
> `docs/siren-kickoff-prompt.md` 는 **v3 개정으로 폐기**되었다. 그 문서들에만 있던 규칙은
> 새 설계서가 다시 정의하지 않는 한 효력이 없다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/README.md](docs/README.md) | 개요 · 용어 · **확정 결정 요약** · 미결 사항 |
| [docs/01-permissions.md](docs/01-permissions.md) | Project → Workflow → Artifact 3계층 권한 |
| [docs/02-data-model.md](docs/02-data-model.md) | 스키마 · API 계약 |
| [docs/03-canvas.md](docs/03-canvas.md) | 캔버스 · 편집 lock · flow · 필터 |
| [docs/04-artifact-and-publish.md](docs/04-artifact-and-publish.md) | Tier A~D · publish · recipient |
| [docs/05-release.md](docs/05-release.md) | Release 절차 · 알림 · history |
| [docs/06-ui-motion-and-migration.md](docs/06-ui-motion-and-migration.md) | 모션 · i18n · HLD 제거 · 마이그레이션 |
| [docs/observer-contract-v1.yaml](docs/observer-contract-v1.yaml) | 외부 서비스 연동 계약 (유지) |
| [docs/prompts/](docs/prompts/) | 연동 서비스·작업 지시용 프롬프트 |

## 용어 — release vs publish

이 저장소 전체에서 두 단어를 아래처럼 고정해 쓴다. 코드·UI·DB 필드명 어디에서도 어기지 않는다.

| 용어 | 주체 | 뜻 |
|---|---|---|
| **release** | Workflow | 산출물들을 **각 수신 부서에게 전달**하는 행위 |
| **publish** | Artifact | 산출물 하나가 자기 서비스 안에서 **공식 버전을 확정**하는 행위 |

## 일정 모델

일정 축이 둘로 갈려 있다.

| | 소유자 | 어디서 고치나 | 성격 |
|---|---|---|---|
| **마일스톤(milestone)** | 과제(Project) | Project Information → Edit milestones | 과제 공통 일정. 새 workflow의 초기값 |
| **Phase** | Workflow | 그 workflow 보드 → Edit phases | workflow마다 완전히 다른 자기 일정 |

- workflow를 만들면 마일스톤이 **복사**되어 phase가 된다. 그 뒤로는 독립이다.
- 순서는 저장하지 않는다 — 항상 시작일 오름차순이며, 그게 캔버스의 좌 → 우 순서다.
- phase를 지우면 그걸 가리키던 산출물은 지워지지도 옮겨지지도 않는다. 원래 자리에 남아
  "일정 없음"으로 표시된다.

## 구조

```
api/    NestJS + Mongoose 백엔드
web/    Vite + React + TypeScript + MUI 프론트엔드
docs/   설계서, 연동 계약, 프롬프트
```

FE/BE 공유 상수는 양쪽에 중복 정의되어 있다. 값을 바꿀 때는 **반드시 두 파일을 함께** 고친다
(목록은 [docs/02-data-model.md §8](docs/02-data-model.md)).

## 실행 방법

### 1) MongoDB (DB 없이 바로 시작하기)

`.env` 의 `MONGODB_URI` 가 비어 있으면 `api/` 가 순수 인메모리 데이터 계층으로 동작하며 부팅 시점에
목업 데이터를 자동 시드한다. 네트워크 연결이나 바이너리 다운로드가 전혀 없다
(`src/database/in-memory-driver.ts`). 재시작하면 데이터는 초기화된다.

지속되는 데이터가 필요하면 개발 DB나 로컬 `mongod` / `docker run -p 27017:27017 mongo:7` 을 쓰고
`.env` 의 `MONGODB_URI` 에 채워 넣는다.

### 2) API (`api/`)

```bash
cd api
cp .env.example .env
npm install
npm run start:dev       # http://localhost:3000/api/v1
```

Object Storage(S3) 관련 값은 `.env.example` 에 비어 있다 — 비어 있는 동안 `storage` 모듈은
`mock://` presigned URL을 반환해 업로드 플로우 개발이 막히지 않게 한다.

### 3) Web (`web/`)

```bash
cd web
cp .env.example .env    # VITE_API_BASE_URL 확인 (기본 http://localhost:3000/api/v1)
npm install
npm run dev             # http://localhost:5173
```

### 4) 로그인 (SSO 대체)

사내 SSO 연동 전까지는 로그인 검사를 생략한다. 웹 앱 접속 시 시드된 사용자 목록의 첫 번째
사용자로 자동 로그인되며, 상단바의 사용자 스위처로 다른 사용자로 전환할 수 있다.
`// TODO: SSO 연동 지점` 주석이 달린 위치(`api/src/auth/*`, `web/src/App.tsx`,
`web/src/store/authStore.ts`)를 실제 IdP 연동으로 교체하면 된다.

## 절대 타협하지 않는 두 가지

1. **권한 재검증** — FE의 `canEdit` 류 판정은 UX 게이트일 뿐이다. 모든 쓰기 API와 민감 필드
   응답은 BE가 다시 검증하며, 마스킹은 단일 통로 함수를 반드시 거친다
   ([docs/01-permissions.md §5](docs/01-permissions.md)).
2. **Admin은 언제나 super 권한** — 문서에 따로 안 써 있어도 Admin은 모든 규칙을 통과한다.
   유일한 예외는 "workflow 소속 부서의 Edit Access 항목 삭제" 하나뿐이다.
