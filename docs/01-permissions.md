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
  │    └─ Artifact  A/B/C(OA Service/File Artifacts/HPC Service): 그 서비스 자신의 canView/canEdit
  │                 (예외 없음 — 셋 다 동일. recipient는 관여하지 않는다)  ← 상세 slide · 버전 열람 판정
```

---

## 1. Admin

- 시스템 전체 **super 권한**이다.
- 이 문서 어디에도 "Admin은 예외" 라고 안 써 있어도, **모든 규칙에 대해 Admin은 통과**한다.
  단 하나의 예외는 §3.4의 "workflow 소속 부서의 Edit Access 항목 삭제"뿐이다 — 그건 Admin도 못 한다.
- FE의 판정 함수는 전부 `isAdmin` 을 첫 번째 단락으로 받는다. BE Guard도 동일하게 재검증한다.
- **여기서 말하는 Admin은 "지금 유효 신원"이다.** 사용자 시뮬레이터가 켜져 있으면 유효 신원은
  대상 사용자이므로, 대상이 non-admin이면 이 절의 super 권한은 **하나도 적용되지 않는다**(§7).

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

**Information page의 일정표(`ProjectTimeline`)는 "보여주되 잠근다"를 phase 단위까지 그대로
적용한다**(사용자 결정) — `WorkflowDto.phases`/`phaseWidths`는 권한이 없어도(`myAccess ===
null`) 실제 값이 내려간다(`toWorkflowDto()`가 "이름·부서 외엔 담지 않는다"고 두는 값 중
**유일한 예외**). 그 위에 행 전체를 시각적으로 잠그고(음영) 클릭을 막는 것은 FE 책임이다 —
phase는 이름·날짜뿐이라 공개해도 캔버스·산출물·권한 목록이 새는 게 아니다.

### 3.8 Workflow Settings 접근

- Settings 진입 버튼(연필)은 **Edit 권한자에게만** 보인다. View 권한자는 버튼 자체가 없다.
- Permissions 탭도 View 권한자에게 열지 않는다.
- **artifact 상세 slide의 Recipients 탭과 Comments 탭도 이 절과 같은 기준**으로 닫는다
  (사용자 결정, 04장 §4.2 갱신 — 예전엔 "View 권한자도 Recipient는 읽기 전용으로
  본다"였다). View 권한자, 그리고 그 artifact 자체의 편집 권한이 있거나 recipient로
  등록된 사람이어도 workflow Edit Access가 없으면 두 탭 모두 아예 노출되지 않는다 —
  slide를 열 수 있는지(overview)와는 완전히 별개의 판정이다.

---

## 4. Artifact 계층

상세는 [04-artifact-and-publish.md](04-artifact-and-publish.md)에 있고, 여기서는 권한 판정만 정리한다.

### 4.1 Tier별 소유권

★ **이 절은 v3 설계 도중 세 번 뒤집혔다.** 최초 설계는 "A만 서비스가 권한을 관리하고 B/C/D는
SIREN이 artifact 단위로 보관한다"였는데, 여러 workflow가 하나의 artifact를 공유할 때 한
workflow의 수정이 다른 workflow까지 번지는 문제, 그리고 HPC Service는 HPC망 안에서 사실상
권한 자체가 무의미하다는 점 때문에 **A/B/C(OA Service/File Artifacts/HPC Service) 전부 A의
방식으로 통일**했다(04장 §3). 이어서 D(External/Attested)의 artifact 단위 SIREN 보관 권한
(editAccess/viewAccess/expectedGiver)도 완전히 폐기하고 recipient를 block 단위로 통일했다.
**마지막으로 D 자체를 폐기했다** — 실제 접근 통제·버전 이력을 가질 근거가 없던 tier를 두는
대신, File Artifacts(B, Calypso)가 OA-link/HPC-path 참조형 콘텐츠까지 갖도록 넓혀 그 역할을
대체했다(04장 §2, §6). 그 결과 recipient는 이제 **A/B/C 전부 예외 없이 block 단위**다 —
artifact는 권한을 전혀 들고 있지 않는다.

| Tier | 실제 Edit/View를 누가 판정하나 | Recipient |
|---|---|---|
| **A/B/C** (OA Service/File Artifacts/HPC Service) | **그 서비스**가 관리. SIREN은 관여하지 않는다 | SIREN이 **block(=workflow 안의 자리) 단위로 저장**. 같은 artifact도 workflow마다 recipient 구성이 다를 수 있다 |

recipient를 **그 workflow의 block에** 붙이는 이유는, 권한을 그 서비스가 관리하고 SIREN은 알
방법이 없기 때문이다 — 같은 artifact라도 workflow X에서는 AA·BB 부서가 받고, workflow Y에서는
CC 부서만 받는 식으로 **workflow마다 구성이 다를 수 있다.** (recipient의 **역할**은 §4.2에서
바뀌었다 — 지금은 release 알림 대상 + Recipients/Comments 탭 표시 대상일 뿐, slide 열람 게이트가
아니다.)

### 4.2 상세 slide 열람 판정

**A/B/C(OA Service/File Artifacts/HPC Service) 전부 그 서비스 자신의 권한 하나로만 정해진다.**
block.recipients는 여기 관여하지 않는다.

```ts
canOpenArtifactSlide(user, artifact, project):
  if (isAdmin) return true
  if (!canAccessProject(user, project)) return false

  // A / B / C 공통 — 그 서비스 자신의 권한 (라이브 조회. File Artifacts는 SIREN BE가 Calypso에 대신 묻는다)
  const access = observer.access(artifact.serviceKey, artifact.externalArtifactId, user.knoxId)
  if (access.canEdit) return true
  if (access.canView) return true
  return false
```

- **이전 버전(v3 초안)은 여기가 2단 게이트였다** — SIREN이 관리하는 block.recipients를 먼저
  통과해야 그다음 서비스 권한을 물었다. 그 결과 "같은 부서가 만든 workflow인데, artifact
  자체는 view 제한이 없는데도, 그 block의 recipient가 다른 부서로 지정돼 있으면 못 여는"
  상황이 나왔다(사용자 보고, `api/src/common/actor.spec.ts`/`artifact-access.service.spec.ts`에
  이 시나리오의 회귀 테스트가 있다). recipient 게이트가 있던 이유(같은 artifact도 workflow마다
  다른 대상에게 보여주고 싶을 수 있다, §4.1)는 여전히 유효하지만, 그 필요를 위해 매 block마다
  recipient를 일일이 채워 넣어야만 열리는 대가가 너무 컸다 — 그래서 **"열람 자체"는 서비스
  권한 하나로 풀고, recipient는 그 위에 얹는 표시/알림 레이어로 좁혔다**(사용자 결정).
- 열지 못할 때는 "권한 없음"을 명확히 렌더한다. **"아직 publish된 버전이 없음"과 절대 같은 화면을
  쓰지 않는다.**
- 연동 서비스 쪽에 `access` 엔드포인트가 필요하다는 점은 그대로다 —
  [prompts/a-tier-recipient-integration.md](prompts/a-tier-recipient-integration.md) 로 전달한다.

### 4.3 Artifact 권한 부여

| 대상 | 후보 범위 |
|---|---|
| 부서 | `Project.departments`. **다중** |
| 개별 사용자 | **전사 검색**. **다중** |

workflow와 동일한 규칙이다(§3.3). A/B/C 전부 block별 `recipients`(부서 다중 + 사용자 다중
단일 grant) 모양을 따른다.

- recipient 목록을 **편집**하는 권한은 그 workflow의 **Edit Access**다(04장 §3.3) — 지금까지와
  같다.
- recipient 목록을 **읽는(보는) 것도 이제 같은 기준**이다(§3.8, 04장 §4.2 갱신) — recipient에
  **속하는 것**(과거엔 이게 열람 게이트였다)은 더 이상 어떤 권한도 주지 않는다. Recipients 탭
  자체가 workflow Edit Access가 없으면 노출되지 않으므로, "내가 recipient인지 확인하러 그
  탭을 연다"는 시나리오는 더 이상 성립하지 않는다 — recipient 여부는 이제 순수하게 release
  알림이 오는지로만 체감된다.

### 4.4 Artifact 권한의 공유 범위

| Tier | 공유 범위 |
|---|---|
| A/B/C의 `recipients` | **block(=그 workflow 안의 자리)에 붙는다.** 같은 artifact가 여러 workflow에 놓이면 각 workflow가 **독립된 recipient 구성**을 갖는다(§4.1). 실제 Edit/View 권한은 SIREN이 아니라 그 서비스가 판정하므로 여기서 "공유"할 것 자체가 없다 |

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

---

## 7. 사용자 시뮬레이터 (User Simulator)

Admin이 **특정 사용자의 화면을 그대로 재현**해 권한 관련 버그를 진단하는 기능이다.
입구는 상단 바의 ProfileButton 하나뿐이고, 그 진입 게이팅은 항상 **실제 로그인 사용자**
기준이다(`isRealAdmin`) — 그래야 non-admin을 시뮬레이션하는 순간 Admin이 자기 Stop 버튼을
잃어버리지 않는다.

### 7.1 단 하나의 규칙

> **시뮬레이션 중에는 Admin의 super 권한이 전부 사라진다. 그 사용자로 새로 접속한 것과
> 정확히 같아야 한다.**

§1의 "Admin은 전 계층 무조건 통과"는 **지금 유효 신원이 Admin일 때만** 적용된다. 대상이
non-admin이면, 실제 호출자가 Admin이어도 그 요청은 전 계층에서 non-admin으로 판정된다.
관리 기능(Service Manage 등)을 실제로 쓰려면 **시뮬레이터를 먼저 꺼야 한다.**

### 7.2 두 개의 축을 절대 합치지 않는다

| 질문 | 기준 | 헤더 | `Actor` 필드 |
|---|---|---|---|
| 이 시뮬레이션을 켤 자격이 있는가 | 실제 호출자 | `X-User-Group` | `callerIsAdmin` |
| 지금 이 요청의 권한은 무엇인가 | 유효 신원(= 대상) | `X-Acting-As-Group` | `isAdmin` |

- `X-Acting-As`는 **검증된 실제 호출자가 Admin일 때만** 반영된다. 아니면 403이다.
- `X-Acting-As-Group`이 없으면 대상을 **non-admin으로 본다**(fail-closed). 권한이 새는
  쪽보다 덜 보이는 쪽이 안전하다.
- 대상이 Admin이면 그 사람 본인의 Admin 권한은 그대로 산다 — "그 사람이었다면"이 규칙이다.

★ **이 표의 두 줄을 한 헤더로 겸하게 만들면 기능이 통째로 무력화된다.** 실제로 그렇게
  깨진 적이 있다 — `Actor.isAdmin`이 실제 호출자 기준으로 남아 §1이 그대로 먹는 바람에,
  권한 없는 사용자를 시뮬레이션해도 My Assignment의 모든 release·artifact, 모든 workflow의
  편집, Calypso artifact 전체 목록과 editor 권한 지정까지 전부 열렸다. 회귀 테스트는
  `api/src/common/actor.spec.ts`에 있다.

### 7.3 판정은 `actor.isAdmin` 한 곳에만 건다

`resolveActor()`가 이미 유효 신원 기준으로 `isAdmin`을 세우므로, 호출부는 **그 값만 보면
된다.** `actor.isAdmin && !actor.isImpersonating` 같은 보정을 호출부에서 하지 않는다 —
예전에 그렇게 몇 군데만 손으로 발라 둔 적이 있고, 빠진 자리(`access.ts`,
`my-scope.service.ts` 등)가 곧 위 버그였다. 그 보정은 Admin이 다른 Admin을 시뮬레이션할 때
대상이 실제로 가진 권한까지 없애는 부작용도 있었다.

### 7.4 기록은 항상 실제 행위자로 남는다

쓰기는 대상 사용자의 권한으로 판정되지만, 그 쓰기를 **실행한 사람은 Admin 본인**이다.
`AuditService.log()`에는 `Actor`를 통째로 넘긴다 — `actorKnoxId`에는 `realKnoxId`가 남고,
시뮬레이션 중이었다는 사실과 그때의 유효 신원은 `meta.actingAs`에 함께 남는다.

### 7.5 화면 쪽

- `useAuth().isAdmin` = **유효 신원 기준**(시뮬레이션 중이면 대상). 페이지 권한 체크는 전부 이 값.
- `useAuth().isRealAdmin` = 실제 로그인 사용자 기준. 시뮬레이터 컨트롤과 Service Manage 진입만 이 값.
- 시뮬레이션을 켜고 끌 때 **react-query 캐시를 통째로 비운다**(`qc.clear()`) — 이전 신원으로
  받아 둔 응답이 그대로 보이면 재현이 거짓말이 된다.
- 이름·부서·언어·테마까지 전부 대상 사용자 것으로 바꾼다. 대상이 플랫폼에 등록되지 않은
  사람이면 `AccessDeniedPage`로 막히는데, **그것도 재현하려는 동작이다** — 시뮬레이션 자체를
  거부하지는 않는다.
