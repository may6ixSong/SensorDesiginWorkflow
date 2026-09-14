# 04. Artifact · Publish · Recipient

> **용어 확인** — 산출물이 자기 서비스 안에서 공식 버전을 확정하는 것이 **publish**다.
> workflow가 부서에게 전달하는 **release**(05장)와 혼동하지 않는다.

## 1. Artifact는 1급 실체다

예전에는 캔버스의 노드(`deliverables`)가 버전과 권한을 직접 들고 있었다. 이제 분리한다.

```
Block (캔버스 위의 자리)  ──artifactId──▶  Artifact (실체)
  · workflowId, phaseId                     · tier, 권한, recipient
  · layout                                  · publish 이력(versions)
  · intent                                  · 과제 단위로 공유
```

같은 artifact가 여러 workflow의 캔버스에 놓일 수 있고, 그때도 **권한과 버전 이력은 하나**다.
**(가정 P3 — artifact는 과제 단위로 스코프된다)**

### 1.1 Mapping은 같은 과제 안에서만

block을 artifact에 매핑할 때(=출처를 지정할 때), 후보는 **그 workflow와 같은 project(=같은
`code` + `revision`)의 artifact로 한정**한다. `code`가 같아도 `revision`이 다르면 완전히 다른
project이므로 후보에 나오지 않는다(02장 §1). Admin이 여러 project를 동시에 조회할 수 있어도
이 제약은 그대로다 — 다른 project의 artifact를 끌어와 매핑하려 하면 BE가 400으로 거부한다.

---

## 2. Tier 정의

| Tier | 이름 | SIREN이 아는 것 | 화면 표시(04장 §6) | 전형적 대상 |
|---|---|---|---|---|
| **A** | Live | 버전·giver를 동기 조회. 서비스가 권한까지 판정 | Live Service | 계약을 맞춘 RPM·SimHub 등 Hub 등록 서비스 |
| **B** | Synced | 버전이 자동 갱신되나 이벤트 시점 기준 | File Artifacts | **Calypso**(SIREN 내장 파일형 산출물 등록) |
| **C** | Linked | 자동 갱신 없음. 링크만 있고 버전은 사람이 입력 | HPC Path(항상 잠김) | HPC망 경로형 산출물(미연동) |
| **D** | Attested | 시스템 자체가 없음. 출처를 자유 텍스트로 기록 | External / Attested(받는 전용) | 팀·회사 밖에서 생성 |

★ **UI에는 Tier 글자를 노출하지 않는다** — "새 Artifact 추가" 다이얼로그는 항상 위 표의
"화면 표시" 열 이름으로만 보여준다(04장 §6). Calypso가 A가 아니라 B인 이유, Calypso가
Live Service 목록에 없는 이유는 §3.1·§6.3 참고 — Calypso는 애초에 Hub 레지스트리 대상이
아니다.

- **망(`network: OA | HPC`)은 원래 tier와 직교하는 축으로 설계됐지만, 04장 §6의 3버튼 UI에서는
  실질적으로 소스 선택이 network까지 함께 결정한다** — Live Service/File Artifacts는 OA,
  HPC Path는 HPC로 만들어진다. 스키마 필드 자체는 그대로 두되(값을 자유롭게 못 바꾸는 것도
  아니다), 지금 UI가 만드는 조합은 이 둘뿐이다.
- **tier는 산출물이 아니라 버전 엔트리의 속성이다.** 나중에 실연동이 붙어도 과거 수동 기록을
  고치거나 옮기지 않는다 — 다음 엔트리가 다른 tier로 찍힐 뿐이다. 따라서 tier 승격에
  마이그레이션 로직이 필요 없다.
- 버전 개념이 없는 HPC 경로형 산출물은 `versionLabel = 경로(또는 basename)`,
  `versionRef = "{path}@{registeredAt}"` 을 대체값으로 쓴다.

### 2.1 A Tier가 SIREN에 넘기는 버전 — "official"만

A Tier 서비스는 **자기 내부 버전 체계를 그대로 유지**한다. SIREN에 넘길 때는 그중 **official하게
확정된 것만** 넘긴다.

- 서비스가 minor 단위까지 명확히 태깅하고 있다면(예: `v1.3`), 그 minor까지 그대로 넘겨도 된다 —
  "official" 여부는 버전 자릿수가 아니라 **그 서비스가 공식 값으로 확정했는지**로 판단한다.
- **RPM처럼 minor 개념이 없고 snapshot만 찍는 서비스**는, 확정된 release 버전들에 더해
  **`latest(+)` 항목 하나만** 함께 보낸다 — 지금 구현된 RPM 어댑터가 하는 방식 그대로다.
  `latest(+)`는 아직 official 버전으로 확정되지 않은 작업중 snapshot의 자리표시자이며,
  `isPublished: false` 로 표시해 그 산출물의 giver에게만 보인다(§7).
- 서비스가 사람이 알아볼 수 없는 내부 빌드 번호·해시만 갖고 있고 official 버전이 전혀 없다면,
  그 상태 그대로는 넘기지 않는다 — 최소한 "release 버전 + latest(+)" 두 종류로는 정리해서 넘긴다.

---

## 3. 권한과 Recipient — Tier에 따라 소유자가 다르다

이번 개정의 핵심 정책이다.

| | **A Tier** | **B / C / D Tier** |
|---|---|---|
| Edit / View 권한 | **그 서비스**가 관리 | **SIREN**이 artifact 단위로 보관 |
| SIREN에서 권한 편집 | 불가 | 가능 (B는 Artifact page에서 하는 것이 정석) |
| Recipient 저장 위치 | **SIREN이 block(=그 workflow의 자리) 단위로 저장** | artifact 자체(`viewAccess`) |
| Recipient가 여러 workflow에서 같은가 | **아니다.** 같은 artifact도 workflow마다 recipient 구성이 다를 수 있다 | **그렇다.** 한 군데(Calypso/HPC 공용 DB)서 중앙 관리되므로 어느 workflow에서나 동일 |
| Recipient와 slide 열람의 관계 | **게이트로 쓰인다** — recipient가 아니면 slide가 막힌다(§4.1) | 동일한 목록이 곧 열람 권한이다 |

### 3.1 왜 A Tier만 다른가

A Tier는 그 서비스가 자기 권한 체계로 versioning·열람을 통제한다. SIREN이 그 체계에 개입하면
서비스와 강한 의존이 생긴다. 그래서 **SIREN은 A Tier의 실제 데이터 접근 권한에는 손대지 않는다**
— 그건 항상 그 서비스가 최종 판정한다.

다만 recipient는 **release 알림 대상**이면서 동시에 **SIREN 쪽 slide 열람의 첫 번째 게이트**로도
쓰인다(§4.1). "recipient = 알림 대상"과 "recipient = 그 서비스의 실제 권한"은 여전히 무관하다 —
recipient에 들어 있어도 그 서비스에서 view 권한이 없으면 결국 slide는 막힌다.

### 3.2 B/C/D는 View = Recipient

별도 recipient 필드를 두지 않는다. `viewAccess` 가 단일 진실이고, 화면에는 recipient로 보여준다.

- 응답 DTO는 `recipients = viewAccess` 로 채워 내려준다(FE가 tier별 분기를 하지 않도록).
- 단 **편집은 `viewAccess` 를 통해서만** 가능하다.
- B/C/D는 Calypso나 HPC 공용 DB처럼 **권한이 한 군데서 중앙 관리**되므로, 이 목록은 artifact
  하나에 붙고 그 artifact를 참조하는 모든 workflow에 **동일하게** 적용된다(01장 §4.4).

### 3.3 A Tier — recipient는 block에, edit/view 구조로

A Tier는 `Block.recipients`(02장 §4)에 저장하며, workflow의 editAccess/viewAccess와 같은
모양이다 — 부서 다중 + 사용자 다중, **edit/view 두 단계**로 나뉜다.

```ts
Block.recipients = {
  editAccess: { departments: string[], users: string[] },
  viewAccess: { departments: string[], users: string[] },
}
```

- 같은 artifact가 workflow X와 workflow Y 양쪽에 놓여 있어도, X의 block과 Y의 block은
  **서로 다른 recipients**를 가질 수 있다 — X는 AA·BB 부서에게, Y는 CC 부서에게만 알림이
  가는 식으로 독립적으로 구성한다.
- `editAccess`/`viewAccess` 두 단계를 두는 이유는 §4.1의 slide 열람 판정과 §7의 버전 트리
  깊이 판정에 그대로 쓰기 위해서다 — workflow/artifact 권한과 같은 모양을 유지하면 FE 컴포넌트를
  재사용할 수 있다.
- **`recipients`에 사람을 넣는 것 자체가 그 서비스의 권한을 부여하지 않는다.** 그 서비스에서
  실제로 view/edit 권한이 없는 사람을 recipient에 넣으면, 그 사람은 여전히 slide가 막힌다
  (§4.1 게이트 2). recipient 관리자가 이를 인지하고 구성해야 한다.

### 3.4 Recipient 설정(편집) 권한

- 현재: **workflow의 Edit Access 전원**. (B/C/D는 artifact의 Edit Access, A는 그 block이 속한
  workflow의 Edit Access.)
- 향후: A Tier 산출물을 실제로 연동할 때는 **그 A Tier 서비스의 edit 권한자만** 설정할 수 있게
  좁힌다. 지금은 그 판정을 물어볼 곳이 없으므로 workflow Edit Access로 둔다.
  ```ts
  // TODO: A Tier 서비스 연동이 붙으면, observer 의 access 응답에서 canEdit 를 받아
  //       recipient 편집 권한을 그 값으로 대체한다.
  ```

### 3.5 다중 선택

**부서는 어디서든 여러 개 넣을 수 있다.** recipient도, artifact의 edit/view도, workflow의
edit/view도 전부 `departments: string[]` 이다. 개별 사용자도 마찬가지로 다중이다.

---

## 4. 상세 slide 열람 규칙

판정 로직은 [01-permissions.md §4.2](01-permissions.md)에 있다. 화면 관점에서 다시 정리한다.

### 4.1 A Tier — 2단 게이트

```
게이트 1 (SIREN)   그 block의 recipients(edit 또는 view)에 속하는가?
                     아니다 → 막힌다. 서비스에 물어보지도 않는다.
                     맞다   → 게이트 2로

게이트 2 (서비스)   그 서비스에서 view 권한이 있는가? (라이브 조회)
                     없다 → 막힌다.
                     있다 → 열린다. canEdit 여부로 버전 트리 깊이가 갈린다(§7).
```

- **workflow Edit Access가 있어도 recipient가 아니면 막힌다.** 이건 기존 설계("workflow Edit
  Access는 항상 열린다")에서 바뀐 부분이다 — 지금은 recipient에 먼저 속해야 한다.
- recipient에 속해도 그 서비스에서 view 권한이 없으면 역시 막힌다 — recipient는 SIREN 쪽
  게이트일 뿐, 실제 데이터 접근은 그 서비스가 최종 판정한다.
- 연동 서비스에 `access` 엔드포인트가 필요하다 —
  [prompts/a-tier-recipient-integration.md](prompts/a-tier-recipient-integration.md)로 전달한다.

### 4.2 B / C / D Tier

```
열린다  ← 그 artifact의 editAccess 또는 viewAccess에 해당하는 사람
막힌다  ← 그 외 전원 (workflow Edit Access가 있어도 막힌다)
```

실무적으로는 artifact 권한도 부서 단위로 넣기 때문에, workflow Edit Access가 있으면 대개
artifact 권한도 같이 갖게 된다. 그래도 판정의 근거는 artifact 권한이다.

### 4.3 "권한 없음" 과 "아직 publish 없음" 은 다른 화면이다

| 상황 | 화면 |
|---|---|
| 열람 권한 없음 | slide를 열지 않는다. 캔버스에 머무르며 "접근 권한이 없습니다" 토스트 |
| 열람 권한 있음 · published 버전 0개 | slide는 열리고, 버전 목록에 **"아직 publish된 버전이 없습니다"** |

이 둘을 절대 같은 문구로 처리하지 않는다.

### 4.4 slide 내부 콘텐츠

**이번 범위 밖이다(TODO T1).** 대규모 개편이 예정되어 있다. 이번에는 아래만 반영한다.

- Recipient 탭의 신설/개편 (§5)
- 권한에 따른 열람 차단 (§4.1, §4.2)
- 버전 목록의 `published` / `not published` 표기 (용어 통일)

---

## 5. Recipient 탭

artifact 상세 slide 안의 탭 하나로 둔다.

| 열람자 | 표시 |
|---|---|
| workflow Edit Access (A Tier) | 편집 가능 — `block.recipients.editAccess`/`viewAccess`에 부서·사용자 추가·삭제 (§3.3) |
| B/C/D artifact Edit Access | 편집 가능 — 실제로는 `viewAccess` 를 편집하는 것 |
| View 권한자 | **읽기 전용으로 노출.** 누가 받는지는 볼 수 있고, 추가/삭제 버튼이 없다 |
| 미매핑 블록 | **탭 자체를 감춘다** |

> A Tier에서 이 탭을 여는 것과 §4.1의 게이트 1을 통과하는 것은 별개다 — workflow Edit Access는
> 탭을 **열어 recipient를 편집**할 수 있게 하지만, 그 사람이 slide 자체를 볼 수 있는지는 여전히
> 자신이 recipient에 속하는지 + 서비스 권한으로 판정한다.

- View 권한자에게 열어주는 이유: 그건 workflow 설정이 아니라 산출물 정보이고, 별도의 view 권한
  근거가 있기 때문이다. **A Tier여도 읽기 전용 열람은 허용한다** — 서비스 권한은 그 서비스가
  차단하므로 SIREN이 이중으로 막을 이유가 없다.
- 부서 후보는 `Project.departments`, 개별 사용자는 전사 검색(KnoxID 또는 이름).
- 사용자 표시는 KnoxID 저장 + SDPCommonAPI 이름 조회(한/영).

---

## 6. "새 Artifact 추가" — 등록·변경 정책 ★T2 반영★

03장 §5.2의 "새 Artifact 추가" 버튼은 이제 **주는(own) / 받는(received) 양쪽 모두** 만든다.
이미 만들어진 block의 artifact를 바꾸는 것("변경")도 같은 규칙, 같은 UI를 그대로 재사용한다 —
Block(자리)과 Artifact(실체)가 분리되어 있으므로(§1) 매핑을 바꾸는 것 자체는 자유롭다.

### 6.1 다이얼로그 흐름

1. **주는지 받는지 고른다** — 이후 모든 pickability 판정이 이 값을 따른다. block 생성 후에는
   바꾸지 않는다("변경"은 무엇을 매핑할지만 바꾸지, own/received 방향 자체는 안 바꾼다).
2. Name, Phase — 기존과 동일.
3. **출처를 고른다.** Tier 글자(A/B/C/D)는 화면 어디에도 노출하지 않는다:

   | 화면 표시 | 내부 Tier | 주는 쪽에 나오는가 | 받는 쪽에 나오는가 |
   |---|---|---|---|
   | **Live Service** | A | O | O |
   | **File Artifacts** | B | O | O |
   | **HPC Path** | C | O(항상 잠김) | O(항상 잠김) |
   | **External / Attested** | D | **X** | O |

   - **HPC Path(C)는 두 쪽 모두 옵션에는 나오지만 항상 선택 불가로 잠겨 있다** — HPC망
     서비스와의 실연동이 아직 구체화되지 않았다(§6.4). 왜 이 옵션이 있는지 알 수 있도록
     project code+revision으로 필터된 mock 데이터를 미리보기로만 보여준다.
   - **External/Attested(D)는 받는 쪽에서만 나온다.** 줘야 하는 artifact를 D로 등록하는
     흐름은 아직 구체화되지 않은 미래 인터페이스로 남겨둔다(§6.4).
4. 고른 출처에 맞는 후보 목록에서 실제 artifact를 고르거나(Live Service/File Artifacts),
   D면 "누가 줄 것으로 기대되는지"만 입력한다.

### 6.2 Pickability — 대칭 규칙

**주는 쪽 후보는 그 tier의 edit 게이트를, 받는 쪽 후보는 그 tier의 view 게이트를 통과한 artifact만
고를 수 있다.** A만 SIREN이 아니라 그 서비스가 최종 판정한다는 게 유일한 예외다.

| Tier | 주는(own) 후보 조건 | 받는(received) 후보 조건 |
|---|---|---|
| **A**(Live Service) | 그 서비스 `canEdit`(라이브 조회) | 그 서비스 `canView`(라이브 조회) |
| **B**(File Artifacts) | Calypso `myAccess === 'edit'` | Calypso `myAccess`가 edit 또는 view |
| **C**(HPC Path) | 불가(잠김) | 불가(잠김) |
| **D**(External/Attested) | 해당 없음(옵션 자체가 없다) | 자유(검증할 시스템이 없다) |

- 후보 목록에는 고를 수 없는 것도 **보여주되 흐리게 표시하고 이유를 붙인다** — "view only,
  edit 권한 필요" 처럼. 조용히 숨기면 "내가 왜 저건 못 고르지"라는 질문에 답을 못 준다.
- 이 판정은 **서버가 후보 목록 조회 시점에 한 번**, **실제 매핑(생성/변경) 시점에 다시 한 번**
  한다(BE 재검증 원칙, 01장 §5) — FE의 pickable은 UX 게이트일 뿐이다.

### 6.3 후보 목록의 출처

- **Live Service(A)** — 이 project에 이미 연결된(Admin이 미리 `POST /projects/:id/service-links`로
  연결) Hub 등록 서비스만 드롭다운에 뜬다. 서비스를 고르면 그 서비스의 observer 계약
  `GET /artifacts?projectId=&knoxId=`(선택 구현, observer-contract-v1.yaml)로 후보를 받고,
  후보마다 `access` 엔드포인트로 canEdit/canView를 물어본다 — 응답이 느릴 수 있어 서비스별로
  병렬 조회한다. 그 서비스가 이 엔드포인트를 구현하지 않았으면(예: RPM) `supported:false`로
  응답하고, 화면은 externalArtifactId를 직접 입력하는 수동 입력으로 폴백한다.
  - **Calypso는 이 목록에 포함되지 않는다.** Calypso는 Hub 레지스트리 대상이 아니고
    (§3.1 — SIREN 내장 기능), File Artifacts(B)의 출처이기 때문이다.
- **File Artifacts(B)** — 출처는 **Calypso다.** Calypso는 SIREN의 projectId를 그대로 쓰므로
  (§11.4 — workflow 개념을 모른다) 별도 code/revision 링크가 필요 없다. Calypso의
  `GET /artifacts?projectId=`가 이미 `myAccess`(edit/view, none은 자체적으로 걸러짐)를 계산해
  주므로 그 값을 그대로 pickability에 쓴다.
  - **다만 이후의 열람·recipient 관리는 Calypso 권한이 아니라 SIREN 자신의
    `artifact.editAccess`/`viewAccess`가 단일 진실이다** — B/C/D는 원래 SIREN이 권한을 직접
    들고 있는 tier이기 때문이다(§3). Calypso 접근은 "고를 수 있는가"를 거르는 문지기일
    뿐이다. 그래서 처음 등록 시 등록자를 자동으로 `editAccess`에 넣어 두고, 그 뒤로는 기존
    Recipients 탭(`PUT /artifacts/:id/access`)에서 그대로 넓히면 된다 — 새 UI를 따로 만들지
    않는다.
- **HPC Path(C)** — `HpcPathMock` 컬렉션(project code+revision으로 필터)에서 미리보기만 조회한다.
  실제 서비스 연동이 없으므로 `serviceKey`도, 진짜 후보 pickability도 없다 — 전부
  `pickable: false`다.
- **External/Attested(D)** — 후보 목록 자체가 없다. 이름과 "누가 줄 것으로 기대되는지"
  (`Artifact.expectedGiver` — 부서/사용자 다중, §6.4)만 입력하면 바로 새 D Tier artifact가
  만들어진다.

### 6.4 D Tier — 받는 전용, 그리고 남겨둔 TODO

- **D는 이번 라운드에서 받는 쪽에서만 만든다.** `expectedGiver`는 권한이 아니라 화면 표시용
  메타데이터일 뿐이다 — SIREN이 검증할 시스템이 없으므로 강제할 방법도 없다.
- **줘야 하는 쪽의 D는 아직 구체화되지 않았다.** 장차 어떤 외부 interface를 통해 값이 들어오면
  SIREN(Hub)이 그 메시지를 받아 그 workflow 안에서 자체적으로 versioning하는 방식을 생각하고
  있다 — 지금은 그 인터페이스가 없으므로 옵션 자체를 주는 쪽 다이얼로그에서 뺀다.
  ```ts
  // TODO: 줘야 하는 쪽 D Tier 인터페이스가 붙으면, 그 메시지를 받는 엔드포인트와
  //       그 workflow 자체 버전 관리 로직을 여기에 연결한다.
  ```

### 6.5 한 workflow 안에서 같은 artifact 중복 금지

**같은 workflow 안에서 같은 artifact를 두 개의 block에 매핑할 수 없다 — 주는/받는 모두 마찬가지다**
(사용자 결정). release의 source 버전 지정이 block 단위이기 때문에, 같은 artifact가 두 block에
걸리면 어느 block이 진짜 upstream인지 flow edge 판정이 모호해지고, release 표에도 같은 산출물이
중복으로 찍힌다. block 생성·재매핑 양쪽에서 `(workflowId, artifactId)` 조합의 유일성을 서버가
검증한다 — **다른 workflow에서 같은 artifact를 재사용하는 것은 여전히 허용된다**(§1의 project 단위
공유 원칙 그대로).

### 6.6 재매핑("변경")과 recipient

이미 매핑된 block의 artifact를 바꾸면 **`block.recipients`(A Tier)를 초기화한다.** 이전
recipient 구성이 새 artifact에도 유효하다는 보장이 없기 때문이다 — 조용히 남겨두면 의도치 않은
부서에 알림이 갈 수 있다. Edit Access 보유자가 재매핑 직후 다시 구성해야 한다.

### 6.7 API

```
GET /workflows/:workflowId/artifact-sources/live-services
→ 이 project에 연결된 A Tier(Live Service) 후보 서비스 목록.

GET /workflows/:workflowId/artifact-candidates?source=live|file|hpc&intent=own|received&serviceKey=
→ §6.2 규칙으로 pickable까지 판정된 후보 목록. source=live는 serviceKey 필수.
  A Tier는 서비스별 observer 호출이 있어 응답이 느릴 수 있다.

POST /workflows/:workflowId/blocks       { name, phaseId, layout, intent, artifactId? | newArtifact? }
PATCH /blocks/:id                        { name?, artifactId? | newArtifact? }
→ newArtifact = { source: 'live'|'file'|'attested', name, serviceKey?, externalArtifactId?, expectedGiver? }
  둘 다 §6.2를 서버가 다시 검증하고(§6.5의 중복 금지 포함), find-or-create 또는 신규 생성 후
  block에 매핑한다.
```

---

## 7. 버전 가시성

| 열람자 | 볼 수 있는 버전 |
|---|---|
| 그 산출물의 **giver**(= artifact Edit 권한자, A는 서비스 판정) | 전체 (미발행 working 포함) |
| 그 외 **전원** (recipient 포함) | `isPublished: true` 인 버전만 |

- 이 판정은 **산출물 하나하나마다** 이뤄진다. 같은 캔버스 안에서 노드 A는 전체가 보이고 노드 B는
  published만 보이는 상태가 동시에 존재한다.
- BE는 응답 조립 시 **단일 통로 함수**(`toArtifactDto()`)에서 마스킹한다. FE가 숨기는 것으로는 부족하다.
- A Tier의 상세 slide는 열 때마다 그 서비스에 라이브 조회한다(캔버스 렌더링은 조회하지 않는다).
- **A Tier의 "giver 여부"는 §4.1 게이트 2의 `access.canEdit` 로 판정한다** — recipient에
  edit로 들어 있어도, 그 서비스에서 edit 권한이 없으면 working 버전은 안 보인다. 즉 A Tier의
  버전 트리 깊이는 최종적으로 **그 서비스의 응답**이 결정한다.

---

## 8. `isReleased` → `isPublished` 개명

용어 통일(README §1)에 따라 데이터·코드·화면 문구를 전부 바꾼다.

| 위치 | 변경 |
|---|---|
| 스키마 필드 | `isReleased` → `isPublished` |
| observer 계약 | `observer-contract-v1.yaml` 의 필드명은 **그대로 둔다**(외부 계약이라 함부로 못 바꾼다). SIREN 쪽 어댑터에서 매핑한다 |
| i18n 키 | `artifact.released` → `artifact.published` |
| 화면 문구(ko) | "릴리즈됨" → "발행됨", "미릴리즈" → "미발행" |
| 화면 문구(en) | "Released" → "Published", "Not released" → "Not published" |

> 어댑터 매핑 지점 — `api/src/hub/observer-client.service.ts` 에서 외부 응답의 `isReleased` 를
> 내부 모델의 `isPublished` 로 옮기고, 그 한 줄에 이유를 주석으로 남긴다.
