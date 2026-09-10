# 01. 권한 모델

권한은 **Project → Workflow → Artifact** 3계층이며, 각 층은 **위층을 통과해야만** 평가된다.
어느 층에서든 Admin은 항상 통과한다.

```
Admin ─────────────────────────────── 전 계층 무조건 통과
  │
  ├─ Project        members 에 있는가?           ← 없으면 그 아래는 볼 것도 없다
  │    │
  │    ├─ Workflow  Owner / Edit / View 인가?    ← app bar 노출 · 캔버스 편집 판정
  │    │
  │    └─ Artifact  A: recipient(게이트) → 서비스 권한(게이트)   ← 상세 slide · 버전 열람 판정
  │                 B/C/D: SIREN artifact 권한
```

---

## 1. Admin

- 시스템 전체 **super 권한**이다.
- 이 문서 어디에도 "Admin은 예외" 라고 안 써 있어도, **모든 규칙에 대해 Admin은 통과**한다.
  단 하나의 예외는 §3.4의 "workflow 소속 부서의 Edit Access 항목 삭제"뿐이다 — 그건 Admin도 못 한다.
- FE의 판정 함수는 전부 `isAdmin` 을 첫 번째 단락으로 받는다. BE Guard도 동일하게 재검증한다.

---

## 2. Project 계층

### 2.1 판정

```
canAccessProject(user, project) = isAdmin(user) || project.members.some(m => m.knoxId === user.knoxId)
```

### 2.2 결과

| 화면 | 동작 |
|---|---|
| app bar의 Project select | 접근 가능한 과제만 option에 넣는다 |
| 과제 목록 / 홈 | 접근 가능한 과제만 |
| `/projects/:id/**` 라우팅 | 접근 불가 과제면 **차단 화면**을 렌더한다 |
| 그 과제 하위 workflow URL 직접 접근 | 마찬가지로 **차단**. workflow 권한이 있어도 소용없다 |

> **이 규칙이 최우선이다.** members에 없는 사람은, 어떤 workflow의 View Access를 받았더라도
> 그 과제와 그 안의 어떤 것도 볼 수 없다. 라우팅으로 우회하려 하면 "이 과제에 대한 접근
> 권한이 없습니다 / You do not have access to this project." 를 보여준다.
>
> 반대로 **권한 부여 자체는 project member 여부와 무관하게 가능하다**(§3.3, §4.3). 아직
> members에 없는 사람에게 미리 권한을 줘 두고, 나중에 members에 추가되는 순간 실제로 열리는
> 순서가 정상 시나리오다.

### 2.3 Project 안의 역할

| 역할 | 저장 | 할 수 있는 일 |
|---|---|---|
| Member | `members[]` | 그 과제를 열람. 자기 부서로 workflow를 생성 |
| Manager | `managers[]` | 위 + **Milestone 편집** |
| Admin | 전역 | 전부 + 과제 생성 · 과제 정보 수정 |

- Manager라고 해서 workflow가 더 보이지는 않는다. milestone 편집 전용 역할이다. **(가정 P4)**
- 과제 **생성**은 Admin만 한다. **(가정 P1)**
- 과제 코드 · Revision은 생성 후 **누구도** UI로 수정할 수 없다. Admin이 DB를 직접 고친다.

### 2.4 "내가 속한 부서"

`Project.members[].departments` — 즉 **그 과제의 로스터 기준**으로 판정한다. 같은 사람이 과제마다
다른 부서일 수 있으므로 전사 소속을 쓰지 않는다. **(가정 P2)**

```ts
myDepartments(user, project) =
  isAdmin(user) ? project.departments            // Admin은 그 과제의 전체 부서
                : project.members.find(m => m.knoxId === user.knoxId)?.departments ?? []
```

이 값이 쓰이는 곳:
- workflow 생성 시 부서 dropdown의 option
- workflow settings의 Department dropdown option
- 부서 단위 권한의 실제 적용 대상 계산

---

## 3. Workflow 계층

### 3.1 저장 구조

```ts
Workflow {
  department: string,            // 이 workflow가 소속된 부서 (반드시 1개, 빈 값 불가)
  ownerKnoxId: string,           // 정확히 1명
  editAccess: { departments: string[], users: string[] },
  viewAccess: { departments: string[], users: string[] },
}
```

- `departments` / `users` 는 **둘 다 다중**이다. 부서를 여러 개 넣을 수 있다.
- `users` 는 KnoxID 문자열만 담는다. 표시용 이름은 SDPCommonAPI로 조회한다(§6).
- 예전 `owners: string[]`, `viewGrants: [{knoxId, department}]`, `domain` 은 전부 이 구조로 대체된다.

### 3.2 판정

```ts
level(user, workflow, project): 'edit' | 'view' | null
  if (isAdmin) return 'edit'
  if (!canAccessProject(user, project)) return null          // Project 계층이 먼저다
  if (workflow.ownerKnoxId === user.knoxId) return 'edit'
  if (matches(user, workflow.editAccess, project)) return 'edit'
  if (matches(user, workflow.viewAccess, project)) return 'view'
  return null

matches(user, grant, project) =
  grant.users.includes(user.knoxId) ||
  grant.departments.some(d => myDepartments(user, project).includes(d))
```

**Edit과 View에 동시에 등록되는 것을 허용한다.** 부서 목록이 겹칠 수 있기 때문이다. 이때 실효
권한은 **항상 더 높은 Edit**이다 — 위 판정이 edit을 먼저 검사하므로 자연히 그렇게 된다.
UI에서도 양쪽에 동시에 표시하고, 경고를 띄우지 않는다.

**부서 단위 권한은 조회 시점에 실시간으로 판정한다.** 나중에 그 부서에 합류한 사람도 즉시 권한을
얻고, 부서를 떠나면 즉시 잃는다. 부여 시점의 멤버를 얼려두지 않는다.

### 3.3 권한 부여 규칙

| 대상 | 후보 범위 |
|---|---|
| **부서** | 그 과제에 등록된 부서(`Project.departments`) 중에서 선택. **다중 선택** |
| **개별 사용자** | **전사 검색**(SDPCommonAPI). project member 여부와 무관하게 추가 가능. **다중** |

개별 사용자를 전사에서 고를 수 있는 이유는 §2.2에 적었다 — 권한을 주는 것과 실제로 열리는 것은
별개이며, project members가 최종 관문이다.

### 3.4 workflow 소속 부서의 Edit Access

- workflow를 **생성하는 순간**, 그 workflow의 `department` 가 `editAccess.departments` 에
  자동으로 들어간다.
- 이 항목은 permissions 화면에서 **삭제할 수 없다.** 삭제 버튼을 렌더하지 않고, BE도 거부한다.
  **Admin도 예외가 아니다.**
- 화면에서는 다른 항목과 구분되도록 고정 배지(예: 자물쇠 아이콘 + `Workflow department`)로 표시한다.
- 교체는 오직 **Department 변경**(§3.5)으로만 일어난다.

### 3.5 Department 변경

- 변경 권한: **Edit Access 전원**(+ Owner, Admin).
- 후보: `myDepartments(user, project)`. Admin은 그 과제의 전체 부서.
  - 현재 값이 내 부서 목록에 없으면(예: 부서를 옮긴 뒤) 현재 값을 **선택된 상태의 disabled option**
    으로 목록 맨 위에 보여준다. 값이 사라져 빈 dropdown이 되는 일이 없게 한다.
- `unassigned` option은 **없다.**
- 저장 시 서버가 하는 일은 정확히 이 셋뿐이다:
  1. `editAccess.departments` 에서 **이전 department 제거**
  2. `editAccess.departments` 에 **새 department 추가**
  3. `workflow.department` 갱신
- **그 밖의 것은 절대 건드리지 않는다** — 다른 부서, 개별 사용자, `viewAccess` 전부 그대로 유지.
- 새 department가 이미 `viewAccess.departments` 에 있어도 **제거하지 않는다**(§3.2의 동시 등록 허용).

### 3.6 Owner

- **정확히 1명.** workflow 생성자가 그대로 Owner가 된다.
- **이양·위임 불가.** 변경 UI를 만들지 않고, API도 열지 않는다.
- 요청이 들어올 수 있으므로 스키마와 서비스에 TODO 주석을 남긴다:
  ```ts
  /** 이 workflow의 대표 담당자. 현재 이양 불가 정책이다.
   *  TODO: Owner 이양 요청이 오면 여기와 PATCH /workflows/:id/owner 를 연다. */
  ownerKnoxId: string;
  ```
- 예전의 **"Owner는 Analog 부서만 가능"** 제약은 **완전히 폐지**한다.

### 3.7 화면별 노출 규칙

| 화면 | 권한 없는 workflow 처리 |
|---|---|
| **app bar의 Workflow select** | option에서 **제외** |
| **Information page** (과제 정보 / workflow 목록) | **보여주되 `disabled` 스타일** + "권한 없음" 표기. 클릭해도 진입하지 않는다 |
| **Design workflow (전체 보기)** | Information page와 동일 — 구조는 보이되 진입 차단 |
| **Schedule dashboard** | Information page와 동일 |
| **My Workflow** | 애초에 내가 권한을 가진 것만 나오므로 필터 결과가 곧 목록 |
| **`/workflows/:id` 직접 접근** | 차단 화면 |

> 요약하면 **"목록·정보성 화면은 존재를 보여주되 잠근다. 이동 수단(app bar)에서는 아예 뺀다."**

### 3.8 Workflow Settings 접근

- Settings 진입 버튼(연필)은 **Edit 권한자에게만** 보인다. View 권한자는 버튼 자체가 없다.
- Permissions 탭도 View 권한자에게 열지 않는다.
- 단 **artifact 상세 slide의 Recipient 정보는 View 권한자도 읽기 전용으로 볼 수 있다**
  (04장 §5) — 그건 workflow 설정이 아니라 산출물 정보이기 때문이다.

---

## 4. Artifact 계층

상세는 [04-artifact-and-publish.md](04-artifact-and-publish.md)에 있고, 여기서는 권한 판정만 정리한다.

### 4.1 Tier별 소유권

| Tier | Edit/View 권한을 누가 갖고 있나 | Recipient |
|---|---|---|
| **A** (Live) | **그 서비스**가 관리. SIREN은 관여하지 않는다 | SIREN이 **block(=workflow 안의 자리) 단위로 저장**. 같은 artifact도 workflow마다 recipient 구성이 다를 수 있다 |
| **B** (Synced) | **SIREN**이 artifact 단위로 보관 | `viewAccess` 가 곧 recipient (artifact 단위 — 모든 workflow에서 동일) |
| **C** (Linked) | **SIREN**이 artifact 단위로 보관 | `viewAccess` 가 곧 recipient (artifact 단위 — 모든 workflow에서 동일) |
| **D** (Attested) | **SIREN**이 artifact 단위로 보관 | `viewAccess` 가 곧 recipient (artifact 단위 — 모든 workflow에서 동일) |

B/C/D의 recipient가 artifact 단위인 이유는 그 권한 자체가 Calypso나 HPC 공용 DB처럼 **한 군데서
중앙 관리**되기 때문이다 — 그래서 같은 산출물을 참조하는 모든 workflow에 동일하게 적용된다.
A Tier는 권한을 그 서비스가 관리하고 SIREN은 알 방법이 없으므로, recipient를 **그 workflow의
block에** 따로 붙인다 — 같은 A Tier artifact라도 workflow X에서는 AA·BB 부서가 받고, workflow Y
에서는 CC 부서만 받는 식으로 **workflow마다 구성이 다를 수 있다.**

### 4.2 상세 slide 열람 판정

**A Tier는 2단 게이트다.** SIREN이 관리하는 recipient를 먼저 통과해야 하고, 그다음 그 서비스
자신의 권한을 다시 통과해야 한다. 어느 한쪽이라도 없으면 막힌다 — **workflow Edit Access가
있어도 recipient가 아니면 막힌다.** (예전 설계에서 "workflow Edit Access는 항상 통과"였던
규칙은 폐지한다.)

```ts
canOpenArtifactSlide(user, block, artifact, workflow, project):
  if (isAdmin) return true
  if (!canAccessProject(user, project)) return false

  if (artifact.tier === 'A') {
    // 게이트 1 — SIREN이 관리하는 recipient (그 workflow의 block에 저장, §4.1)
    const recipientLevel =
      matches(user, block.recipients.editAccess, project) ? 'edit' :
      matches(user, block.recipients.viewAccess, project) ? 'view' : null
    if (recipientLevel === null) return false   // 여기서 막히면 그 아래는 물어보지도 않는다

    // 게이트 2 — 그 서비스 자신의 권한 (라이브 조회)
    const access = observer.access(artifact.serviceKey, artifact.externalArtifactId, user.knoxId)
    if (!access.canView) return false           // recipient여도 서비스 권한이 없으면 막힌다

    return true   // 열린다. 버전 트리의 깊이는 access.canEdit 여부로 갈린다 (§7)
  }

  // B / C / D — artifact 자체 권한이 없으면 workflow Edit Access여도 못 연다
  return matches(user, artifact.editAccess, project)
      || matches(user, artifact.viewAccess, project)
```

- **A Tier**: recipient의 edit/view 구분은 workflow의 editAccess/viewAccess와 같은 모양이다
  (부서 다중 + 사용자 다중). recipient에 없으면 그 자리에서 차단되고, 서비스에 물어보지도 않는다.
  recipient에 있어도 **그 서비스에서 view 권한이 없으면 역시 막힌다** — recipient는 SIREN 쪽
  게이트일 뿐, 실제 데이터 접근은 여전히 그 서비스가 최종 판정한다.
  - 이 규칙 때문에 workflow를 만든 사람이 자기가 등록한 A Tier 산출물의 slide를 못 여는 상황이
    생길 수 있다(recipient에 아직 자신을 안 넣었다면). **의도된 동작이다** — recipient를
    편집하는 권한(§4.3, workflow Edit Access)과 recipient에 속하는 것은 별개다.
  - 연동 서비스 쪽에 `access` 엔드포인트가 필요하다 —
    [prompts/a-tier-recipient-integration.md](prompts/a-tier-recipient-integration.md) 로 전달한다.
- **B/C/D**: artifact 권한이 없으면 workflow Edit Access가 있어도 차단한다. 실무적으로는 artifact
  권한도 부서 단위로 넣기 때문에 workflow Edit Access가 있으면 대개 artifact 권한도 함께 갖는다.
- 열지 못할 때는 "권한 없음"을 명확히 렌더한다. **"아직 publish된 버전이 없음"과 절대 같은 화면을
  쓰지 않는다.**

### 4.3 Artifact 권한 부여

| 대상 | 후보 범위 |
|---|---|
| 부서 | `Project.departments`. **다중** |
| 개별 사용자 | **전사 검색**. **다중** |

workflow와 동일한 규칙이다(§3.3). B/C/D의 `editAccess`/`viewAccess`, A Tier의 block별
`recipients.editAccess`/`recipients.viewAccess` 모두 이 규칙을 따른다.

- **편집 권한**(누가 이 recipient/access 목록을 고칠 수 있는가)은 여기서 다루는 "recipient에
  속하는 것"과 별개다 — recipient 목록을 편집하는 권한은 그 workflow의 **Edit Access**다
  (04장 §3.3).

### 4.4 Artifact 권한의 공유 범위

| Tier | 공유 범위 |
|---|---|
| B/C/D의 `editAccess`/`viewAccess` | **artifact 하나에 붙고, 그 과제 안의 모든 workflow가 같은 값을 본다.** 같은 산출물이 여러 workflow 캔버스에 놓여도 권한은 한 곳에서만 관리된다. **(가정 P3)** |
| A Tier의 `recipients` | **block(=그 workflow 안의 자리)에 붙는다.** 같은 artifact가 여러 workflow에 놓이면 각 workflow가 **독립된 recipient 구성**을 갖는다(§4.1) |

---

## 5. BE 재검증 원칙

FE의 판정 함수는 **UX 게이트일 뿐**이다. 이 원칙은 타협하지 않는다.

- 모든 쓰기 API는 Guard에서 권한을 **다시** 검증한다.
- 민감 필드는 응답 조립 단계에서 마스킹한다. 마스킹은 **단일 통로 함수**를 반드시 거친다
  (`toWorkflowDto()`, `toArtifactDto()`, `toReleaseDto()`).
- 특히 다음은 FE가 숨기는 것으로 부족하고 **응답에서 빠져야** 한다:
  - 열람 권한이 없는 artifact의 버전 라벨 · 링크 · 경로
  - publish되지 않은(working) 버전
  - 권한 없는 workflow의 캔버스 전체
- 마스킹은 **저장 시점이 아니라 열람 시점 기준**으로 매번 재판정한다. 과거 release를 열어도
  "지금 이 사람의 권한"으로 판정한다.

---

## 6. 사용자 표시 (SDPCommonAPI)

- DB에는 **KnoxID만** 저장한다. 이름을 복제 저장하지 않는다.
- 화면 표시용 이름은 **SDPCommonAPI**에서 조회하며, **한글명과 영문명을 모두** 받아
  시스템 언어에 맞춰 표시한다.
- 조회 실패 시에는 KnoxID를 그대로 노출한다(빈칸으로 두지 않는다).
- 사용자 검색(권한 추가용)도 같은 API를 쓰며, **KnoxID 또는 이름**으로 검색한다.
- 프론트는 조회 결과를 세션 캐시에 담아 같은 사람을 반복 조회하지 않는다.
