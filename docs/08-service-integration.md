# 08. 새 서비스 연동 — API 레퍼런스

> **이 문서 하나만 보면 새 OA Service/HPC Service를 SIREN에 연동할 수 있어야 한다.** SIREN이
> 그 서비스에 거는 호출(Observer 계약)과, 그 서비스가 SIREN에 거는 호출(이벤트 push, 공용
> 데이터 조회) 양쪽을 한 파일에 모았다. 더 깊은 설계 배경이 필요하면 `04-artifact-and-publish.md`
> (§3, §6), `07-hub-operations.md`(§3, §4), `observer-contract-v1.yaml`(OpenAPI 원본, §1의
> 근거)을 참고하되, **필드 모양이 이 문서와 다르면 이 문서와 실제 코드가 맞다** — OpenAPI
> 파일은 갱신이 늦을 수 있다.
>
> File Artifacts(Tier B)는 SIREN이 직접 만든 Calypso 하나뿐이라 이 문서의 대상이 아니다 —
> 새로 연동하는 서비스는 전부 OA Service(Tier A) 아니면 HPC Service(Tier C)이고, 이 문서의
> §1/§2 계약은 둘 다에게 동일하다(HPC Service 전용 필드 하나만 예외, §1.2 참고).

## 0. 한눈에 보기

| 방향 | 누가 구현하나 | 엔드포인트 | 필수? |
|---|---|---|---|
| SIREN → 그 서비스 | **그 서비스** | `GET /artifacts/{id}/access` | **필수** |
| SIREN → 그 서비스 | 그 서비스 | `GET /artifacts/{id}/current-version` | 선택 |
| SIREN → 그 서비스 | 그 서비스 | `GET /artifacts/{id}/versions` | 선택 |
| SIREN → 그 서비스 | 그 서비스 | `GET /artifacts?code=&revision=&knoxId=&isAdmin=` | 선택 |
| SIREN → 그 서비스 | 그 서비스 | `GET /artifacts/{id}/html-view?versionLabel=` | 선택 |
| 그 서비스 → SIREN | **SIREN** | `POST /hub/events/version-published` | 권장(없어도 동작은 함, §2.1 참고) |
| 그 서비스 → SIREN | SIREN | `GET /hub/common?projectId=` | 선택 |

"선택"이어도 안 하면 그만큼 SIREN 쪽 기능이 줄어든다 — 구체적으로 뭐가 빠지는지는 각 항목에
적어뒀다. **`access` 하나만은 진짜 필수다** — 이게 없으면 그 서비스의 artifact는 SIREN에서
아무에게도 안 보인다(fail-closed, §1.1).

---

## 1. SIREN이 그 서비스에게 거는 API — 그 서비스가 구현한다

베이스 URL은 Service Manage에 등록한 `baseUrl` 그대로다. 모든 요청은 SIREN BE가 직접
보낸다(브라우저가 아니다) — `knoxId`는 SIREN이 실제 로그인 사용자를 검증해서 실어 보내는
값이지만, 그 값 자체가 서명되어 있진 않다. 대부분의 서비스는 "SIREN BE가 보냈다"는 사실
하나를 신뢰 경계로 삼는다(사내망 전제) — 그 이상의 서명 검증이 필요하면 baseURL 자체를
접근 제한된 네트워크에 두는 식으로 해결한다.

### 1.1 `GET /artifacts/{artifactId}/access` — 필수

**게이트 2**다(설계서 04장 §4.1) — SIREN 쪽 recipient(게이트 1)를 통과한 사람에 한해, 이
서비스가 실제로 그 사람에게 view/edit을 줄지 최종 판정한다.

```
GET {baseUrl}/artifacts/{artifactId}/access?knoxId={knoxId}[&isAdmin=true]
```

- `artifactId` — 그 서비스 안에서의 식별자(SIREN은 `externalArtifactId`로 들고 있음).
- `knoxId` — 호출 대상 사용자.
- `isAdmin` — `true`일 때만 붙는다. SIREN 관리자가 조회 중이라는 뜻 — 이 값으로 project
  member가 아니어도 편집자 시야를 줄지는 그 서비스 재량이다(선택 확장).

응답(TypeScript):
```ts
interface AccessResponse {
  canView: boolean;
  canEdit: boolean;
}
```

- **fail-closed**다 — SIREN은 호출 실패/타임아웃/비정상 응답을 전부 `{canView:false,
  canEdit:false}`로 취급한다(5초 타임아웃).
- 권한이 없는 사용자에게도 **403이 아니라 200 + `{false,false}`**를 준다 — 산출물의 존재
  자체를 숨길 필요는 없고, "권한이 없다"만 알려주면 된다.
- 예시 응답: `{"canView": true, "canEdit": false}`

### 1.2 `GET /artifacts/{artifactId}/current-version` — 선택

SIREN이 캔버스에 버전 라벨을 그리고 Workflow Release 스냅샷을 찍을 때 부른다. 안 만들면
캔버스에 "버전 없음"으로만 보인다.

```
GET {baseUrl}/artifacts/{artifactId}/current-version?knoxId={knoxId}[&isAdmin=true]
```

응답(TypeScript) — 없으면 `null`(HTTP 200 + `null` 바디, 또는 204):
```ts
interface VersionRecord {
  versionLabel: string;              // 표시용 자유 문자열. major.minor 규칙 강제 안 함 (예: "v1.2")
  isReleased: boolean;                // 가시성 판정의 유일한 근거 — versionLabel 모양으로 추론하지 않는다
  giverKnoxId: string | null;         // 이 버전을 만든 사람. 개인 식별 안 되면 null
  giverDept: string | null;           // 부서 단위로만 알면 여기만 채움 (그럼 giverKnoxId는 null)
  viewUrl: string | null;             // 이 산출물의 상세 페이지 — SIREN이 이 링크로 내보낸다
  sourceRefs: SourceRef[];            // lineage 자기신고. 모르면 빈 배열
  hasHtmlView?: boolean;              // 이 버전을 html-view로 열람 가능한가 (안 주면 false)
  // artifactId, versionRef, createdAt을 보내도 되지만 SIREN은 읽지 않는다 (레거시 필드)
}

interface SourceRef {
  artifactKey: string;
  serviceKey: string;
  versionRef: string;
  versionLabel: string;
  capturedAt: string;   // ISO 8601
}
```

★ **`isReleased`가 유일한 가시성 근거다.** `isReleased:false`인 항목(예: 아직 확정 안 된
작업중 snapshot)은 SIREN에서 `isPublished:false`가 되어 **giver(만든 사람)에게만** 보인다.
minor 버전 개념이 없는 서비스는 확정된 release들 + 작업중 snapshot 하나를 이렇게 섞어
보내도 된다 — 그 snapshot의 `versionLabel`엔 정해진 이름이 없다(예전엔 `latest+`를 쓰도록
권했지만 지금은 아무 문자열이나 된다).

### 1.3 `GET /artifacts/{artifactId}/versions` — 선택

버전 이력 전체(최신이 배열 앞).

```
GET {baseUrl}/artifacts/{artifactId}/versions?knoxId={knoxId}[&isAdmin=true]
```

응답: `VersionRecord[]` (1.2와 같은 모양). SIREN은 이 응답을 그대로 보여주지 않는다 —
`isReleased`와 조회자의 giver 여부로 다시 마스킹한 뒤 내려보낸다. **서비스는 아는 대로
전부 주면 된다** — 마스킹은 SIREN이 한다.

이 엔드포인트는 두 시점에 불린다: ① block에 이 artifact를 처음 매핑하는 순간(전체 이력을
한 번에 채움), ② 그 서비스가 push 이벤트를 못 보냈을 때를 대비한 야간 재동기화(§2.1,
아직 실제로 스케줄링되지는 않음).

### 1.4 `GET /artifacts` — 선택 (후보 검색)

"새 Artifact 추가" 다이얼로그가 매번 실시간으로 호출한다. project 사전 링크 단계는 없다 —
SIREN이 project의 code+revision을 그대로 필터로 실어 보낸다.

```
GET {baseUrl}/artifacts?code={code}&revision={revision}&knoxId={knoxId}[&isAdmin=true]
```

- code/revision이 그 서비스 안에서 유일하지 않을 수 있으면(예: production run과 internal
  test가 같은 code/revision을 쓰는 경우) **해당하는 후보를 전부** 돌려준다 — SIREN은 사람이
  그중 하나를 고르게 할 뿐, 하나로 좁혀줄 필요는 없다.
- 구현 안 해도 계약 위반은 아니다 — 다만 후보 브라우징이 안 되니 사용자가
  `externalArtifactId`를 직접 입력해야 한다.

응답(TypeScript):
```ts
interface ArtifactSummary {
  artifactId: string;
  name: string;
  department: string | null;
  currentVersion: VersionRecord | null;   // 1.2와 같은 모양. 버전이 하나도 없으면 null
}
```
응답은 `ArtifactSummary[]`.

### 1.5 `GET /artifacts/{artifactId}/html-view` — 선택

Tier B(File Artifacts)의 업로드/다운로드 화면 자리에, Tier A/C에서는 이걸로 대신 미리보기를
보여준다. `hasHtmlView:true`로 표시된 버전을 고를 때마다 호출된다.

```
GET {baseUrl}/artifacts/{artifactId}/html-view?versionLabel={label}&knoxId={knoxId}[&isAdmin=true]
```

응답(TypeScript) — 없으면 404:
```ts
interface HtmlView {
  html: string;    // 완결된 html 문서(또는 문서로 취급해도 되는 조각)
  width: number;   // 이 html이 설계된 캔버스 폭(px)
  height: number;  // 캔버스 높이(px)
}
```

**SIREN은 이 html을 항상 sandbox iframe(`srcdoc`, `allow-scripts`만, `allow-same-origin`
없음)에 렌더한다** — 그 서비스 자신의 세션 쿠키나 SIREN의 인증 정보가 이 html에 섞여
들어가면 안 된다. 구현 안 해도(또는 404) 계약 위반이 아니다 — 그 버전은 그냥 클릭 불가로
표시된다.

---

## 2. 그 서비스가 SIREN에게 거는 API — SIREN이 구현한다

### 2.1 `POST /hub/events/version-published` — 버전 발행 이벤트

버전이 발행/갱신될 때마다 그 서비스가 SIREN에 먼저 알려준다. (§1.2/1.3의 pull은 이 이벤트를
놓쳤을 때의 안전망 성격이다 — 이 이벤트 전송이 100% 신뢰성 있게 가야 하는 건 아니다.)

```
POST {SIREN_API_BASE}/api/v1/hub/events/version-published
Authorization: Bearer {token}
Content-Type: application/json
```

`token`과 `artifactTypeKey`는 SIREN의 Service Manage 등록 시 발급된다(§3 참고).

요청 바디 — 이 모양을 **정확히** 따라야 한다. 필수 필드 누락, 타입 불일치, **정의 안 된
필드가 하나라도 섞이면 요청 전체를 400으로 거부한다**(부분 반영 없음):

```ts
interface VersionPublishedEvent {
  artifactTypeKey: string;    // Service Manage에서 SIREN이 발급한 값
  externalArtifactId: string; // 이 서비스 안에서 이 산출물 인스턴스를 가리키는 값 — 서비스 전체에서 유일해야 한다
  updatedUserId: string;      // 이 버전 엔트리를 마지막으로 갱신한 사람의 knox id
  updatedAt: string;          // ISO 8601
  versionLabel: string;       // 같은 externalArtifactId 안에서 절대 재사용하면 안 된다
  isPublished: boolean;       // 가시성 판정의 유일한 근거 (§1.2의 isReleased와 같은 개념)
  viewUrl: string | null;     // OA Service 전용, 없으면 null
  path: string | null;        // HPC Service 전용(경로형 산출물), 없으면 null — OA Service는 항상 null
  note: string | null;        // release note 같은 자유 텍스트. 없으면 null
}
```

응답: `{ "recorded": boolean }`.
- `recorded:false` — 그 산출물이 아직 SIREN의 어느 workflow에도 매핑된 적이 없다는 뜻. 정상
  이다, 재시도할 필요 없다 — 나중에 누가 매핑하면 SIREN이 그 순간 §1.3을 불러 전체 이력을
  채운다.
- 실패해도 그 서비스 자신의 publish 동작을 막지 말 것 — 로그만 남기고 계속 진행
  (best-effort).
- `isPublished:false`인 작업중 snapshot을 포함해 **버전이 갱신될 때마다** 쏜다 — official
  release만 쏘는 게 아니다.

★ `artifactName` 필드는 없다 — 예전엔 있었지만, artifact의 표시 이름은 SIREN 쪽에서
등록할 때 정한 값으로 고정되고(그 뒤로 이 이벤트가 덮어쓰지 않는다) 이 필드를 보내도
그냥 무시되는 게 아니라 **400으로 거부된다**(`whitelist:true`) — 절대 보내지 말 것.

### 2.2 `GET /hub/common?projectId={id}` — 프로젝트 공용 데이터

부서·멤버·일정. 인증 없이(사내망 전제) 아무 서비스나 호출할 수 있다 — **이 API가 SIREN을
사실상 사내 신원·일정 공급자로 만든다**는 뜻이므로, 응답을 짧게 캐시해 두고 SIREN이
응답하지 않을 때 마지막 캐시로 동작해야 한다.

```
GET {SIREN_API_BASE}/api/v1/hub/common?projectId={id}
```

응답(TypeScript):
```ts
interface HubCommon {
  projectId: string;
  members: Array<{
    knoxId: string;
    name: string | null;         // SIREN은 이름을 갖고 있지 않다 — 항상 null. 표시는 그 서비스가 담당
    dept: string | null;         // 대표 부서(첫 값)
    departments: string[];       // 한 사람이 여러 부서에 속할 수 있어 배열도 함께 준다
  }>;
  departments: string[];
  schedule: {
    milestones: Phase[];
    workflowPhases: Array<{ workflowId: string; workflowName: string; phases: Phase[] }>;
  };
}

interface Phase {
  id: string;
  name: string;   // 예: "ML3"
  start: string;  // YYYY-MM-DD
  end: string;
}
```

각 서비스는 필요한 것만 골라 쓴다 — 권한 화면의 담당자 후보 목록에는 `members`를, 자체
마감 관리에는 `schedule`을 쓰는 식이다.

---

## 3. 등록 — Service Manage에서 토큰/artifactTypeKey 발급

새 서비스를 연동하려면 SIREN 관리자가 **Service Manage**(App Bar → Admin 배지 → Service
Manage)에서 먼저 등록해야 한다. OA Service/HPC Service 중 하나로 등록하며, 입력값은
Service명·Artifact명(이 baseURL이 낼 산출물의 "종류")·Description·BaseURL뿐이다.

등록하면 화면에 **Bearer token**과 **`artifactTypeKey`**를 보여준다 — 이 둘을 그 서비스
쪽 코드/설정에 반영하면 된다(§2.1의 `Authorization`/`artifactTypeKey`).

- 토큰은 **baseURL당 1개**다. 같은 baseURL로 산출물 종류를 추가 등록해도 토큰은 재사용되고
  `artifactTypeKey`만 새로 나온다.
- 서비스를 Service Manage에서 비활성화하면 토큰이 즉시 폐기된다 — 재활성화하면 새로
  발급된다.
- 토큰 인증 외에 추가 장치(요청 출처 검증, rate limit 등)는 없다 — 토큰 자체가 유일한
  인증 수단이다. 안전하게 보관할 것.

---

## 4. 체크리스트

- [ ] `GET /artifacts/{id}/access` 구현(필수) — 실패 시 SIREN은 무조건 접근 거부로 취급한다는 것 확인
- [ ] `GET /artifacts/{id}/current-version`, `/versions` 구현(권장) — `isReleased` 규칙 확인
- [ ] `GET /artifacts?code=&revision=` 구현(권장, 후보 브라우징이 필요하면 필수나 다름없음)
- [ ] Service Manage에서 등록 → token/`artifactTypeKey` 발급받기
- [ ] `POST /hub/events/version-published`를 버전이 바뀔 때마다 호출 — `artifactName` 필드
      넣지 않기, `whitelist:true`라 정의 안 된 필드는 전부 400
- [ ] (선택) `GET /hub/common`으로 부서/멤버/일정 캐싱해서 권한 화면에 쓰기
- [ ] (선택) `GET /artifacts/{id}/html-view` 구현 — 파일 다운로드 대신 미리보기를 쓰고 싶으면
