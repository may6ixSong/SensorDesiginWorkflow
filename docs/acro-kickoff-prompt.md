# ACRO 프로젝트 킥오프 프롬프트

> 사용법: 아래 **[A] 작성 구역**을 직접 채운 뒤, 이 파일 전체를 새 세션에 붙여넣으세요.
> 프로젝트 지식(Project Knowledge)에는 `acro-design-v2.md`와 `analog-dashboard-v15.html`을 함께 올려두세요.

---

## [A] 작성 구역 — 아래 빈칸을 채워주세요

```
[프로젝트 기본 정보]
- 프로젝트/레포 이름:
- 모노레포 여부 (하나의 레포에 FE/BE 둘 다 vs 완전 분리 레포 2개):
- 사용 언어/패키지 매니저 (예: pnpm, npm, yarn):
- Node.js 버전:

[개발 환경 주소]
- FE Dev 서버 포트 (예: 5173):
- BE Dev API Base URL (예: http://localhost:3000/api/v1):
- MongoDB 연결 문자열 (예: mongodb://localhost:27017/acro):
- Object Storage(S3 or 사내 호환) Endpoint:
- Object Storage Bucket명:
- Object Storage Access Key / Secret 관리 방식 (예: .env, Vault, AWS Secrets Manager):

[인증/SSO]
- 사내 SSO 방식 (OIDC / SAML / 사내 자체 게이트웨이 / 기타):
- SSO 발급기관(IdP) URL:
- 로컬 개발 시 SSO 우회 방식 (예: 목업 로그인, 고정 토큰):

[공통 플랫폼 서비스] (있다면 기입, 없으면 "없음"으로 표기)
- 사내 조직도/HR API 주소 (부서/사용자 정보 동기화용):
- 사내 알림(메일/메신저) 서비스 주소:
- 사내 파일 뷰어/미리보기 서비스 주소:
- 기타 연동 필요 서비스:

[배포/인프라] (초기 개발 단계에서 불필요하면 "미정"으로 표기)
- 컨테이너 레지스트리:
- 배포 환경 (Kubernetes / VM / 기타):
- CI/CD 도구:

[기타 제약사항]
- 코딩 컨벤션/린터 규칙 (예: ESLint 기본, Prettier, 특정 스타일 가이드):
- 브라우저 지원 범위:
- 기타 특이사항:
```

---

## [B] 지시사항 — 이 아래는 수정하지 말고 그대로 사용하세요

너는 지금부터 **ACRO**(아날로그 산출물 릴리스 플랫폼)의 FE/BE 소스코드를 처음부터 구축한다.

### 참조 자료
- **`acro-design-v2.md`** — 데이터 모델, API 계약, 권한 정책, 도메인 규칙의 정본. 여기 명시된 규칙(특히 3장 도메인 규칙, 6장 권한 재검증)은 임의로 바꾸지 말고 그대로 구현할 것.
- **`analog-dashboard-v15.html`** — UI/UX의 정본. 색상 토큰(CSS 변수), 레이아웃 상수(`NW`, `NH`, `LANE_PAD`, `GRID`, `ZOOM_MIN/MAX` 등), 캔버스 인터랙션(드래그, 줌/팬, Phase 벽 저항, Auto Fit 알고리즘, flow 하이라이트, 순환 아이콘)은 이 파일의 동작을 그대로 재현해야 한다. 이 파일은 순수 HTML/CSS/JS 단일 파일 목업이므로, React 컴포넌트로 옮길 때 로직을 1:1로 이식하되 컴포넌트 구조·타입 안정성·재사용성은 개선해도 좋다.

### 프로젝트 구조
[A]에서 답한 모노레포 여부에 따라 아래 중 하나로 구성한다.

**모노레포인 경우**
```
acro/
├── apps/
│   ├── web/     (FE)
│   └── api/     (BE)
├── packages/
│   └── shared/  (DEPARTMENTS 상수, 공통 타입 등 FE/BE 공유)
└── package.json
```

**완전 분리인 경우**
```
acro-web/   (FE 레포)
acro-api/   (BE 레포)
```
이 경우 `DEPARTMENTS` 등 공유 상수는 양쪽에 중복 정의하되 값이 반드시 일치하도록 주석으로 출처를 명시한다.

### 기술 스택 (고정 — 변경하지 말 것)
- **FE**: Vite + React 18 + TypeScript. 서버 상태는 TanStack Query, 클라이언트 전용 상태(줌/팬/편집모드/드래그)는 Zustand.
- **BE**: NestJS + TypeScript + Mongoose(MongoDB).
- **Object Storage**: S3 호환, presigned URL 방식.

### 책임 분담 원칙 (반드시 지킬 것)
1. **캔버스 렌더링, 배치 계산, Auto Fit, flow 탐색, HLD diff 계산은 전부 FE에서 완결**한다. BE는 이 계산 결과를 그대로 저장하는 역할만 한다(설계서 5.5절 참조).
2. **단, 권한 판정은 반드시 BE에서 다시 검증**한다. FE가 화면에서 minor 버전을 숨기는 것과 별개로, BE API 응답 자체가 권한 없는 필드를 내려주지 않아야 한다. 이 원칙은 설계서 1.3절 및 6장에 명시되어 있으니 반드시 준수한다.
3. Edit 권한(`ips.owners`)에 사용자를 추가할 때 그 사용자의 부서가 `analog`인지 **BE가 검증**한다. FE 셀렉트 박스에서 후보를 필터링하는 것은 UX 편의일 뿐, 실제 방어는 BE에 있어야 한다.

### 작업 순서 요청
1. 먼저 위 프로젝트 구조로 두 앱의 스캐폴딩(package.json, tsconfig, 기본 폴더 구조, .env.example)을 만들고 보여줘.
2. BE의 Mongoose 스키마(설계서 4장)를 코드로 옮기고, seed 스크립트로 목업과 동일한 예시 데이터(과제 1~2개, IP 3개, 산출물 30여 개, HLD 스냅샷 몇 개)를 넣어줘.
3. BE API(설계서 5장)를 구현하고, 6장의 Guard/DTO 마스킹 로직을 포함해줘.
4. FE는 목업 HTML의 화면 단위로 컴포넌트를 쪼개 구현하고(설계서 7.1절 컴포넌트 트리 참고), TanStack Query로 BE와 연동해줘.
5. 각 단계마다 전체 소스코드를 보여주고, 실행 방법(`.env` 채우는 법 포함)을 함께 안내해줘.

### [A]의 값 적용
[A]에서 채운 개발 환경 주소·인증 방식·공통 플랫폼 정보를 각각 `.env.example`, BE의 설정 모듈(`ConfigModule`), FE의 `import.meta.env` 참조 등 적절한 위치에 반영해줘. SSO 연동은 [A]에서 "로컬 개발 시 SSO 우회 방식"으로 답한 대로, 실제 IdP 연동 전까지는 그 우회 방식으로 인증을 목업하고, 실제 연동 지점은 주석으로 `// TODO: SSO 연동 지점` 표시해줘.

공통 플랫폼 서비스(조직도 API 등)를 "없음"으로 답했다면, 해당 기능은 지금 단계에서 스킵하고 `users` 컬렉션을 직접 관리하는 것으로 구현해줘.

이제 위 순서대로 시작해줘.
