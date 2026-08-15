# ARBOR — 아날로그 산출물 릴리스 플랫폼

CIS(CMOS Image Sensor) 개발의 Analog 영역 산출물을 IP 단위 캔버스 위에서 흐름(flow)으로
관리하고 버전·권한을 통제하는 시스템. 설계서는 [`docs/arbor-design-v2.md`](docs/arbor-design-v2.md)를 참고한다.

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

## 실행 방법

### 1) MongoDB

킥오프 프롬프트 [A]에 지정된 개발 DB(`mongodb://10.172.42.128:27017/`)를 사용한다. 접근 불가능하면
로컬 `mongod` 또는 `docker run -p 27017:27017 mongo:7`로 대체하고 `.env`의 `MONGODB_URI`를 바꾼다.

### 2) API (`api/`)

```bash
cd api
cp .env.example .env   # MONGODB_URI 등 값 확인/수정
npm install
npm run seed            # 목업 데이터 시드 (과제 2개, IP 3개, 산출물 ~31개, HLD 2건)
npm run start:dev       # http://localhost:3000/api/v1
```

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

사내 SSO 연동 전까지는 로그인 화면 대신 "사용자 스위처"를 사용한다(설계서 1.3). 웹 앱 접속 시
시드된 사용자 목록에서 하나를 선택하면 `/auth/dev-login`이 개발용 JWT를 발급한다.
`// TODO: SSO 연동 지점` 주석이 달린 위치(`api/src/auth/*`, `web/src/App.tsx`, `web/src/store/authStore.ts`)를
실제 IdP 연동으로 교체하면 된다.

## 권한 재검증 원칙

FE의 `canEdit`류 판정은 UX 게이트일 뿐이며, 모든 쓰기 API와 민감 필드 응답은 BE가 다시 검증한다
(설계서 1.3, 6장). 특히:

- `ips.owners` 추가 시 대상 사용자의 부서가 `analog`인지 BE가 검증한다 (`api/src/ips/ips.service.ts`).
- 산출물 `recvContact` 지정 시 `recvContact.department === recvDept`를 BE가 검증한다
  (`api/src/deliverables/deliverables.service.ts`).
- 산출물 응답은 `toDeliverableDto()` 단일 통로를 거쳐 `workingVersion`(작업중 minor)을
  Edit 권한자에게만 채워 넣는다 (`api/src/deliverables/dto/deliverable.dto.ts`).
