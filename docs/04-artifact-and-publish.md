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

★ **내부 값(DB에 저장되는 글자 A/B/C/D)과 사람이 보는 이름은 분리한다.** UI·문서·주석은 전부
아래 "이름" 열을 쓴다 — "Tier A"처럼 글자로 부르지 않는다. `Tier` 타입과 enum 값 자체는
바꾸지 않는다(실데이터 마이그레이션이 아니라 표기 문제이기 때문).

| 내부 값 | 이름 | 망 | SIREN이 아는 것 | 전형적 대상 |
|---|---|---|---|---|
| **A** | **OA Service** | OA | push event로 버전 메타 수신 + 야간 전체 재동기화(07장). canView/canEdit·html-view는 열람 시점에 그 서비스에 라이브로 묻는다 | 계약을 맞춘 RPM·SimHub 등 Hub 등록 서비스 |
| **B** | **File Artifacts** | OA | 위와 동일한 event 기반 — 대상은 **Calypso 하나뿐**이고 SIREN 내장이라 Hub 레지스트리(Service Manage)에는 없다 | **Calypso**(SIREN 내장 파일형 산출물 등록) |
| **C** | **HPC Service** | HPC | 위와 동일한 event 기반 — 단 실제 설계 데이터·파일은 전송하지 않는다. 버전 메타(라벨·경로·발행자)만 오간다 | HPC망 경로형 산출물(양방향 API 연동) |
| **D** | **External / Attested** | 없음 | 시스템 자체가 없음. 출처를 자유 텍스트로 기록 | 팀·회사 밖에서 생성. 이번 범위에서는 세부를 구체화하지 않는다(§6.4) |

★ **UI에는 A/B/C/D 글자를 노출하지 않는다** — "새 Artifact 추가" 다이얼로그는 항상 위 표의
"이름" 열로만 보여준다(04장 §6). Calypso가 OA Service가 아니라 File Artifacts인 이유, Calypso가
OA Service 목록에 없는 이유는 §3.1·§6.3 참고 — Calypso는 애초에 Hub 레지스트리 대상이
아니다.

- **망(`network: OA | HPC`)은 원래 tier와 직교하는 축으로 설계됐지만, 04장 §6의 3버튼 UI에서는
  실질적으로 소스 선택이 network까지 함께 결정한다** — OA Service/File Artifacts는 OA,
  HPC Service는 HPC로 만들어진다. 스키마 필드 자체는 그대로 두되(값을 자유롭게 못 바꾸는 것도
  아니다), 지금 UI가 만드는 조합은 이 둘뿐이다.
- **tier는 산출물이 아니라 버전 엔트리의 속성이다.** 나중에 실연동이 붙어도 과거 기록을
  고치거나 옮기지 않는다 — 다음 엔트리가 다른 tier로 찍힐 뿐이다. 따라서 tier 승격에
  마이그레이션 로직이 필요 없다.
- **HPC Service는 더 이상 "항상 잠김"이 아니다.** HPC망과의 양방향 API 연동이 확정되면서
  OA Service/File Artifacts와 같은 라이브 게이트·event 대상이 됐다(§6.2, §6.3, 07장). 다만
  실 설계 데이터·파일 자체는 여전히 전송하지 않는다 — 그 제약이 HPC Service를 OA Service와
  구분하는 유일한 축이다.

### 2.1 OA Service/File Artifacts/HPC Service가 SIREN에 넘기는 버전 — "official"만

이 셋 다(A/B/C) **자기 내부 버전 체계를 그대로 유지**한다. SIREN에 넘길 때는 그중 **official하게
확정된 것만** 넘긴다 — 이 규칙은 세 tier 공통이다.

- 서비스가 minor 단위까지 명확히 태깅하고 있다면(예: `v1.3`), 그 minor까지 그대로 넘겨도 된다 —
  "official" 여부는 버전 자릿수가 아니라 **그 서비스가 공식 값으로 확정했는지**로 판단한다.
- **RPM처럼 minor 개념이 없고 snapshot만 찍는 서비스**는, 확정된 release 버전들에 더해
  **`latest(+)` 항목 하나만** 함께 보낸다 — 지금 구현된 RPM 어댑터가 하는 방식 그대로다.
  `latest(+)`는 아직 official 버전으로 확정되지 않은 작업중 snapshot의 자리표시자이며,
  `isPublished: false` 로 표시해 그 산출물의 giver에게만 보인다(§7).
- 서비스가 사람이 알아볼 수 없는 내부 빌드 번호·해시만 갖고 있고 official 버전이 전혀 없다면,
  그 상태 그대로는 넘기지 않는다 — 최소한 "release 버전 + latest(+)" 두 종류로는 정리해서 넘긴다.
- **버전 라벨은 그 artifact 안에서 영구히 재사용하면 안 된다** — 07장의 version 이벤트가
  `versionLabel`을 사실상의 불변 참조로도 쓰기 때문이다.

---

## 3. 권한과 Recipient — 이제 전 tier가 같은 모델이다

★ **이 장은 v3 설계 중 한 번 뒤집힌 결정이다.** 최초 설계는 "A만 서비스가 권한을 관리하고
B/C/D는 SIREN이 artifact 단위로 보관한다"였다. 실제로 만들다 보니 (1) artifact 하나를 여러
workflow가 공유하는데 그 권한을 한 군데(artifact)에 두면 한 workflow의 수정이 다른 workflow에도
번져 꼬이는 문제, (2) HPC Service는 HPC망 안에서 사실상 누구나 만들고 볼 수 있어서 SIREN이 권한을
따로 보관하는 의미가 없다는 점 때문에, **A/B/C(OA Service/File Artifacts/HPC Service) 전부
A와 같은 모델로 통일**했다. External/Attested(D)만 이번 범위에서 제외한다(§3.6).

| | **OA Service / File Artifacts / HPC Service (A/B/C)** |
|---|---|
| Edit / View 권한 | **그 서비스**가 관리한다. SIREN은 전혀 보관하지 않는다 |
| SIREN에서 권한 편집 | **불가.** 그 서비스에 가서 고쳐야 한다 |
| Recipient 저장 위치 | **SIREN이 block(=그 workflow의 자리) 단위로 저장** |
| Recipient가 여러 workflow에서 같은가 | **아니다.** 같은 artifact도 workflow마다 recipient 구성이 다를 수 있다 |
| Recipient와 slide 열람의 관계 | **게이트로 쓰인다** — recipient가 아니면 slide가 막힌다(§4.1). 실제 데이터 접근은 그 서비스가 최종 판정한다 |

### 3.1 왜 SIREN이 권한에 관여하지 않는가

그 서비스가 자기 권한 체계로 versioning·열람을 통제한다. SIREN이 그 체계에 개입하면 서비스와
강한 의존이 생기고, 여러 workflow가 하나의 artifact를 공유하는 상황에서 "누가 최종 권한을
갖는지"가 SIREN 쪽에서 꼬인다. 그래서 **SIREN은 실제 데이터 접근 권한에는 일절 손대지 않는다**
— 그건 항상 그 서비스가 최종 판정한다. File Artifacts(Calypso)도 예외가 아니다 — Calypso
자체 데이터(`editors`/`viewGrants`)가 유일한 진실이고, SIREN은 그걸 그대로 물어볼 뿐이다.

recipient는 **release 알림 대상**이면서 동시에 **SIREN 쪽 slide 열람의 첫 번째 게이트**로도
쓰인다(§4.1). "recipient = 알림 대상"과 "recipient = 그 서비스의 실제 권한"은 여전히 무관하다 —
recipient에 들어 있어도 그 서비스에서 view 권한이 없으면 결국 slide는 막힌다.

### 3.2 recipient는 block에, edit/view 구조로 — A/B/C 공통

`Block.recipients`(02장 §4)에 저장하며, workflow의 editAccess/viewAccess와 같은 모양이다 —
부서 다중 + 사용자 다중, **edit/view 두 단계**로 나뉜다.

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
  깊이 판정에 그대로 쓰기 위해서다.
- **`recipients`에 사람을 넣는 것 자체가 그 서비스의 권한을 부여하지 않는다.** 그 서비스에서
  실제로 view/edit 권한이 없는 사람을 recipient에 넣으면, 그 사람은 여전히 slide가 막힌다
  (§4.1 게이트 2). recipient 관리자가 이를 인지하고 구성해야 한다.
- `Artifact.editAccess`/`viewAccess`(`AccessGrant`) 필드는 A/B/C에서 더 이상 쓰지 않는다 —
  옛 모델의 잔재이며, 실제 마이그레이션 시 정리 대상이다.

### 3.3 Recipient 설정(편집) 권한

**workflow의 Edit Access 전원.** 예전엔 "향후 A만 그 서비스의 edit 권한자로 좁힌다"는 TODO가
있었는데, 이제 A/B/C 전부 같은 처지이므로 이 TODO도 전 tier 공통으로 남겨둔다.

```ts
// TODO: 서비스 access 응답의 canEdit 를 recipient 편집 권한 판정에 쓰는 걸 검토한다
//       (A/B/C 공통 — 예전엔 A tier만의 TODO였다).
```

### 3.4 다중 선택

**부서는 어디서든 여러 개 넣을 수 있다.** recipient도, workflow의 edit/view도 전부
`departments: string[]` 이다. 개별 사용자도 마찬가지로 다중이다.

### 3.5 External / Attested (D) — 이번 범위 제외

D는 애초에 어떤 시스템에서도 나온 게 아니라서 출처도, versioning도 불가능하다. 이번 범위에서는
받는 workflow가 comment 같은 걸 적을 수 있게만 하고, vwp path·version 같은 필드는 시스템에
**등록된 날짜**로 대체한다(source version 개념 자체가 없다). 권한·recipient 모델은 이 문서에서
구체화하지 않는다 — 별도로 다룬다.

---

## 4. 상세 slide 열람 규칙

판정 로직은 [01-permissions.md §4.2](01-permissions.md)에 있다. 화면 관점에서 다시 정리한다.

### 4.1 OA Service / File Artifacts / HPC Service — 2단 게이트 (A/B/C 공통)

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
  File Artifacts(Calypso)는 SIREN BE가 대신 물어보되(FE는 직접 호출하지 않는다, 07장 §2),
  판정 로직 자체는 같다.

### 4.2 External / Attested (D)

이번 범위에서 세부를 구체화하지 않는다(§3.5). 물어볼 서비스가 없으므로 게이트 2 자체가
존재하지 않는다는 점만 다른 tier와 다르다.

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
| workflow Edit Access (A/B/C 공통) | 편집 가능 — `block.recipients.editAccess`/`viewAccess`에 부서·사용자 추가·삭제 (§3.2) |
| View 권한자 | **읽기 전용으로 노출.** 누가 받는지는 볼 수 있고, 추가/삭제 버튼이 없다 |
| 미매핑 블록 | **탭 자체를 감춘다** |

> 이 탭을 여는 것과 §4.1의 게이트 1을 통과하는 것은 별개다 — workflow Edit Access는 탭을
> **열어 recipient를 편집**할 수 있게 하지만, 그 사람이 slide 자체를 볼 수 있는지는 여전히
> 자신이 recipient에 속하는지 + 서비스 권한으로 판정한다.

- View 권한자에게 열어주는 이유: 그건 workflow 설정이 아니라 산출물 정보이고, 별도의 view 권한
  근거가 있기 때문이다. **서비스 권한이 없어도 읽기 전용 열람은 허용한다** — 실제 데이터 접근은
  그 서비스가 차단하므로 SIREN이 이중으로 막을 이유가 없다.
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
   | **OA Service** | A | O | O |
   | **File Artifacts** | B | O | O |
   | **HPC Service** | C | O | O |
   | **External / Attested** | D | **X** | O |

   - **HPC Service(C)는 더 이상 잠겨 있지 않다** — HPC망과의 양방향 API 연동이 확정되면서
     OA Service(A)와 동일하게 라이브 pickability 판정을 받는다(§6.2, §6.3).
   - **External/Attested(D)는 받는 쪽에서만 나온다.** 줘야 하는 artifact를 D로 등록하는
     흐름은 아직 구체화되지 않은 미래 인터페이스로 남겨둔다(§6.4).
4. 고른 출처에 맞는 후보 목록에서 실제 artifact를 고르거나(OA Service/File Artifacts),
   D면 "누가 줄 것으로 기대되는지"만 입력한다.

### 6.2 Pickability — 대칭 규칙

**주는 쪽 후보는 그 서비스의 edit 게이트를, 받는 쪽 후보는 그 서비스의 view 게이트를 통과한
artifact만 고를 수 있다.** SIREN이 아니라 항상 그 서비스가 최종 판정한다 — A/B/C 공통이다.

| Tier | 주는(own) 후보 조건 | 받는(received) 후보 조건 |
|---|---|---|
| **A**(OA Service) | 그 서비스 `canEdit`(라이브 조회) | 그 서비스 `canView`(라이브 조회) |
| **B**(File Artifacts) | Calypso `myAccess === 'edit'`(SIREN BE가 대신 물어봄, 07장 §2) | Calypso `myAccess`가 edit 또는 view |
| **C**(HPC Service) | 그 서비스 `canEdit`(라이브 조회) — **더 이상 항상 잠겨 있지 않다** | 그 서비스 `canView`(라이브 조회) |
| **D**(External/Attested) | 해당 없음(옵션 자체가 없다) | 자유(검증할 시스템이 없다) |

- 후보 목록에는 고를 수 없는 것도 **보여주되 흐리게 표시하고 이유를 붙인다** — "view only,
  edit 권한 필요" 처럼. 조용히 숨기면 "내가 왜 저건 못 고르지"라는 질문에 답을 못 준다.
- 이 판정은 **서버가 후보 목록 조회 시점에 한 번**, **실제 매핑(생성/변경) 시점에 다시 한 번**
  한다(BE 재검증 원칙, 01장 §5) — FE의 pickable은 UX 게이트일 뿐이다.

### 6.3 후보 목록의 출처

★ **project 사전 링크 단계는 폐지했다.** 예전엔 "code+revision으로 project를 검색 →
사람이 후보 중 하나를 확정 → 그 링크를 저장해 두고 다음부터 재사용"하는 2단계였는데(구
`ProjectServiceLink`), 이제는 **다이얼로그를 열 때마다 code+revision을 그대로 필터로 실어
매번 실시간으로** 후보를 받아온다 — 링크를 저장해 두지 않는다. `ProjectServiceLink` 스키마·
`GET /hub/services/:key/projects/search`·그 확정 UI는 전부 제거 대상이다. code+revision이
그 서비스 안에서 유일하지 않은 문제(RPM처럼 production run·internal test가 같은
code/revision을 쓸 수 있는 경우)는 이제 **그 서비스 쪽이 필터링해서 답을 주는 문제**로
넘어갔다 — SIREN은 응답을 그대로 믿는다(observer 계약의 기존 원칙 그대로).

- **OA Service(A)** — **2단계**다.
  1. **Service** — Manage Service(Hub 레지스트리, `GET /hub/services`)에 등록되고
     `transport: 'http'`인 서비스만 고를 수 있다. Calypso는 여기 없다(§3.1 — SIREN 내장
     기능이자 File Artifacts(B)의 출처이기 때문).
  2. **Artifact** — 고른 서비스에 이 SIREN project의 **code+revision을 실시간으로 실어**
     `GET /artifacts?code=&revision=`(observer-contract-v1.yaml — 파라미터가 project 검색
     때 쓰던 `projectId` 대신 `code`/`revision`으로 바뀐다)를 불러 후보를 받고, 후보마다
     `access` 엔드포인트로 canEdit/canView를 물어본다 — 응답이 느릴 수 있어 서비스별로
     병렬 조회한다. 그 서비스가 이 엔드포인트를 구현하지 않았으면 `supported:false`로
     응답하고, 화면은 "이 서비스는 지금 이 다이얼로그로 못 쓴다"는 안내만 보여준다.
  - 후보 중 하나를 확정하면, 그 응답의 `externalArtifactId`로 SIREN에 Artifact를
    find-or-create 하고, **그 즉시 그 artifact의 `GET /artifacts/:id/versions`를 한 번
    라이브로 불러 전체 버전 이력을 SIREN에 upsert한다**(07장 §3) — 그 전까지 이 artifact가
    한 번도 매핑된 적 없어 SIREN이 버전을 하나도 모르고 있었어도, 매핑 즉시 과거 이력까지
    채워진다.
  - **RPM은 개발 mock으로 위 흐름을 실제로 끝까지 눌러볼 수 있게 해 둔다** —
    `MockObserverController`가 `/artifacts`(code+revision당 fake Readout Pattern 3개, 일부러
    edit·view·차단을 섞어 둔다)를 구현한다. 실제로 매핑을 확정하면 그 순간 진짜 SIREN
    Artifact로 등록되고, 그 뒤로는 등록된 산출물 규칙(§7)을 그대로 따른다.
- **File Artifacts(B)** — 출처는 **Calypso다.** Calypso는 SIREN의 projectId를 그대로 쓰므로
  (§11.4 — workflow 개념을 모른다) code/revision 필터가 필요 없다. **SIREN BE가 Calypso BE를
  대신 호출한다** — FE는 Calypso를 직접 부르지 않는다(07장 §2). Calypso의
  `GET /artifacts?projectId=`가 이미 `myAccess`(edit/view, none은 자체적으로 걸러짐)를 계산해
  주므로 그 값을 그대로 pickability에 쓴다.
  - **열람·recipient 관리도 Calypso 자체 권한(`editors`/`viewGrants`)이 유일한 진실이다** —
    §3에서 정리했듯 SIREN은 B의 권한을 따로 보관하지 않는다. 매핑 확정 직후 같은 방식으로
    Calypso의 전체 버전 이력을 한 번 pull해 온다.
- **HPC Service(C)** — OA Service(A)와 **동일한 흐름**이다. HPC망과의 양방향 API 연동이
  확정되면서 더 이상 mock(`HpcPathMock`)이나 "항상 잠김"이 아니다 — 서비스 목록에서 고르고,
  code+revision으로 후보를 받고, canEdit/canView를 라이브로 물어보고, 매핑 즉시 버전 이력을
  pull한다. 유일한 차이는 응답에 실 설계 데이터·파일이 없고 경로(vwp path)만 있다는 것뿐이다
  (07장).
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

이미 매핑된 block의 artifact를 바꾸면 **`block.recipients`(A/B/C 공통)를 초기화한다.** 이전
recipient 구성이 새 artifact에도 유효하다는 보장이 없기 때문이다 — 조용히 남겨두면 의도치 않은
부서에 알림이 갈 수 있다. Edit Access 보유자가 재매핑 직후 다시 구성해야 한다.

### 6.7 API

```
GET /hub/services                        → Manage Service 등록 목록(기존). OA Service/HPC Service 드롭다운이 그대로 쓴다.

GET /workflows/:workflowId/artifact-candidates
    ?source=live|file|hpc&intent=own|received&serviceKey=&code=&revision=
→ §6.2 규칙으로 pickable까지 판정된 후보 목록. source=live|hpc는 serviceKey 필수 —
  code/revision은 그 workflow가 속한 SIREN project에서 그대로 채운다(사람이 따로 확정하는
  단계 없음, §6.3). OA/HPC Service는 서비스별 observer 호출이 있어 응답이 느릴 수 있다.

POST /workflows/:workflowId/blocks       { name, phaseId, layout, intent, artifactId? | newArtifact? }
PATCH /blocks/:id                        { name?, artifactId? | newArtifact? }
→ newArtifact = { source: 'live'|'file'|'hpc'|'attested', name, serviceKey?, externalArtifactId?, expectedGiver? }
  둘 다 §6.2를 서버가 다시 검증하고(§6.5의 중복 금지 포함), find-or-create 또는 신규 생성 후
  block에 매핑한다. 최종 식별은 (serviceKey, externalArtifactId) 조합이다 — externalArtifactId는
  그 서비스 전체에서(project를 넘나들어) 유일해야 한다(07장 §3). 매핑이 확정되는 순간 SIREN이
  그 artifact의 전체 버전 이력을 한 번 라이브로 pull해 온다(§6.3, 07장 §3).
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
- **버전 목록 자체는 SIREN 캐시에서 읽는다** — OA Service/File Artifacts/HPC Service 전부
  event + 야간 재동기화로 SIREN이 미리 갖고 있다(07장 §3, §4). 상세 slide를 열 때마다 그
  서비스에 버전을 다시 물어보지 않는다. **canView/canEdit·html-view만 열 때마다 라이브로
  묻는다**(§4.1 게이트 2, 07장 §5).
- **giver 여부는 §4.1 게이트 2의 `access.canEdit` 로 판정한다** — recipient에 edit로 들어
  있어도, 그 서비스에서 edit 권한이 없으면 working 버전은 안 보인다. 즉 버전 트리 깊이는
  최종적으로 **그 서비스의 (라이브) 응답**이 결정하고, 버전 목록 자체는 캐시를 쓴다 — 이
  둘은 서로 다른 축이다.

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

★ **07장의 version push 이벤트는 처음부터 `isPublished`를 그대로 쓴다** — pull 계약
(`observer-contract-v1.yaml`, 위 표의 대상)만 외부 계약이라 `isReleased`라는 옛 이름을 그대로
두고 어댑터에서 옮기는 것이고, 이번에 SIREN이 직접 정의하는 push 이벤트 계약(07장)에는
그럴 이유가 없다.
