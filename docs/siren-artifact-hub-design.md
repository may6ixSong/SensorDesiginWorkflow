# SIREN 산출물 Hub 아키텍처 설계서 v1

> **문서 목적** — SIREN의 역할을 "산출물 데이터의 소유자"에서 **"산출물 서비스들을 관장하는 오케스트레이터"**로 재정의하고, 실제 산출물이 등록·버전관리되는 창구(Hub)를 어떻게 구성·운영할지 규정한다.
> **작성일** — 2026-09-03

---

## 0. 이 문서의 위치

`siren-design-v2.md`(부록 A 포함)와의 관계는 다음과 같다.

| 구분 | 상태 |
|---|---|
| **이 문서가 대체하는 것** | v2 §3.5(버전 규칙 일부), §3.11(망 구분의 저장 책임), §4.6(`deliverables.versions[]`가 실물 파일/스토리지 키를 소유한다는 전제), §4.10(auditLogs 범위), §5.4(SIREN이 업로드 URL을 발급하고 버전을 받는다는 전제) |
| **여전히 유효한 것** | v2 §3.2 Phase 규칙, §3.7 캔버스 배치, §3.9 Flow 규칙, §3.10 HLD Release의 **표시 규칙**, 부록 A 전체(Workflow 일정 모델, orphan 처리, incoming 배치) |
| **핵심 변경 한 줄** | 산출물의 **실물 데이터·버전 이력·접근 판정은 각 산출물 서비스가 소유**하고, SIREN은 **참조(ref)만 관측**한다. |

시각 자료로 `siren-orchestration-map.html`(리포지터리 루트, main에 있음)이 이 구조를 3D로 보여준다. 대문 페이지 재설계(§14)의 시각적 기준이기도 하다.

---

## 1. 아키텍처 개요

### 1.1 역할 재정의

```
                    ┌──────────────────────────────────────┐
                    │  SIREN  (오케스트레이션 · 관측)        │
                    │  보관: 노드 위치 · flow · phase        │
                    │        버전 ref · Release 스냅샷        │
                    │  소유: 프로젝트 공통 데이터             │
                    │        (부서 · 멤버 · 일정)             │
                    └──────────────────────────────────────┘
                        ↑ 관측                    ↓ 공용 데이터
              (버전 ref · 링크 · 변경 이벤트)   (부서 · 멤버 · 일정)
                        │                          │
      ┌─────────────────┴──────────────────────────┴─────────────────┐
      │                         Hub                                   │
      │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
      │  │ Calypso  │  │  SimHub  │  │   SSM    │  │ LayoutDB │ ... │
      │  │ (내장 #0)│  │          │  │          │  │          │     │
      │  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
      │  각 서비스가 소유: 실물 파일 · 전체 버전 이력 · 접근 판정      │
      └───────────────────────────────────────────────────────────────┘
```

### 1.2 절대 타협하지 않는 두 원칙

1. **SIREN은 산출물의 실물 바이트를 소유하지 않는다.** 파일은 그 산출물을 담당하는 서비스에 있고, SIREN은 참조와 링크만 갖는다.
2. **권한 판정은 항상 BE에서 재검증한다.** (v2 §1.3의 원칙을 그대로 승계) FE의 마스킹은 UX 게이트일 뿐이다.

---

## 2. 용어

| 용어 | 정의 |
|---|---|
| **Hub** | SIREN이 관장하는 산출물 서비스들의 집합, 그리고 그것을 등록·관리하는 레지스트리 |
| **산출물 서비스(Artifact Service)** | 산출물의 실물 데이터와 버전 이력을 실제로 소유하는 개별 시스템. Calypso, SimHub, SSM 등 |
| **Calypso** | Word/Excel 등 단순 파일형 산출물을 위해 **새로 구축하는** 서비스. Hub 레지스트리의 첫 번째 항목(내장 서비스 #0)이자 Observer 계약의 레퍼런스 구현 |
| **어댑터(Adapter)** | 이미 운영 중이라 Observer 계약을 직접 말하지 못하는 시스템을, 계약 모양으로 번역해주는 얇은 계층. 데이터를 소유하지 않는다 |
| **Observer 계약** | SIREN과 산출물 서비스 사이의 인터페이스. 이 문서 §4 |
| **통합 티어(Tier)** | 그 버전 기록을 SIREN이 얼마나 자동으로·검증 가능하게 알 수 있는지의 등급(A/B/C/D). §5 |
| **giver** | 그 산출물을 **만들어 제공하는** 쪽. 전체 버전(working 포함)을 볼 수 있는 유일한 대상 |
| **Workflow Release** | 워크플로우 단위 릴리스. 그 시점 각 산출물의 버전 ref를 얼려 스냅샷으로 박는다 (기존 HLD Release) |

---

## 3. Hub 운영 모델

### 3.1 Hub는 "레지스트리 + 서비스들"이다

Hub는 하나의 배포 단위가 아니다. **SIREN 안의 서비스 레지스트리**와, **각자 독립적으로 운영되는 산출물 서비스들**의 조합이다. 산출물을 워크플로우에 등록할 때 사용자는 이 레지스트리에서 서비스를 고른다 — 기존의 자유 입력 `docType`(word/excel/path) 방식은 폐기한다.

### 3.2 서비스 레지스트리 스키마

```ts
// SIREN이 소유. 새 컬렉션 `artifactServices`
{
  _id: ObjectId,
  key: string,              // "calypso" | "simhub" | "ssm" — 불변 식별자
  name: string,             // 화면 표시명
  contractVersion: string,  // "1.0" — 이 서비스가 구현한 Observer 계약 버전
  defaultTier: "A" | "B" | "C" | "D",
  transport: "http" | "shared-db" | "none",
  baseUrl: string | null,   // transport=http일 때 어댑터/서비스 엔드포인트
  viewUrlTemplate: string | null,   // "https://ssm.local/spec/{artifactId}"
  embedUploadUrlTemplate: string | null,  // null이면 링크-아웃으로 폴백
  isBuiltIn: boolean,       // Calypso만 true
  enabled: boolean,
  createdAt, updatedAt
}
```

- `key`는 **절대 바뀌지 않는다.** 산출물이 이 값으로 서비스를 참조하므로, 이름이 바뀌어도 key는 유지한다.
- `transport: "none"`은 C/D 티어 전용(연동 없이 링크나 수동 기록만).
- `embedUploadUrlTemplate`이 null이면 SIREN은 자동으로 링크-아웃 동작으로 폴백한다. 서비스가 임베드를 지원하지 않는 것은 **정상 상태**이며 결함이 아니다.

### 3.3 레포·배포 분리 기준

| 대상 | 레포 | 근거 |
|---|---|---|
| **SIREN** (api + web) | 현행 유지 (`SensorDesiginWorkflow`) | 오케스트레이션 본체 |
| **SimHub** | **분리** | 자체 도메인 로직·저장소·배포 주기를 가진 실서비스 |
| **SSM · LayoutDB 등 기존 시스템** | 각자 기존 레포 유지 | 이미 독립 운영 중 |
| **Calypso** | **레포는 분리 안 함** — `SensorDesiginWorkflow` 안에 `web/`·`api/`와 동급인 새 최상위 폴더(가칭 `calypso/`) | 실무 판단: 초기엔 하나의 레포로 관리하는 운영 부담이 더 싸다 |
| **어댑터** | 대상 시스템 레포 우선, 불가하면 SIREN 레포 내 별도 모듈 | 아래 3.4 참조 |

**분리 판단 기준 한 줄** — *자체 저장소를 갖고 자기 배포 주기로 도는가?* 그렇다면 분리한다. 순수 번역만 하고 상태가 없다면 어디에 두든 무방하다.

**Calypso는 이 기준으로 보면 분리 후보이지만, 의도적인 예외다.** FE는 여전히 §11.4의 원칙대로 SIREN과 별개 화면/경로로 두되(다른 실서비스들과 상호작용 패턴을 맞추기 위해), 레포·배포는 같은 저장소 안 별도 폴더로 시작한다 — 코드는 분리하되 저장소 관리 부담은 늘리지 않는 절충이다. 나중에 Calypso의 배포 주기가 SIREN 본체와 실제로 갈리기 시작하면 그때 레포를 떼어내면 된다 — 폴더로 시작해도 `web/`·`api/`와 동급으로 독립된 `package.json`·자체 `.env`를 갖추면(§3.7) 분리 자체는 언제든 기계적으로 가능하다.

**단, 물리적 위치와 무관하게 계약 경계는 반드시 지킨다.** SIREN 레포 안에 어댑터 모듈이나 Calypso 폴더를 두더라도, 다른 코드가 그 모듈/폴더의 서비스 클래스를 직접 import 해서는 안 되고 항상 Observer 계약과 동일한 인터페이스(HTTP)로만 호출한다. 이 규칙이 깨지면 나중에 프로세스를 떼어낼 때 그 지름길들을 전부 걷어내야 한다.

### 3.4 계약 명세의 소유와 배포

레포가 갈리므로 계약 정의가 여러 곳에 흩어질 위험이 있다. 규칙:

- **계약의 정본은 이 문서 §4와, SIREN 레포의 `docs/observer-contract-v1.yaml`(OpenAPI)이다.**
- 각 서비스/어댑터 레포는 이 명세를 참조해 자체 구현한다. 공유 npm 패키지는 **당분간 만들지 않는다** — 사내 레지스트리 운영 부담이 이득보다 크다. (기존 프로젝트도 `DEPARTMENTS` 상수를 api/web에 중복 정의하는 방식을 택하고 있다 — README 참조)
- 계약이 바뀌면 `contractVersion`을 올리고, SIREN은 **구버전 서비스를 계속 지원한다.** 하드 컷오버는 하지 않는다.

### 3.5 새 서비스 온보딩 절차

1. 서비스(또는 어댑터)가 §4의 필수 엔드포인트를 구현한다.
2. **Admin 전용 레지스트리 관리 페이지**(§13.4)에서 항목을 추가한다.
3. 테스트 산출물 하나를 그 서비스에 매핑해 버전이 캔버스에 뜨는지 확인한다.
4. 문제없으면 해당 서비스의 `enabled`를 켠다.

기존에 C/D 티어로 수동 관리되던 산출물이 이 서비스로 승격되어도 **기존 기록은 그대로 보존된다** (§5.3).

### 3.6 운영 책임 분담

| 항목 | 책임 |
|---|---|
| 실물 파일 저장·백업·수명주기 | 각 산출물 서비스 |
| 버전 이력의 정확성 | 각 산출물 서비스 |
| 산출물 데이터 접근 판정(다운로드 가능 여부) | 각 산출물 서비스 |
| 부서·멤버·일정 공용 데이터 | **SIREN** |
| 워크플로우 구조(노드·flow·phase) | **SIREN** |
| Workflow Release 스냅샷 | **SIREN** |
| 계약 명세 관리 | **SIREN** |

### 3.7 OA망 파일형 산출물의 오브젝트 스토리지

Calypso를 포함해 아직 별도 서비스로 시스템화되지 않은 OA망 파일형 산출물은, SIREN api가
이미 쓰고 있는 오브젝트 스토리지 설정 패턴을 그대로 따른다 — 새로 발명하지 않는다.

`api/.env.example` 기준 기존 키 그대로:

```
S3_URI=
S3_BUCKET_NAME=
S3_FOLDER=            # 버킷 내 prefix. SIREN 본체는 siren-dev/siren, Calypso는 별도 prefix
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
```

Calypso는 레포를 분리하지 않지만(§3.3), `calypso/` 폴더 자체가 `web/`·`api/`와 동급으로
독립된 배포 단위이므로 자체 `.env.production`/`.env.development`를 따로 갖고 같은 키 이름으로
값을 채운다. `S3_FOLDER`만 SIREN 본체와 구분되는 값을 써서, 같은 오브젝트 스토리지를 쓰더라도
네임스페이스는 분리한다 — 이것이 "실물 파일은 각 서비스가 소유한다"는 원칙(§1.2)을
자격증명·prefix 레벨에서도 지키는 방법이다.

---

## 4. Observer 계약 v1

### 4.1 VersionRecord — 모든 티어가 공유하는 정규화 형태

```ts
interface VersionRecord {
  artifactId: string;        // 그 서비스 안에서의 식별자
  versionRef: string;        // 불변 참조. Release 스냅샷이 이 값을 고정한다
  versionLabel: string;      // 표시용 자유 문자열. "v1.2", "2026-09-02-rev3" 등
  isReleased: boolean;       // 가시성 판정은 오직 이 필드로만 한다
  createdAt: string;         // ISO8601
  giver: {                   // 이 버전을 만들어 제공한 쪽
    knoxId: string | null;   // 개인 식별이 가능하면 채운다
    dept: string | null;     // 부서 단위로만 알 수 있으면 여기만 채운다
  };
  sourceRefs: Array<{        // lineage — 이 버전이 무엇으로부터 만들어졌는가
    artifactKey: string;
    serviceKey: string;
    versionRef: string;
    versionLabel: string;
    capturedAt: string;
  }>;
  viewUrl: string | null;
}
```

**설계 결정 두 가지를 명시한다.**

- **`versionLabel`은 자유, `isReleased`는 강제.** major.minor 규칙(§6)은 SIREN이 직접 만드는 서비스(Calypso)에만 강제하고, 기존 시스템은 자기 넘버링 체계를 그대로 쓴다. 대신 "이게 릴리스인가"만 정확히 신고하면 전체 가시성 규칙이 깨지지 않는다.
- **`sourceRefs`는 만든 쪽이 자기신고한다.** SIREN의 캔버스 edge는 "A→B 연결이 있다"는 구조 정보일 뿐이고, "이 v1.2가 정확히 어느 입력 버전으로 만들어졌는지"는 생성 시점에 그 서비스만 안다. SIREN이 edge와 현재 버전을 조합해 추론하지 않는다.

### 4.2 엔드포인트 — 필수

| Method | Path | 응답 |
|---|---|---|
| GET | `/artifacts/{artifactId}/current-version` | `VersionRecord` |
| GET | `/artifacts/{artifactId}/versions` | `VersionRecord[]` (최신순) |

`transport: "shared-db"`인 서비스(B 티어)는 이 엔드포인트 대신 §8의 테이블에 같은 필드를 쓴다. **의미 계약은 같고 전송 수단만 다르다.**

### 4.3 엔드포인트 — 선택

| Method | Path | 용도 | 없으면 |
|---|---|---|---|
| GET | `{embedUploadUrl}` | 산출물 하나로 스코프된 축소 업로드 화면(iframe 임베드용) | 링크-아웃으로 폴백 |
| POST | `{SIREN}/api/v1/hub/events/version` | 버전 변경을 SIREN에 push | SIREN이 주기 polling |

**별도의 `role`/`access` 엔드포인트는 두지 않는다.** giver 판정은 `VersionRecord.giver`와 SIREN이 소유한 멤버 데이터를 비교해 SIREN 내부에서 계산한다. 계약 표면을 하나 줄이고, 모든 티어에서 동일하게 동작한다. (실물 파일 다운로드 권한은 별개로, 여전히 각 서비스가 자기 화면에서 재검증한다.)

### 4.4 SIREN이 제공하는 공용 데이터 (반대 방향)

```
GET /api/v1/hub/common?projectId={id}
→ {
    members:  [{ knoxId, name, dept }],
    departments: [...],
    schedule: { milestones: [...], workflowPhases: [{ workflowId, phases: [...] }] }
  }
```

- 각 서비스는 필요한 것만 골라 쓴다. 권한 화면의 담당자 후보 목록에는 `members`를, 자체 마감 관리에는 `schedule`을 쓴다.
- **이 API가 SIREN을 사실상 사내 신원·일정 공급자로 만든다.** SIREN 가용성이 각 서비스의 권한 화면에 영향을 준다는 뜻이므로, 각 서비스는 이 응답을 짧게 캐시하고 SIREN이 응답하지 않을 때 마지막 캐시로 동작해야 한다.
- HPC망 서비스는 이 API를 직접 못 부르므로 §8의 공용 DB를 통해 같은 데이터를 받는다.

### 4.5 계약 버전 관리

- 모든 응답에 `X-Observer-Contract: 1.0` 헤더를 싣는다.
- SIREN은 레지스트리의 `contractVersion`과 실제 응답 헤더가 다르면 **거부하지 않고 경고 로그만 남긴다.** 연동이 조용히 끊기는 것보다 낫다.

---

## 5. 통합 신뢰도 4단계

### 5.1 티어 정의

| 티어 | 이름 | SIREN이 아는 것 | 전형적 대상 |
|---|---|---|---|
| **A** | Live | 버전·giver를 동기 조회. 임베드 업로드 가능 | Calypso, 계약을 맞춘 SimHub |
| **B** | Synced | 버전·giver가 자동 갱신되나 이벤트 시점 기준 | HPC 생성 → 공용 DB 경유 산출물 |
| **C** | Linked | 자동 갱신 없음. 링크만 있고 버전은 사람이 입력 | 시스템은 있으나 미연동, 미채택 부서 |
| **D** | Attested | 시스템 자체가 없음. 출처를 자유 텍스트로 기록 | 팀·회사 밖에서 생성되는 산출물 |

### 5.2 망 구분은 별개 축이다

`network: OA | HPC`(v2 §3.11)는 티어와 **직교한다.** HPC망이면 실물 파일 대신 경로 문자열만 갖는다는 규칙은 A~D 어느 티어에나 그대로 겹쳐 적용된다. 예: B 티어이면서 HPC망이면, 버전은 자동 갱신되지만 여전히 경로만 보관한다.

#### 5.2.1 버전 개념이 없는 HPC 경로형 산출물

HPC망 산출물 중에는 원천 시스템에 애초에 `major.minor` 같은 버전 개념이 없고 **경로(path) 하나만
있는 경우**가 흔하다(원본 생성 서비스가 그런 넘버링을 안 쓰는 경우). 이 경우 버전을 억지로 만들지
않고, 다음을 대체값으로 쓴다.

```
versionLabel = 그 path 문자열 (또는 basename)
versionRef   = "{path}@{registeredAt}"   // registeredAt = SIREN이 그 경로를 등록/관측한 시각(ISO8601)
```

같은 경로가 나중에 다른 내용으로 재사용돼도(파일이 그 자리에서 덮어써지는 경우), `registeredAt`이
다르면 다른 `versionRef`가 되므로 Release 스냅샷의 불변 참조 요구(§6.3)는 유지된다. `isReleased`는
이 경우에도 giver가 명시적으로 신고해야 한다 — path와 timestamp만으로는 릴리스 여부를 추론하지
않는다. 이 규칙으로 §17(구 버전)의 "C/D 산출물의 Release 참여 여부" 질문도 해소된다 — 버전이
없는 산출물도 이 대체값으로 정상적으로 Release에 참여한다.

### 5.3 티어는 산출물이 아니라 **버전 엔트리의 속성**이다

이 설계에서 가장 중요한 결정이다.

```ts
versions: [
  { versionLabel: "v1.0", tier: "D", assertedBy: "hong.gd", createdAt: "2026-03-01" },
  { versionLabel: "v1.1", tier: "D", assertedBy: "hong.gd", createdAt: "2026-05-14" },
  { versionLabel: "v2.0", tier: "A", serviceKey: "simhub",  createdAt: "2026-09-01" },  // 실연동 시작
]
```

- 산출물의 "현재 티어"는 **가장 최근 엔트리의 티어**다.
- 나중에 실연동이 붙어도 예전 수동 기록은 지우거나 옮기지 않는다. 그냥 다음 엔트리가 다른 티어로 찍힐 뿐이다.
- **따라서 티어 승격에 마이그레이션 로직이 필요 없다.** 전환 시점은 `ARTIFACT_SERVICE_LINKED` 감사 로그로 표시된다.

---

## 6. 버전 · Release 정책

### 6.1 버전 넘버링

- `major.minor`. 업로드 = minor +1 (최초 `v0.1`), Release = major +1 · minor 0.
- **이 규칙은 SIREN이 직접 만드는 서비스에만 강제한다.** 기존 시스템은 자기 체계를 유지하되 `isReleased`만 정확히 신고한다.

### 6.2 버전 가시성 — 산출물 단위 판정

| 열람자 | 볼 수 있는 것 |
|---|---|
| 그 산출물의 **giver** | 전체 버전 (working 포함) |
| 그 외 **전원** (받는 부서 포함) | `isReleased: true`인 버전만 |

**이 판정은 워크플로우 전체 Edit/View 플래그가 아니라 산출물 하나하나마다 이뤄진다.** 같은 캔버스 안에서 노드 A는 전체 버전이 보이고 노드 B는 릴리스만 보이는 상태가 동시에 존재한다. SIREN BE는 캔버스 응답을 조립할 때 노드마다 giver 여부를 계산해 필드를 마스킹하며, 이 변환은 **단일 통로 함수**(기존 `toDeliverableDto()` 패턴)를 반드시 거친다.

### 6.3 Workflow Release 스냅샷

- Release 시점에 각 산출물의 `versionRef`를 **얼려서** 저장한다. 이후 그 서비스가 버전을 더 올려도 과거 Release는 그때 그 버전을 계속 가리킨다.
- **`versionRef`는 불변이어야 한다.** 각 서비스는 이미 참조된 버전을 삭제·덮어쓰기하지 않는다(최소 soft-delete).
- 스냅샷에는 각 항목의 **티어와 신뢰도 표식을 함께 저장**한다. C/D 항목은 몇 달 뒤에 열어봐도 "시스템이 확인한 게 아니라 담당자가 수동 입력한 것"임이 남는다.
- **마스킹은 스냅샷 시점이 아니라 열람 시점 기준으로 매번 재판정한다.** 그 사이 giver 권한을 받은 사람은 과거 Release도 새 기준으로 본다.
- 데이터가 아예 없는 산출물(§9.2)은 공란으로 표시하되, "릴리스 안 됨"과 "출처 미등록"을 라벨로 구분한다.

---

## 7. 권한 모델

### 7.1 두 겹 구조

| 층 | 소유 | 내용 |
|---|---|---|
| **워크플로우 구성 권한** | SIREN | 캔버스 편집, 노드 추가/삭제, flow 연결, phase 관리 |
| **산출물 데이터 접근** | 각 산출물 서비스 | 실물 파일 다운로드·열람 판정 |
| **버전 가시성** | SIREN (계산) | giver 여부에 따른 working/release 마스킹 (§6.2) |

### 7.2 View 전사 오픈

워크플로우 View를 전사에 열 수 있다. 이 경우:
- 권한 없는 사용자도 **노드의 존재·이름·phase·flow는 본다.**
- 버전 라벨·`versionRef`·링크·파일은 **응답에서 제외**한다(BE 마스킹). FE가 숨기는 것으로는 부족하다.
- 캔버스와 상세 다이얼로그 양쪽에 "접근 권한 없음" 상태를 명시적으로 렌더한다.

---

## 8. B 티어 — HPC↔OA 공용 DB 동기화

### 8.1 전제

HPC망과 OA망이 함께 접근하는 양방향 DBaaS가 이미 구축되어 있다. SIREN 주 DB와는 분리되어 있다.

### 8.2 방향별 테이블 분리

두 방향이 같은 테이블에 쓰면 충돌하므로 반드시 분리한다.

| 테이블 | 쓰는 쪽 | 읽는 쪽 | 내용 |
|---|---|---|---|
| `hpc_events` | HPC 서비스 | SIREN | generate/release 이벤트. §4.1 필드와 동일 형태 + giver |
| `siren_common` | SIREN | HPC 서비스 | 부서·멤버·일정 (§4.4와 동일 내용) |

### 8.3 원본 스키마를 직접 읽지 않는다

SIREN이 상대 시스템의 운영 테이블을 직접 조회하면, 그쪽이 스키마를 바꿀 때 조용히 깨지거나 잘못된 값을 읽는다. **각 팀은 계약 모양에 맞춘 전용 "수출 테이블"을 따로 채운다.** 이것이 HTTP 엔드포인트를 대신하는 인터페이스다.

### 8.4 동기화 방식 — 방향마다 다르다

| 방향 | 방식 | 근거 |
|---|---|---|
| `hpc_events` → SIREN | **체크포인트 커서** (`updatedAt > lastCheckpoint`인 row만) | 계속 쌓이는 이벤트 스트림 |
| SIREN → `siren_common` | **전체 스냅샷 덮어쓰기** | 양이 적고 변경이 드물다. 델타는 한 번만 놓쳐도 drift가 누적되지만 전체 교체는 자체 치유된다 |

### 8.5 구현·운영

- **SIREN NestJS 백엔드 안의 스케줄 모듈**로 둔다(`api/src/hub/sync/`). SIREN 자신의 컬렉션을 읽고 쓰므로 별도 프로세스로 뺄 이유가 없다.
- 모든 쓰기는 **idempotent(upsert)** — 한 주기 실패해도 다음 주기에 자동 복구된다.
- 실패 시 **반드시 로그·알림**을 남긴다. 이 채널은 요청-응답처럼 실패를 즉시 알 수 없어, 조용히 오래 벌어질 수 있다.
- 주기 기본값 **5분**. B 티어는 애초에 실시간이 아니므로 무리해서 줄이지 않는다.
- 내보낼 공용 데이터는 **HPC 쪽이 실제로 쓰는 최소 부분집합만** 담는다.

### 8.6 알려진 한계

`giver` 정보는 마지막 generate/release 이벤트 시점 기준이다. 새 버전 이벤트 없이 담당자만 바뀌면(조직 이동 등) 다음 이벤트까지 옛 giver가 남는다. **SIREN 쪽에서 수동 override를 걸 수 있는 예외 경로를 둔다.**

### 8.7 환경 변수

이 공용 DB 주소는 암호화되어 있지 않다 — SIREN 주 DB의 `DB_CONNECTION`(AES 암호문, §api/.env.example)과
달리, 평문 주소로 바로 접속한다. `api/.env.example`에 키만 추가해두고 실제 값은 채우지 않는다 — 값은
운영자가 각 `.env.production`/`.env.development`에 직접 넣는다.

```
# --- HPC-OA 공용 DB (B 티어 동기화, §8) ---
# 암호화되지 않은 평문 주소. DB_CONNECTION(AES)과는 별개 취급.
HPC_OA_SHARED_DB_URI=
```

컬렉션명은 아직 확정하지 않는다. 아래 8.8의 이름은 자리표시자(placeholder)이며, 실제 신청 시 바뀔 수 있다.

### 8.8 인프라 신청 체크리스트

이 공용 DB는 사내 인프라가 제공하는 서비스라, **컬렉션 생성을 사전에 신청해야 새로 쓸 수 있다.**
신청 후에는 그 주소에 바로 write하면 된다. 지금 이 설계가 요구하는 컬렉션은 정확히 둘이다 — 그 이상
늘어나면 이 표를 갱신해서 다시 알린다.

| 컬렉션(placeholder명) | 쓰는 쪽 | 읽는 쪽 | 신청 상태 |
|---|---|---|---|
| `hpc_events` | HPC 쪽 서비스 | SIREN | 신청 필요 |
| `siren_common` | SIREN | HPC 쪽 서비스 | 신청 필요 |

**주의 — 이 신청 절차는 이 공용 DB에만 해당한다.** SIREN 자체 MongoDB(`artifactServices`,
`hubSyncCheckpoints` 등 §10.3)는 기존처럼 Mongoose가 자동 생성하며 별도 신청이 필요 없다.

---

## 9. C/D 티어 가드레일

### 9.1 문제와 접근

C/D는 SIREN이 그 산출물의 실제 버전 상태를 전혀 못 본다. 따라서 major.minor·working/released 구분 같은 규칙을 "지키라고 강제"하는 것은 성립하지 않는다. **해결책은 규칙 강제가 아니라, 이것이 검증된 사실이 아니라 주장임을 기록에 영구히 남기는 것이다.**

### 9.2 세 가지 가드레일

1. **쓰기 권한을 등록 당사자로 좁힌다.** 그 산출물의 수동 기록은 이를 등록한 본인 또는 그 워크플로우의 owner만 수정할 수 있다. (기존 `sourceDept`/`sourceContact` 필드 패턴 활용 — v2 부록 A.8)
2. **append-only.** 수정은 덮어쓰기가 아니라 새 엔트리로 남는다. 실제 산출물의 진짜 이력은 검증 못 해도, "누가 언제 뭐라고 주장했는지"만큼은 추적 가능해야 한다.
3. **`asserted, not verified` 표식을 Release 스냅샷에도 영구 저장한다** (§6.3).

### 9.3 view 권한은 C/D에서 의미가 없다

working/released 구분 자체가 SIREN 눈에 안 보이므로 숨길 것도 없다. **C/D에서 통제해야 할 것은 오직 쓰기(주장) 권한이다.**

---

## 10. SIREN 데이터 모델 변경

### 10.1 `deliverables` 변경

```ts
{
  // ... 기존 필드 유지 (projectId, workflowId, phaseId, name, artifactKey, layout, recvDept ...)

  // 신규 — 서비스 매핑. 등록 시점에 정하지 않아도 된다 (§11)
  serviceKey: string | null,          // artifactServices.key 참조
  externalArtifactId: string | null,  // 그 서비스 안에서의 id

  // 변경 — versions[] 엔트리 구조
  versions: [{
    tier: "A" | "B" | "C" | "D",

    versionLabel: string,             // 자유 문자열
    isReleased: boolean,              // 가시성 판정의 유일한 근거
    versionRef: string | null,        // A/B는 서비스가 준 불변 ref, C/D는 null

    giverKnoxId: string | null,
    giverDept: string | null,

    sourceRefs: [...],                // §4.1
    viewUrl: string | null,

    // C/D 전용
    assertedBy: string | null,        // 수동 입력자 KnoxID
    assertedAt: Date | null,

    // A/B 전용
    observedAt: Date | null,          // SIREN이 이 값을 관측/동기화한 시각

    createdAt: Date,
  }],
}
```

**제거되는 것** — `storageKey`, `fileName`(실물 파일이 서비스로 이관), `major`/`minor`/`kind`(→ `versionLabel` + `isReleased`). `hpcPath`는 §5.2에 따라 유지한다.

**`docType`와 `artifactKey`도 폐기한다.** `docType`(자유 문자열로 "이게 뭔 산출물이냐"를 표시하던 필드)은
`serviceKey`가 더 정확하게 그 역할을 하므로 남겨둘 이유가 없다. `artifactKey`(v2 §8.1 로드맵에서
"언젠가 외부 시스템이 이 값으로 매핑해줄 것"을 전제로 만든 안정적 식별자)도 `serviceKey` +
`externalArtifactId`가 정확히 그 역할을 대신하므로 같은 이유로 폐기한다. 두 필드 모두 새로 설계된
타입에는 자리가 없다 — 이전 필드를 신경 쓸 필요 없이 §10.1의 새 구조를 그대로 따른다.

**`Deliverable`은 그 workflow 캔버스에서의 placement이지, 산출물 그 자체가 아니다.** `serviceKey` +
`externalArtifactId`가 같은 Deliverable 문서가 서로 다른 `workflowId` 아래 여러 개 존재할 수 있다
(§11.4) — 같은 Hub 산출물이 같은 department의 여러 workflow에 동시에 걸리는 경우가 그렇다. 이
문서들은 각자 다른 `phaseId`·`layout`을 갖지만 `versions[]`가 가리키는 실체(그 서비스의 버전
이력)는 하나다.

### 10.2 `hldReleases` 변경

`items` 각 항목에 다음을 추가한다.

```ts
{
  versionRef: string | null,
  versionLabel: string,
  tier: "A" | "B" | "C" | "D",
  confidence: "verified" | "asserted",   // C/D는 항상 asserted
  pinnedAt: Date,
}
```

### 10.3 신규 컬렉션

- `artifactServices` — §3.2
- `hubSyncCheckpoints` — §8.4의 커서 보관 (`{ tableName, lastCheckpoint, lastRunAt, lastError }`)

### 10.4 기존 `deliverables` 데이터 변환 규칙

실제로 등록된 산출물이 아직 하나도 없다 — 지금 `deliverables`에 있는 문서들은 실질적으로
**유휴 상태**다. 그러니 기존 `versions[]` 안의 값을 정교하게 보존·변환할 이유가 없다. §11의
"정상 빈 상태"(노드는 있되 출처 미등록) 그대로 리셋하면 된다.

**Deliverable 문서마다:**

| 필드 | 처리 |
|---|---|
| `docType` | 삭제 |
| `artifactKey` | 삭제 |
| `serviceKey` | `null`로 신규 추가 |
| `externalArtifactId` | `null`로 신규 추가 |
| `versions` | **`[]`로 초기화** — 기존 항목의 `major`/`minor`/`kind`/`storageKey`/`fileName` 등은 변환하지 않고 그대로 버린다 |
| 그 외(`projectId`, `workflowId`, `phaseId`, `name`, `network`, `intent`, `series`/`seriesIdx`/`seriesTotal`, `recvDept`/`recvContact`, `recvWorkflowId`, `sourceDept`/`sourceContact`, `layout`, `createdBy`, `isMock`) | 그대로 유지 — 캔버스 위 노드로서의 정체성(이름·위치·flow 연결 대상)은 살아있는 데이터이므로 건드리지 않는다 |

**건드리지 않는 컬렉션** — `hldReleases`, `auditLogs`, `projects`, `workflows`, `memos`, `edges`.

**주의** — 이 변환 이후에는 `deliverables` 컬렉션의 실제 문서 모양이 지금 배포된 앱 코드(Mongoose
스키마)가 기대하는 모양과 달라진다. 이건 의도된 상태다 — 데이터 먼저, 코드는 별도 작업에서
따라온다(§18). 그 사이 기간에 앱이 이 컬렉션을 정상적으로 못 읽을 수 있다.

---

## 11. 산출물 등록 UX

**캔버스에 노드를 추가하는 것과, 그 산출물의 데이터 출처를 정하는 것은 완전히 분리한다.**

1. 노드 생성 시점에는 이름·phase·flow만 있으면 된다. `serviceKey: null`, `versions: []`인 상태가 **정상 상태**다.
2. 출처 지정(등록된 서비스 매핑 / C·D 수동 등록)은 산출물 상세에서 **언제든 나중에** 하는 별개 액션이다.
3. 빈 상태 노드는 캔버스에서 "출처 미등록"으로 명시적으로 표시한다. 이는 phase를 잃은 산출물을 지우지 않고 `NO SCHEDULE`로 표시하는 기존 패턴(v2 부록 A.3)과 같은 철학이다.

이렇게 해야 "아직 모든 산출물을 시스템에 넣지 않은" 현실에서도 워크플로우 구성이 막히지 않는다.

### 11.4 Calypso 산출물 — Hub가 등록, workflow가 선택

**Hub가 먼저다.** Hub(Calypso)는 그 자체로 산출물 등록 시스템이고, workflow는 거기 이미
등록된 산출물 중에서 **골라 쓰는 쪽**이다. §11.1–11.3의 "SIREN에 노드가 먼저, 출처는 나중"
순서를 뒤집는 게 아니라 — 출처가 이미 Hub에 있을 때는 그 "출처 지정" 단계가 곧 "Hub에서
선택"이 되는 것뿐이다. Hub가 특정 workflow로 밀어넣는 게 아니다.

1. 사용자가 Calypso에서 파일을 등록할 때는 **project + department**만 지정한다. **workflow는
   지정하지 않는다** — Hub는 workflow 개념을 모른다.
2. SIREN의 산출물 "출처 지정" 단계(§11 step 2)에 **"등록된 산출물에서 선택"** 경로를 추가한다.
   그 project + 그 workflow의 department로 스코프된 Hub 산출물 목록에서 고른다.
3. 고르면 그 workflow에 새 Deliverable(placement)이 만들어진다 — `serviceKey: "calypso"`,
   `externalArtifactId`가 그 자리에서 채워지고, Tier A라 버전이 바로 보인다(§11의 "빈 상태"
   단계를 건너뛴다). phase·캔버스 좌표는 다른 산출물과 똑같이 사용자가 놓는 자리에서 정해진다.
4. **같은 Hub 산출물을 같은 department의 다른 workflow에서도 똑같이 선택할 수 있다.** 각
   workflow에는 별도의 Deliverable(placement) 레코드가 생기지만, `(serviceKey,
   externalArtifactId)`가 같으므로 버전 이력·giver는 공유한다. 이건 새 규칙이 아니라 §1.2·§10.1의
   "Deliverable은 참조이지 실물이 아니다" 원칙을 그대로 따른 것뿐이다 — 지금까지는 그 참조가
   workflow 하나에만 걸린다고 암묵적으로 가정했을 뿐, 막을 이유가 없었다.
5. 한 workflow에서 그 placement를 삭제해도 Hub의 원본 산출물이나 다른 workflow에 걸린 placement는
   영향받지 않는다 — `DELIVERABLE_DELETE`는 그 workflow의 참조 하나만 지운다.

**format 검증은 하지 않는다.** 모든 산출물 형식을 plugin으로 지원하는 건 시간이 오래 걸리므로,
그 전까지 Calypso에 올리는 파일의 종류·이름은 **사용자가 자유롭게 정의**한다. 형식별 검증·플러그인
인터페이스는 §16 로드맵 이후 과제로 남긴다.

---

## 12. Audit log 범위 축소

워크플로우는 대시보드다. 노드 하나 만들고 flow 하나 잇는 것까지 감사 로그를 남길 필요는 없다. **버전과 접근 권한에 관한 것만 남긴다.**

### 12.1 유지

| Action | 근거 |
|---|---|
| `RELEASE`, `HLD_RELEASE` | 핵심 versioning 이벤트 |
| `MANUAL_VERSION_ASSERT` **(신규)** | C/D 가드레일의 전제 (§9.2) |
| `ARTIFACT_SERVICE_LINKED` **(신규)** | 티어 전환 시점 표시 (§5.3) |
| `IMPERSONATION_START` **(신규)** | 보안상 필수 (§13) |
| `DELIVERABLE_DELETE` | 데이터 소실 |
| `WORKFLOW_OWNER_ADD`, `WORKFLOW_OWNER_REMOVE` | 접근 권한 변경 |
| `PROJECT_MANAGER_ADD`, `PROJECT_MANAGER_REMOVE` | 접근 권한 변경 |
| `PROJECT_MEMBER_ADD`, `PROJECT_MEMBER_REMOVE` | 공용 데이터이자 권한 판정의 근거 |

### 12.2 제거

`DELIVERABLE_CREATE`, `VERSION_UPLOAD`, `WORKFLOW_CREATE`, `WORKFLOW_UPDATE`, `WORKFLOW_PHASES_UPDATE`, `WORKFLOW_VIEW_GRANT_ADD/REMOVE`, `RECV_UPDATE`, `LAYOUT_UPDATE`, `EDGE_ADD`, `EDGE_DELETE`, `FILE_DOWNLOAD`, `PROJECT_MEMBER_DEPARTMENT_ADD`, `PROJECT_UPDATE`, `PROJECT_MILESTONES_UPDATE`, `PROJECT_DEPARTMENTS_UPDATE`, `WORKFLOW_DOMAIN_SET`

> `VERSION_UPLOAD`와 `FILE_DOWNLOAD`는 정책적으로 뺀 게 아니라 **구조상 사라진다.** 업로드와 다운로드가 모두 각 산출물 서비스에서 일어나므로 SIREN이 관측할 사건이 아니다.

### 12.3 사내 플랫폼 로그와의 관계

사내 플랫폼 로깅과 연동하되, **SIREN 자체 `auditLogs`는 유지한다.** 플랫폼 로그는 SIREN 전용 액션 단위로 구조화되어 있지 않고, SIREN이 되읽어야 하는 조회 요구(예: C/D 산출물의 "누가 언제 이 버전을 주장했는지")를 충족하지 못한다. 플랫폼 로그는 교차 확인용 보조 자료로 둔다.

---

## 13. Admin 전용 기능 (사용자 시뮬레이터 · 레지스트리 관리)

### 13.1 목적

권한이 워크플로우별·산출물별로 갈리므로, 같은 부서 안에서도 사용자마다 보이는 화면이 다르다. 버그 진단 시 Admin이 **특정 사용자의 화면 상태를 그대로 재현**할 수 있어야 한다. 테스트·진단 전용이며 데이터 수정을 목적으로 하지 않는다.

### 13.2 구현 지점

`api/src/common/actor.ts`의 `resolveActor()`가 유일한 변경 지점이다. 이 파일에는 이미 "추후 헤더 대신 IdP 토큰을 검증하도록 바꾼다"는 TODO가 있으며, 시뮬레이터는 그 검증 위에 얹힌다.

```ts
interface Actor {
  knoxId: string;          // 권한 계산에 쓰이는 유효 신원
  realKnoxId: string;      // 실제 호출자 (감사 로그용)
  isImpersonating: boolean;
  isAdmin: boolean;        // realKnoxId 기준. ADSSO 토큰의 User.Group 클레임에서 뽑는다
}
```

### 13.3 규칙 — 타협 불가

1. **실제 호출자는 검증된 자격증명에서만 얻는다.** ADSSO 연동 후에는 서명된 토큰에서 뽑는다. 클라이언트가 보낸 평문 필드를 실제 신원으로 신뢰하지 않는다.
2. **override는 검증된 실제 호출자가 Admin일 때만 반영한다.** 이 검증이 빠지면 아무 사용자나 요청 필드를 바꿔 다른 사람 행세를 할 수 있고, §6.2·§7.2의 마스킹이 전부 무력화된다. **읽기 전용이라는 사실은 방어가 되지 않는다** — 마스킹 규칙 자체가 읽기를 막는 규칙이기 때문이다.
3. **Admin 판정은 ADSSO 토큰의 `User.Group` 클레임에서 직접 한다.** 별도로 관리하는 admin 목록을 SIREN이 두지 않는다 — `resolveActor()`가 토큰을 검증하는 그 자리에서 `User.Group`을 같이 읽어 `isAdmin`을 채운다. 사내 플랫폼에 전체 admin KnoxID 목록을 돌려주는 `{USER_GROUP_API}/user/admins`(응답: `string[]`)도 있지만, 지금은 필요 없다 — 상호 검증이나 감사용으로 나중에 붙일 수 있는 대안으로만 문서화해둔다.
4. **감사 로그에 실제 행위자와 시뮬레이션 대상을 구분해 남긴다** (`actorKnoxId: admin, meta.actingAs: X`).
5. **화면에 시뮬레이션 상태 표시가 항상 떠 있어야 한다** — Admin이 자기 권한과 착각하지 않도록. (이는 §14.1의 예외로, 시스템 설명이 아니라 **현재 상태 표시**다.)
6. **FE도 자기 몫을 한다.** BE 재검증이 최종 방어선이라고 해서 FE가 손을 놓는다는 뜻은 아니다 — 사용자 시뮬레이터·레지스트리 관리(§13.4) 두 Admin 전용 화면 모두, web이 로그인 시 받은 `User.Group`을 보고 (a) 해당 페이지로 가는 네비게이션 항목 자체를 non-admin에게는 렌더하지 않고, (b) 라우트 진입 시에도 route guard로 차단해 URL 직접 접근도 막는다. 이건 BE 검증을 대신하지 않는다 — URL을 알거나 API를 직접 두드리면 여전히 BE의 `isAdmin` 재검증(규칙 2, 3)이 최종 방어선이다. FE 차단은 실수 방지와 매끄러운 UX를 위한 것이고, 없어도 보안이 뚫리지는 않지만 있어야 정상적인 제품이다.

### 13.4 Admin 레지스트리 관리 페이지

`artifactServices`(§3.2) 등록을 seed 스크립트가 아니라 **Admin 전용 화면**으로 관리한다. §13.3의
Admin 판정(ADSSO `User.Group`)을 그대로 게이트로 쓴다 — 별도 권한 체계를 만들지 않는다.

- 최소 기능: 서비스 추가/비활성화, `key`·`contractVersion`·`transport`·`baseUrl`·
  `viewUrlTemplate`·`embedUploadUrlTemplate` 편집.
- `key`는 생성 후 수정 불가(§3.2) — 편집 화면에서도 읽기 전용으로 렌더한다.
- 이 화면 자체는 §14.1의 "컨트롤 라벨"에 해당하므로 설명 문구 없이, 레지스트리에 실제로 있는
  데이터(등록된 서비스 목록과 그 필드값)만 보여준다.

---

## 14. UI 원칙

### 14.1 시스템 설명 문구 금지 — 모든 페이지에 적용

**UI에는 시스템이 무엇인지, 어떻게 동작하는지 설명하는 문구를 쓰지 않는다.** 대문 페이지뿐 아니라 앞으로 구현하는 모든 페이지에 예외 없이 적용한다.

금지하는 것:
- "SIREN은 ~하는 시스템입니다" 류의 소개 문구
- 아키텍처 개념 설명(관측 흐름, 소유 경계, 티어 개념 등)
- 기능 사용법 안내 문구, 각 영역이 무엇인지 알려주는 캡션
- 범례·주석 형태로 붙는 개념 해설

허용하는 것:
- 데이터 자체(산출물명, 버전, 날짜, 부서명, 담당자)
- 상태 표시(`NO SCHEDULE`, `접근 권한 없음`, `출처 미등록`, 시뮬레이션 중 표시)
- 컨트롤 라벨(버튼·탭·입력 필드의 이름)
- 오류 메시지(무엇이 잘못됐고 어떻게 고치는지)

> 판단 기준 — **화면에 실제 데이터가 채워졌을 때 그 문구가 여전히 필요한가?** 필요 없다면 쓰지 않는다. 설명이 필요한 개념은 문서(`docs/`)와 `/guide` 페이지에 둔다.

### 14.2 권한에 따른 렌더

마스킹된 필드는 **빈 값이 아니라 명시적 상태**로 그린다(`접근 권한 없음`). 데이터가 없는 것과 볼 수 없는 것은 다르다.

### 14.3 My Task 필터 — 목록 페이지 필수 기능

워크플로우 목록도, 각 Hub 서비스의 산출물/job 목록도 시간이 지나면 한 화면에 다 보기 힘들 만큼
많아진다. **SIREN과 모든 Hub 서비스(Calypso 포함)의 목록 페이지는 "내가 owner이거나 편집 권한이
있는 것만" 걸러 보는 필터를 필수로 갖는다.**

- **SIREN 워크플로우 목록** — 그 workflow의 `owners`(Edit 권한자, v2 §3.3)에 내 KnoxID가 있는 것만.
- **각 Hub 서비스의 자기 목록** — 그 서비스가 스스로 정의하는 "만들었거나 편집 권한이 있는 것"
  기준. Calypso라면 최소한 `giver == 나`(내가 등록한 산출물)가 그 기준이 된다 — Calypso에
  다중 편집자 개념이 생기면 그때 넓히면 된다.
- 이 필터는 SIREN이 대신 계산해주는 게 아니라 **각 서비스가 자기 목록에서 직접 구현**한다 — 오케스트레이션과 무관한, 각 서비스 자신의 화면 책임이다.
- 기본값은 **꺼짐(전체 보기)**으로 시작한다 — 처음 방문했을 때 자기 항목이 하나도 없어서 빈 화면을
  보는 것보다는, 켜고 끄는 토글이 눈에 잘 띄는 게 낫다. 이 토글은 §14.1의 "컨트롤 라벨"에 해당하므로
  이름표만 있으면 되고 별도 설명 문구는 없다(예: `My Task`라는 라벨 자체로 충분).

---

## 15. Home 대문 페이지 재설계

### 15.1 배경

SIREN의 역할이 "워크플로우 대시보드"에서 "산출물 서비스 오케스트레이터"로 바뀌었으므로, 대문도 그 구조를 보여줘야 한다.

### 15.2 시각적 기준

**`siren-orchestration-map.html`(리포지터리 루트, main에 있음)의 3D 모델링 부분만 가져온다.**

가져오는 것:
- perspective 카메라와 Z축 3단 구성 — 바닥의 불투명한 서비스 슬랩, 중간 계층, 위에 뜬 반투명 SIREN 판
- 서비스 슬랩의 재질 표현(솔리드·그림자·전면 rim)과 SIREN 판의 글래스 표현
- 슬랩에서 SIREN 판으로 올라가는 빔, 반대 방향 빔
- 드래그·방향키 궤도 회전, 반응형 스케일 계산
- 다크 팔레트 구성 방식(단, 앱의 라이트/다크 테마 토큰에 맞춰 재매핑)

**전부 버리는 것:**
- 상단 설명 문구, thesis 카피, 범례
- `관측 흐름 / Release 스냅샷`, `권한 있는/없는 사용자` 토글
- 하단 "경계 확인" 패널, "세 가지 소유 규칙" 패널, 표기 주의 각주
- 슬랩·노드 안의 개념 설명 텍스트(`버전 이력 · 이 안에서 관리` 같은 캡션)

§14.1에 따라 **대문에는 개념 설명이 한 줄도 남지 않는다.**

### 15.3 대문에 남는 것

- 3D 씬 (서비스 슬랩 + SIREN 판 + 빔)
- 슬랩에 표시되는 **실제 데이터**: 서비스명, 산출물명, 현재 버전 라벨, 연동 상태
- `SIREN` 워드마크와 `SENSOR DESIGN WORKFLOW` 서브 라인 (기존 유지)
- `View Projects` CTA (기존 유지)

### 15.4 데이터 소스

현재 `web/src/config/heroServices.ts`의 하드코딩 목록을 **`artifactServices` 레지스트리 조회로 교체**한다. 대문이 실제 Hub 상태를 반영하게 된다. 레지스트리가 비었거나 조회에 실패하면 3D 씬은 슬랩 없이 렌더하고, 설명 문구를 대신 띄우지 않는다.

### 15.5 구현 메모

- 기존 `HomePage.tsx`의 lane plate + floating card + 워드마크 구조를 §15.2의 3단 Z-stack으로 교체한다.
- `CircuitBackdrop`은 유지 여부를 구현 시 판단한다(3D 씬과 시각적으로 충돌하면 제거).
- 카메라 레이어 아래 중간 래퍼에 `opacity`/`filter`를 걸면 3D가 평면으로 눌린다(v2 부록 A.6). 흐림은 잎 요소에 직접 준다.
- 빔은 `rotateX(90deg)`로 세운 리본 두 장을 교차시켜 입체감을 낸다. 부호를 반대로 주면 빔이 바닥 아래로 뻗는다.
- `prefers-reduced-motion`에서 빔 애니메이션을 정지한다.

---

## 16. 구현 로드맵

| 단계 | 내용 | 산출물 |
|---|---|---|
| **1** | Observer 계약 v1 확정 | `docs/observer-contract-v1.yaml`, 레지스트리 스키마 |
| **2** | Calypso 구축 (레퍼런스 구현) | 같은 레포 `calypso/` 폴더. 필수+선택 엔드포인트 전부 구현 |
| **3** | SIREN Hub 모듈 | 레지스트리 CRUD, 범용 Observer client, 버전 마스킹 단일 통로, 데이터 모델 마이그레이션 |
| **4** | SimHub 연동 (A 티어 실증) | SimHub 레포 분리 + 계약 구현. **여기서 계약의 빈틈이 드러난다 — v1.1 개정을 예상한다** |
| **5** | B 티어 sync job | `api/src/hub/sync/`, 공용 DB 수출/수입 테이블 |
| **6** | C/D 수동 등록 UI + 가드레일 | 등록 당사자 제한, append-only, 신뢰도 표식 |
| **7** | Admin 시뮬레이터 | `resolveActor()` 교체 |
| **8** | Home 대문 재설계 | §15 |

**4단계에서 계약이 깨지는 것을 정상으로 본다.** 우리가 만들지 않은 시스템에 처음 붙여보는 시점이므로, 어댑터 하나로 마찰을 먼저 찾는 것이 목적이다. 나머지 시스템 확산은 그 이후다.

---

## 17. 미결정 사항

### 17.1 해결됨 (2026-09-03)

| 항목 | 결정 |
|---|---|
| OA망 파일형 산출물의 스토리지 | 기존 `api/.env` S3 설정 패턴 그대로, `S3_FOLDER`만 분리 (§3.7) |
| HPC 공용 DB 스키마 생성 권한 | 사내 인프라에 사전 신청 필요. 필요 컬렉션 §8.8에 확정 |
| Admin 판정 방식 | ADSSO 토큰의 `User.Group` 클레임 (§13.3) |
| 버전 없는 HPC 경로형 산출물 | `path@registeredAt`을 버전 대체값으로 사용 (§5.2.1) — C/D 저신뢰도 산출물의 Release 참여 문제도 이걸로 해소 |
| `sourceRefs` 필수 여부 | 선택 필드로 확정. 없으면 빈 배열 (§4.1) |
| 레지스트리(`artifactServices`) 관리 방식 | Admin 전용 관리 페이지 (§13.4) — seed 스크립트 아님 |
| Calypso 산출물이 workflow에 뜨는 방식 | **Hub가 먼저 등록, workflow는 거기서 선택** — Hub는 project+department 스코프만 알고 workflow 개념을 모른다. 같은 산출물이 같은 department의 여러 workflow에 동시에 걸릴 수 있다 (§11.4) |
| Calypso 배포 인프라 | 별도 결정 사항 아님 — 이미 운영 중인 다른 서비스와 같은 배포 방식을 그대로 쓴다. 스토리지는 §3.7(할당된 S3 자원)로 이미 정함 |

### 17.2 남은 것

지금은 없음. 새로 열리는 대로 이 절에 추가한다.

---

## 18. 기존 데이터 마이그레이션 — CLI 세션 실행 지시문

이 절은 **이 설계서가 최종 확정된 뒤에만** 실행한다. 아래 블록은 그때 Claude Code CLI 세션에
**그대로 붙여넣을 지시문**이다 — 지금 실행하는 게 아니라 나중에 쓸 명령을 여기 박아두는 것뿐이다.

> **작업 범위: `deliverables` 컬렉션의 기존 문서를 `docs/siren-artifact-hub-design.md` §10.4의
> 규칙에 맞게 데이터만 고친다.** 실제 등록된 산출물이 없는 유휴 상태이므로, 기존 `versions[]`를
> 정교하게 변환하는 게 아니라 §11의 "정상 빈 상태"로 리셋하는 작업이다.
>
> **절대 규칙 — 하나라도 어기면 작업을 멈추고 보고할 것:**
>
> 1. **애플리케이션 코드는 단 한 줄도 건드리지 않는다.** `api/src/**`, `web/src/**`의 어떤 파일도
>    수정·생성·삭제하지 않는다. Mongoose 스키마 파일(`deliverable.schema.ts` 등)도 포함이다 —
>    코드는 이번 작업 범위가 아니고, 별도의 후속 작업에서 다룬다.
> 2. **DB 접속은 앱의 Mongoose 모델을 거치지 않는다.** 지금 앱 스키마는 여전히 옛 필드
>    (`major`/`minor`/`kind`/`storageKey`/`fileName`/`docType`/`artifactKey`)를 기대하므로,
>    앱 모델로 저장하면 검증에 걸리거나 의도와 다르게 동작할 수 있다. 원시 MongoDB 드라이버(또는
>    `mongosh`)로 직접 접속해서 처리한다.
> 3. **변환에 스크립트가 필요하면 임시 파일로 작성해서 실행한 뒤, 작업이 끝나면 그 스크립트
>    파일을 반드시 삭제한다.** 리포지터리에 마이그레이션 스크립트를 남기지 않는다.
> 4. **`git add`, `git commit`, `git push`를 포함해 어떤 git 쓰기 명령도 실행하지 않는다.**
>    이건 특히 중요하다 — **절대 커밋하지 않는다.** 이 작업은 데이터베이스 안의 문서만 바꾸는
>    것이지, 리포지터리에 남는 변경사항이 아니어야 한다(스크립트 자체도 규칙 3에 따라 지워지므로
>    커밋할 대상이 애초에 남지 않는다).
> 5. 작업 전후로 대상 문서 수와 변환된 필드 요약을 보고한다(예: "총 N개 Deliverable, M개 버전
>    엔트리 변환 완료"). 실패한 문서가 있으면 어떤 문서인지, 왜 실패했는지 구체적으로 보고하고
>    나머지는 계속 진행한다.
>
> **참고** — 인메모리 모드(`.env`의 `MONGODB_URI`/`DB_CONNECTION`이 비어있는 상태)로 떠 있다면
> 옮길 데이터가 없다(재시작하면 초기화되는 목업뿐). 실제 영속 DB에 연결된 상태에서만 의미가 있다.
