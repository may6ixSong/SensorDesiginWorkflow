# 02. 데이터 모델 · API 계약

MongoDB 문서형 구조를 유지한다. 이 장은 **변경분 위주**로 적되, 바뀐 컬렉션은 전체 형태를 다시 쓴다.

## 0. 컬렉션 개요

```
projects        과제 (code+revision 불변, milestones, members, departments)
workflows       workflow (department, ownerKnoxId, editAccess/viewAccess, phases, canvasLock)
artifacts       ★신규★ 산출물 실체 (tier, 권한, recipient, publish 이력)
nodes          ★개명★ 캔버스 위의 자리 (구 deliverables → blocks → nodes) — artifact를 가리킨다
memos           메모 노드
edges           flow 연결선
releases        ★신규★ workflow release 기록 (구 hldReleases 폐기)
artifactServices  연동 서비스 레지스트리 — OA Service/HPC Service 등록, baseURL당 1개 토큰(07장 §3)
hubSyncCheckpoints  야간 전체 재동기화 커서(07장 §6) — **폐기 취소.** 원래 B tier 공용 DB 동기화용으로
                    만들었다가 그 설계가 바뀌어 한 번 폐기 대상이었는데, 지금의 야간 재동기화
                    용도로 그대로 재사용한다
auditLogs       감사 로그
```

**폐기되는 컬렉션**: `hldReleases`, `hpcPathMocks`(§4.1), `projectServiceLinks`(04장 §6.3).

---

## 1. projects

```ts
Project {
  _id
  code: string                  // 불변. 생성 후 UI 수정 경로 없음
  revision: string              // 불변. 'EVT' + 정수(0 이상). 예: 'EVT0', 'EVT1'
  name: string                  // 수정 가능
  departments: [{ id: string, name: string }]  // ★변경★ 구 string[] — id는 발급 후 불변, name은 개명 가능(§9)
  departmentsSeeded: boolean
  milestones: [{ id, name, start, end }]
  members: [{ knoxId, departments: string[], addedAt }]  // departments는 위 departments[].id 배열(§9.2)
  managers: string[]            // milestone 편집 role
  meta: Record<string, string>  // ★신규★ 표시 전용 부가 필드 (가정 P5)
  status: 'ACTIVE' | ...
  isMock: boolean
}
```

- `(code, revision)` unique 인덱스 유지.
- **Revision 형식 검증** — 접두어는 코드 상수로 둔다. 나중에 DVT/PVT가 필요해질 때 한 줄만 고치면 되게.
  ```ts
  // api/src/common/constants/revision.ts  (web에도 동일 파일 중복 정의)
  export const REVISION_PREFIXES = ['EVT'] as const;
  export const REVISION_RE = /^EVT(0|[1-9][0-9]*)$/;
  ```
- `code` / `revision` 은 **생성 시에만** 받는다. `UpdateProjectDto` 에서 두 필드를 제거하고,
  혹시 들어오면 BE가 400으로 거부한다(무시하지 않고 명시적으로 거부한다).
- `meta` 는 화면 표시 전용이다. **다른 시스템 연동에 절대 쓰지 않는다** — 이 문장을 스키마 주석에 남긴다.

---

## 2. workflows

```ts
Workflow {
  _id
  projectId
  name: string
  description: string
  department: string            // project.departments[].id 중 하나. 빈 값 불가(§9)
  ownerKnoxId: string           // 정확히 1명. 이양 불가 (TODO 주석)

  editAccess: { departments: string[], users: string[] }  // departments는 id(§9)
  viewAccess: { departments: string[], users: string[] }  // departments는 id(§9)

  phases: [{ id, name, start, end }]
  phaseWidths: Record<string, number>
  color: string

  canvasLock: {                 // ★신규★ null 이면 미점유
    holderKnoxId: string
    acquiredAt: Date
    expiresAt: Date             // acquiredAt + 10분, 갱신될 때마다 밀린다
  } | null

  releaseSeq: number            // ★신규★ 마지막으로 발행한 release 번호. 0에서 시작
  isMock: boolean
}
```

> **`canvasLock`의 범위는 캔버스뿐이다.** `Workflow` 문서 안에 같이 들어 있지만, 이 필드가
> workflow 전체를 잠그는 게 아니다.
> - lock 점유·갱신·해제(`POST`/`DELETE /workflows/:id/canvas-lock`)와 캔버스 저장
>   (`PUT /workflows/:id/canvas`)은 **`canvasLock` 필드만 원자적으로 `$set`** 한다. 문서 전체를
>   다시 쓰지 않는다.
> - `PATCH /workflows/:id`(Name/Description/Department)와 `PATCH /workflows/:id/phases`는
>   **`canvasLock`을 확인하지도, 건드리지도 않는다.** A가 캔버스를 편집(=lock 점유) 하는 동안에도
>   B는 그 workflow의 description을 얼마든지 바꿀 수 있다 — lock은 오직 `nodes`/`edges`/`memos`/
>   `layout` 저장(=캔버스 그 자체)에만 관여한다(03장 §3.3).
> - 구현상 두 업데이트가 서로 다른 필드 집합을 `$set`하므로, Mongoose 레벨에서 자연히 경쟁하지
>   않는다. 굳이 트랜잭션을 쓸 필요가 없다.

### 마이그레이션 (구 → 신)

| 구 필드 | 신 필드 | 변환 |
|---|---|---|
| `domain` | `department` | 그대로 복사. 빈 문자열이면 그 workflow 생성자의 부서, 그것도 없으면 project의 첫 부서 |
| `owners: string[]` | `ownerKnoxId` | `owners[0]`. 나머지 owner는 `editAccess.users` 로 이동 |
| `viewGrants: [{knoxId, department}]` | `viewAccess.users` | `knoxId` 만 옮긴다. `department` 는 버린다 |
| — | `editAccess.departments` | `[department]` 로 초기화 |

---

## 3. artifacts ★신규★

산출물의 **실체**다. 캔버스 위의 자리(`nodes`)와 분리한다 — 같은 산출물이 여러 workflow에 놓여도
권한과 버전 이력은 하나다.

```ts
Artifact {
  _id
  projectId                     // 과제 단위 스코프 (가정 P3)
  name: string
  tier: 'A' | 'B' | 'C'
  network: 'OA' | 'HPC'

  // --- 출처 매핑 ---
  serviceKey: string | null           // A/B/C 전부 필수(HPC Service도 이제 실연동, File Artifacts는 CALYPSO_SERVICE_KEY 고정)
  externalArtifactId: string | null   // 그 서비스 전체에서 유일해야 한다(07장 §4.3)
  artifactTypeKey: string | null      // Service Manage 등록 시 SIREN이 발급(07장 §3.2)
  externalUrl: string | null          // 레거시 — C가 수동 링크만 갖던 시절의 필드. 이제 버전별
                                       // 경로는 versions[].hpcPath로 온다(07장 §4.1)

  // --- 권한: artifact는 권한을 전혀 들고 있지 않는다(04장 §3) ---
  // recipient는 여기 두지 않는다. workflow마다 달라질 수 있어서 WorkflowNode.recipients(§4)에
  // 저장한다 — 01장 §4.1 참조. A/B/C 전부 공통이다. (구 설계는 B/C를 여기
  // editAccess/viewAccess/expectedGiver로 뒀었다 — 전부 폐기했다.)

  // --- publish 이력 ---
  versions: [ArtifactVersion]         // 최신이 index 0

  createdBy: string
  isMock: boolean
}

ArtifactVersion {
  tier: 'A'|'B'|'C'         // 엔트리 단위. 나중에 실연동이 붙어도 과거 기록을 고치지 않는다
  versionLabel: string          // 표시용 자유 문자열
  isPublished: boolean          // ★개명★ 구 isReleased. 가시성 판정은 오직 이 필드로만
  versionRef: string | null     // 그 서비스가 준 불변 참조
  giverKnoxId: string | null
  giverDept: string | null
  viewUrl: string | null
  hpcPath: string | null
  note: string                  // 산출물 자신의 publish note. release가 복제하지 않는다
  assertedBy / assertedAt       // C/D 수동 기록
  observedAt                    // A/B 관측 시각
  createdAt
}
```

### 규칙

- **`recipients`는 artifact가 아니라 항상 `WorkflowNode.recipients`에 있다(A/B/C 공통, §4).**
  artifact는 `editAccess`/`viewAccess`/`expectedGiver` 같은 권한 필드를 전혀 갖지 않는다.
- `versions[0].tier` 가 그 산출물의 "현재 tier"이며, `artifact.tier` 는 그 값을 캐시한 것이다.
- **버전 가시성** — `isPublished: false` 인 엔트리는 그 산출물의 giver(그 서비스가 판정하는
  canEdit)에게만 응답에 담긴다. 그 외 전원은 published만 본다.
- **File Artifacts(B)의 콘텐츠 종류(File/OA-link/HPC-path)와 다중 파일은 Calypso 자기
  스키마의 일이다** — SIREN의 `ArtifactVersion`은 이 필드들을 그대로 캐시하는
  `viewUrl`/`hpcPath`(둘 다 이미 있음)로 충분하고, 파일 목록 자체는 여기 두지 않는다.
  실물 열람·다운로드는 항상 그 서비스(Calypso)로 보낸다 — SIREN은 참조만 갖는다(04장 §2).
- **Mapping 범위 — 같은 과제(project)만.** workflow의 node를 어떤 artifact에 매핑할 때, 후보는
  **그 workflow와 `projectId`가 같은 artifact로 한정**한다. 같은 `code`라도 `revision`이 다르면
  다른 project이므로(01장·02장 §1) 자동으로 후보에서 빠진다. Admin이 여러 과제를 동시에 볼 수
  있어도 이 제약은 그대로 적용된다 — 매핑 API는 `artifact.projectId !== workflow.projectId`
  이면 400으로 거부한다.
- **OA Service/File Artifacts/HPC Service(A/B/C)의 버전 보고 규칙** — 그 서비스는 자기 버전
  체계를 그대로 쓰되, SIREN에는 **"official한 버전"만** 넘긴다.
  - 서비스가 minor 단위까지 명확히 태깅한다면 그 minor까지 그대로 보낸다(예: `v1.3`).
  - **RPM처럼 minor 개념이 없고 snapshot만 찍는 서비스**는, 확정된 release 버전들과 함께
    작업중 snapshot 하나를 추가로 보낼 수 있다 — `isPublished: false`로 보내면 giver 판정
    대상에게만 보인다(§7의 가시성 규칙을 그대로 따른다). 그 snapshot의 `versionLabel`엔
    정해진 이름이 없다 — 예전엔 `latest+`라는 이름을 쓰도록 권했지만 그 관례는 없앴다.
  - 이 규칙은 `ArtifactVersion.versionLabel` 에 들어오는 값의 **의미**에 대한 것이고, 스키마
    필드를 추가하지 않는다 — 작업중 snapshot도 `isPublished:false`인 한 엔트리일 뿐이다.

### `major` 판정

release의 변경 감지(05장 §3)는 **major 단위**로만 한다. minor는 비교하지 않는다.

```ts
// versionLabel 이 'v1.2' / '1.2' / 'V1' 형태면 앞자리를 major로 본다.
// 그 규칙에 안 맞는 서비스(자유 문자열·경로형)는 versionLabel 전체를 major key로 쓴다.
majorKey(v: ArtifactVersion): string {
  const m = /^v?(\d+)\./i.exec(v.versionLabel);
  return m ? m[1] : v.versionLabel;
}
```

---

## 4. nodes (구 deliverables)

캔버스 위의 **자리**다. 버전도 권한도 갖지 않는다 — 전부 `artifacts` 로 옮겼다.

```ts
WorkflowNode {
  _id
  projectId
  workflowId
  phaseId: string
  artifactId: ObjectId | null   // null = 아직 출처가 정해지지 않은 정상 빈 상태(= release 제외)
                                 // 매핑 시 artifact.projectId === projectId 만 허용(§3)
  name: string                  // 캔버스에 표시되는 이름. artifact가 매핑돼도 이 값을 그대로 쓴다 —
                                 // artifact 자신의 이름은 상세 slide에서만 보여준다(사용자 지적)
  layout: { x, y, w, h }
  intent: 'own' | 'received'    // "새 Artifact 추가" 다이얼로그 첫 질문. 생성 후 불변(04장 §6)

  // artifact가 매핑된 node에서 의미가 있다 — A/B/C 전부 공통이다. workflow마다
  // 독립이라 여기, node에 둔다 — 01장 §4.1/§4.4. edit/view로 나뉘지 않는 단일 grant다.
  // (구 설계는 B/C/D를 artifact.editAccess/viewAccess/expectedGiver로 뒀었다 — 전부
  // 폐기했다.)
  recipients: { departments: string[], users: string[] }  // departments는 id(§9)

  createdBy: string
  isMock: boolean
}
```

- `series` / `seriesIdx` / `seriesTotal` 은 **유지**한다(반복 릴리스 일정 개념은 그대로).
- `recvDept` / `recvContact` / `recvWorkflowId` / `sourceDept` / `sourceContact` 는 **제거**한다 —
  수신 대상은 이제 node의 `recipients`가 유일한 진실이다(A/B/C 공통).
- `versions` 는 제거하고 `artifactId` 참조로 대체한다.
- `recipients` 편집 권한은 그 workflow의 **Edit Access**다(04장 §3.3). recipient에 속하는 것과
  recipient를 편집할 수 있는 것은 별개다(01장 §4.2).
- **`(workflowId, artifactId)` 유일성 제약** ★신규★ — 같은 workflow 안에서 같은 artifact를 두
  node에 매핑할 수 없다. intent(own/received) 무관하게 적용된다(04장 §6.5). 다른 workflow에서
  같은 artifact를 재사용하는 것은 그대로 허용된다.

## 4.1 `hpcPathMocks` — 폐기 ★

HPC망과의 양방향 API 연동이 확정되면서 더 이상 필요 없다 — HPC Service는 이제 OA Service와
같은 실제 event·라이브 게이트 대상이다(04장 §2, §6.3, 07장). 이 컬렉션과 그 미리보기 전용
후보 목록 UI는 제거 대상이다.

---

## 5. edges · memos

변경 없음. `edges { fromNodeId, toNodeId, bidirectional }` 로 필드명만 nodes 개명에 맞춘다.

---

## 6. releases ★신규★

`hldReleases` 를 폐기하고 이 컬렉션이 대신한다. **캔버스 스냅샷을 담지 않는다** — 표 형태의
산출물 목록만 남긴다.

```ts
Release {
  _id
  projectId
  workflowId
  seq: number                   // workflow별 1부터 증가
  releasedAt: Date
  releasedBy: string            // KnoxID
  note: string                  // release 전체에 1개. 필수

  workflowAt: {                 // 그 시점의 workflow 표기 (이후 이름·부서가 바뀌어도 보존)
    name: string
    department: string          // Project.departments[].id
    departmentLabel: string     // ★신규★ 그 순간의 부서 이름 — id가 가리키는 부서가 나중에
                                 // 삭제됐을 때만 쓰는 대체 표시값(§9.4). 평소엔 department(id)를
                                 // 지금의 Project.departments에서 찾아 최신 이름을 보여준다
  }

  items: [ReleaseItem]

  // 조회 최적화용 파생 필드 — items 안의 모든 수신 부서/사용자를 평탄화해 담는다.
  // 부서별 필터 뷰(05장 §6.2)가 이 필드로 인덱스 조회한다. departments는 id(§9).
  recipientDepartments: string[]
  recipientUsers: string[]
}

ReleaseItem {
  nodeId: string
  artifactId: string
  artifactName: string          // 그 시점 이름
  tier: 'A'|'B'|'C'
  network: 'OA' | 'HPC'
  phaseId: string
  phaseName: string

  // 이 산출물의 publish 상태 — null 이면 '한 번도 publish된 적 없음'
  published: {
    versionLabel: string
    versionRef: string | null
    majorKey: string
    publishedAt: Date | null
    viewUrl: string | null
    hpcPath: string | null
    giverKnoxId: string | null
  } | null

  changed: boolean              // 직전 release 대비 majorKey 가 달라졌는가
  firstTime: boolean            // 이 release에서 처음 등장한 산출물인가

  recipients: {                 // 그 시점 확정값 (이후 권한이 바뀌어도 이력은 보존)
    departments: string[]       // id(§9). label은 따로 얼리지 않는다 — 부서가 지워진 극단적인
                                 // 경우에만 화면에서 id 문자열을 그대로 보여준다(§9.4)
    users: string[]
  }

  sources: [{                   // flow 직전 1홉 upstream
    nodeId: string
    artifactId: string
    artifactName: string
    selected: {                 // null 이면 '아직 전달되지 않음'
      versionLabel: string
      versionRef: string | null
      publishedAt: Date | null
      viewUrl: string | null
      hpcPath: string | null
    } | null
  }]
}
```

### 인덱스

```
{ workflowId: 1, seq: -1 }
{ projectId: 1, releasedAt: -1 }
{ recipientDepartments: 1, releasedAt: -1 }
{ 'items.artifactId': 1, releasedAt: -1 }
```

### 불변성

- `releases` 문서는 **생성 후 수정·삭제 불가**다. Revoke도 없다(README §4 T7).
- BE에 update/delete 라우트를 아예 만들지 않는다. 실수로 열리는 것을 막기 위해 서비스에도
  변경 메서드를 두지 않는다.

---

## 7. API 계약

### 7.1 Project

| Method | Path | 비고 |
|---|---|---|
| `GET` | `/projects` | **members 기준으로 필터된 목록**만 반환 |
| `POST` | `/projects` | Admin만. code/revision 형식 검증 |
| `PATCH` | `/projects/:id` | **code·revision 필드는 400으로 거부** |
| `PATCH` | `/projects/:id/milestones` | Manager · Admin |
| `PATCH` | `/projects/:id/members` | Admin |
| `POST` | `/projects/:id/departments` | Admin. 부서 추가, id 발급(§9.1) |
| `PATCH` | `/projects/:id/departments/:deptId` | Admin. 개명만, id는 불변(§9.1) ★신규★ |
| `DELETE` | `/projects/:id/departments/:deptId` | Admin. 그 부서 소속 member가 없을 때만(§9.1) |

### 7.2 Workflow

| Method | Path | 비고 |
|---|---|---|
| `GET` | `/projects/:id/workflows` | 각 항목에 `myAccess: 'edit'\|'view'\|null` 을 함께 준다. Information page가 `null` 도 disabled로 그려야 하므로 **목록에서 제외하지 않는다** |
| `POST` | `/workflows` | `department` 필수. 생성자가 그 부서 소속인지 BE 재검증 |
| `PATCH` | `/workflows/:id` | ★단일 PATCH★ `{ name, description, department }` 를 한 번에 |
| `PATCH` | `/workflows/:id/phases` | lock 불필요, latest overwrite |
| `PUT` | `/workflows/:id/access` | `{ editAccess, viewAccess }` 통째로 교체 |
| `POST` | `/workflows/:id/canvas-lock` | 점유 · 갱신 |
| `DELETE` | `/workflows/:id/canvas-lock` | 해제 (본인 또는 Admin) |
| `PUT` | `/workflows/:id/canvas` | lock 보유자만. nodes·edges·memos·layout 일괄 저장 |

`PATCH /workflows/:id` 가 department 변경을 포함하면, 서버가 01장 §3.5의 3단계를 **한 트랜잭션**
안에서 처리한다. FE가 access를 따로 PUT하지 않는다.

### 7.3 Artifact

| Method | Path | 비고 |
|---|---|---|
| `GET` | `/artifacts/:id` | 열람 권한(01장 §4.2) 없으면 403. 버전은 권한에 따라 마스킹 |
| `PATCH` | `/workflows/:wfId/nodes/:nodeId/recipients` | **A/B/C node 공통.** `{ departments, users }`(단일 grant). workflow Edit Access 필요. (구 `PUT /artifacts/:id/access`는 제거 — artifact 단위 권한 자체가 완전히 폐기됐다) |
| `GET` | `/workflows/:wfId/artifact-candidates` | `?source=live\|file\|hpc&intent=own\|received&serviceKey=&code=&revision=` — pickable까지 판정된 후보 목록 (04장 §6.2). code/revision은 그 workflow가 속한 project에서 그대로 채운다 — 사전 링크 단계 없음(04장 §6.3) |
| `POST` | `/workflows/:wfId/nodes` | `{ name, phaseId, layout, intent, artifactId? \| newArtifact? }` — newArtifact가 있으면 find-or-create 후 매핑 (04장 §6.7) |
| `PATCH` | `/nodes/:id` | `{ name?, artifactId? \| newArtifact? }` — 재매핑. 이전 값과 다르면 node.recipients 초기화 (04장 §6.6) |

### 7.4 Release

| Method | Path | 비고 |
|---|---|---|
| `GET` | `/workflows/:id/release/preview` | 지금 release하면 무엇이 나갈지. items·changed·source 후보를 계산해 반환 |
| `POST` | `/workflows/:id/releases` | 실행. `{ note, sources: { [nodeId]: { [sourceNodeId]: versionRef \| null } } }` |
| `GET` | `/workflows/:id/releases` | 그 workflow의 release 목록 |
| `GET` | `/releases/:id` | 상세 (표) |
| `GET` | `/releases/:id` | 상세 1건. workflow 단위 Guard를 못 거는 경로라 **자기 자신이 자격을 판정한다** — recipient · 실행자 · 그 workflow 소속 부서 · 그 workflow view 권한 중 하나(09장 §4.1). 산출물별 마스킹은 열람 시점 재판정 |
| `GET` | `/releases?department=` | 부서별 필터 뷰 |
| `GET` | `/artifacts/:id/releases` | artifact별 타임라인 |

### 7.5 My Assignment ★신규★ (09장)

과제를 가로지르는 조회라 workflow 단위 Guard가 붙지 않는다 — 무엇을 보여줄지는 전부
scope 계산(`MyScopeService`)이 정하고, 그 계산이 항상 "내가 member인 과제"에서 시작하므로
Project 계층(01장 §2.2)은 그대로 지켜진다. **Admin은 어느 라우트에서도 필터가 없다.**

| Method | Path | 비고 |
|---|---|---|
| `GET` | `/my/releases/received` | `?page=&size=` 내가/내 부서가 recipient인 release. 최신순 페이지네이션 |
| `GET` | `/my/releases/published` | `?page=&size=` 내가 실행했거나 내 부서 workflow가 낸 release |
| `GET` | `/my/artifacts` | 내 부서 workflow의 own node 중 artifact가 매핑된 것. 최근 1년, 최근 갱신순 |
| `GET` | `/my/calendar` | `?from=&to=` (ISO-8601, 100일 이내) 그 범위의 버전 발행 event + release event |

**새 컬렉션을 만들지 않았다** — 기존 컬렉션에 인덱스만 더해 가로질러 읽는다(09장 §6).
`releases`에 `{recipientUsers, releasedAt}` · `{releasedBy, releasedAt}` ·
`{'workflowAt.department', releasedAt}` · `{releasedAt}`,
`artifacts`에 `{'versions.publishedAt'}` · `{'versions.observedAt'}` · `{updatedAt}`,
`nodes`에 `{workflowId, intent, artifactId}`.

`POST /releases` 는 **멱등하지 않다.** 중복 클릭을 막기 위해 FE는 요청 중 버튼을 잠그고,
BE는 `releaseSeq` 를 원자적으로 증가시켜 순번 충돌을 막는다.

---

## 8. FE/BE 공유 상수

기존 원칙 유지 — 같은 값을 두 파일에 중복 정의하고, 고칠 때 **반드시 함께** 고친다.

| 값 | api | web |
|---|---|---|
| 부서 기본 목록(★전사 고정 6종, §9와 무관★) | `api/src/common/constants/departments.ts` | `web/src/shared/constants/departments.ts` |
| 일정 정렬·검증 | `api/src/common/schedule.ts` | `web/src/lib/schedule.ts` |
| Revision 형식 | `api/src/common/constants/revision.ts` | `web/src/shared/constants/revision.ts` |
| Tier 상수 | `api/src/common/constants/tier.ts` | `web/src/shared/constants/tier.ts` |
| 캔버스 lock TTL | `api/src/common/constants/lock.ts` | `web/src/shared/constants/lock.ts` |

---

## 9. `projects.departments` — id 발급 · 개명 ★신규★

과제(project)마다 자유롭게 늘리거나 줄이는 부서 목록(§1)이 **이름 문자열에서 `{id, name}`
쌍으로 바뀐다.** 위 §8 표의 "부서 기본 목록"(전사 고정 6종, `analog`/`digital`/`aps`/`pipd`/
`solution`/`pte`)은 이 변경과 **무관한 별개의 축**이다 — 그건 예전 `recvDept` 검증용으로
남아있던 것이고, 지금 워크플로/노드/Calypso artifact의 권한이 실제로 참조하는 것은 언제나
`projects.departments`(과제별 자유 목록)다.

```ts
Project {
  departments: [{ id: string, name: string }]   // ★변경★ 구 string[]
}
```

- `id`는 **부서를 추가하는 시점에 서버가 발급**한다(`new Types.ObjectId().toString()` — 이
  코드베이스의 다른 모든 Mongo 발급 id와 같은 방식, 별도 의존성 없음). 한번 발급된 id는
  그 부서가 삭제되기 전까지 절대 바뀌지 않는다.
- `name`은 **Members 탭에서 언제든 바꿀 수 있다**(신규 기능) — id는 그대로 두고 `name`만
  갱신한다.

### 9.1 API

기존 `PATCH /projects/:id/departments`(배열 전체 교체)를 세 개의 명시적 라우트로 나눈다 —
Members 탭 UI가 "추가/개명/삭제" 세 가지 별개의 동작이기 때문이다:

| Method | Path | 비고 |
|---|---|---|
| `POST` | `/projects/:id/departments` | `{ name }` → 새 `id` 발급, 목록에 추가 |
| `PATCH` | `/projects/:id/departments/:deptId` | `{ name }` → 그 id의 `name`만 교체. **id는 그대로** |
| `DELETE` | `/projects/:id/departments/:deptId` | 그 id를 가진 member가 한 명도 없을 때만 허용(기존 규칙 유지) |

세 라우트 모두 권한은 기존 `PATCH /projects/:id/departments`와 동일하게 유지한다(`ProjectsService.assertManageAccess`
— 지금 실제로는 Admin 전용이다). ★기존에 발견된 불일치 — FE의 `ProjectMembersPage.tsx`는 이
버튼을 Project Manager(`canEditMilestones`)에게도 노출하고 있어(`canManageManagers` 게이트),
Manager가 저장을 누르면 BE가 403을 낸다. 이번 변경은 이 불일치를 새로 만들지도, 고치지도
않는다 — 세 라우트 모두 지금과 똑같이 Admin만 통과시킨다. FE/BE 권한 기준을 맞추는 것은
이번 범위 밖의 별도 작업이다.
`workflow` 생성 시 부서 매칭도 이름 비교가 아니라 **id 비교**로 바뀐다(`candidates.find(d =>
d.id === wanted)`) — 대소문자 정규화 로직이 통째로 필요 없어진다.

### 9.2 어디가 이름 대신 id를 저장하나

`Project.departments`(정의 자체)를 제외한 **모든** 부서 참조 필드는 이제 이름이 아니라
**그 프로젝트의 `Project.departments[].id`**를 저장한다:

| 컬렉션 | 필드 |
|---|---|
| `projects` | `members[].departments` |
| `workflows` | `department`, `editAccess.departments`, `viewAccess.departments` |
| `nodes` | `recipients.departments` |
| Calypso `artifacts`(별도 DB) | `department`, `editors[].department`, `viewGrants[].department` |

### 9.3 표시 — "id만 들고, 이름은 조회 시점에 해석"

01장 §6의 KnoxID·SDPCommonAPI 패턴과 같은 모양이다: **BE/DB는 id만 저장하고, 화면에 보여줄
이름은 그때그때 `Project.departments`에서 찾는다.** 차이는 조회 대상이 외부 API가 아니라
이미 화면이 들고 있는 `project.departments` 배열 하나뿐이라는 것 — 즉 **추가 네트워크
호출이 전혀 없다.**

FE는 `project`를 이미 들고 있는 모든 화면(워크플로 설정, 노드 recipient 편집기, 캔버스 필터,
Calypso editor/viewer 선택기 등)에서 아래와 같은 `Map` 하나만 만들면 된다:

```ts
const nameById = useMemo(
  () => new Map(project.departments.map((d) => [d.id, d.name])),
  [project.departments],
);
```

부서 이름을 Members 탭에서 바꾸면 `project` 쿼리 캐시 하나가 무효화되고, 그 캐시를 구독하는
모든 화면이 자동으로 새 이름으로 다시 그려진다 — 별도로 전파할 것이 없다.

### 9.4 release 이력의 부서 표기는 이름도 함께 얼린다

`releases`(§6)만은 예외다 — release는 **그 순간의 사실을 보존**하는 이력이므로,
`workflowAt.department`(id)와 별도로 **그 순간의 이름을 `workflowAt.departmentLabel`
(문자열)로 함께 저장**한다. 평소에는(부서가 존재하는 한) id로 `Project.departments`를 찾아
지금 이름을 보여주지만, 그 부서가 나중에 **삭제**되어 더 이상 `Project.departments`에 없는
경우에만 `departmentLabel`이 대체 표시값으로 쓰인다 — 이름을 "그때 그대로 얼려서 보여주기"
위한 것이 아니라(이름이 바뀌면 이력도 새 이름으로 보이는 게 맞다 — 그게 이번 개정의
취지다), 부서 자체가 없어져 id로 아무것도 못 찾는 극단적인 경우의 안전망이다.
`releases.items[].recipients.departments`는 별도 label 없이 id만 저장한다 — 화면에서
매번 해석하고, 정 안 되면(부서 삭제) id 문자열을 그대로 보여준다.

### 9.5 이번 개정으로 함께 바로잡는 것

Calypso 쪽 `web/src/components/artifact/ArtifactSourcePicker.tsx`가 Calypso artifact의
`department`를 표시할 때 지금까지 §8의 전사 고정 6종(`departmentName()`)으로 잘못 찾고
있었다 — Calypso 스키마 자신의 주석("SIREN 공용 데이터의 부서 목록에서 고른 값")이 원래
의도한 대로, 이제 그 artifact가 속한 SIREN project의 `departments`로 올바르게 찾는다. 이건
이번 개정 범위 밖의 확장이 아니라, 부서 표시 로직을 다시 배선하는 김에 함께 고치는 기존
버그다.
