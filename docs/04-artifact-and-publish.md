# 04. Artifact · Publish · Recipient

> **용어 확인** — 산출물이 자기 서비스 안에서 공식 버전을 확정하는 것이 **publish**다.
> workflow가 부서에게 전달하는 **release**(05장)와 혼동하지 않는다.

## 1. Artifact는 1급 실체다

예전에는 캔버스의 노드(`deliverables`)가 버전과 권한을 직접 들고 있었다. 이제 분리한다.

```
WorkflowNode (캔버스 위의 자리)  ──artifactId──▶  Artifact (실체)
  · workflowId, phaseId                     · tier, 권한, recipient
  · layout                                  · publish 이력(versions)
  · intent                                  · 과제 단위로 공유
```

같은 artifact가 여러 workflow의 캔버스에 놓일 수 있고, 그때도 **권한과 버전 이력은 하나**다.
**(가정 P3 — artifact는 과제 단위로 스코프된다)**

### 1.1 Mapping은 같은 과제 안에서만

node를 artifact에 매핑할 때(=출처를 지정할 때), 후보는 **그 workflow와 같은 project(=같은
`code` + `revision`)의 artifact로 한정**한다. `code`가 같아도 `revision`이 다르면 완전히 다른
project이므로 후보에 나오지 않는다(02장 §1). Admin이 여러 project를 동시에 조회할 수 있어도
이 제약은 그대로다 — 다른 project의 artifact를 끌어와 매핑하려 하면 BE가 400으로 거부한다.

---

## 2. Tier 정의

★ **내부 값(DB에 저장되는 글자 A/B/C)과 사람이 보는 이름은 분리한다.** UI·문서·주석은 전부
아래 "이름" 열을 쓴다 — "Tier A"처럼 글자로 부르지 않는다. `Tier` 타입과 enum 값 자체는
바꾸지 않는다(실데이터 마이그레이션이 아니라 표기 문제이기 때문).

★ **Tier D(External / Attested)는 폐기했다.** 팀·회사 밖에서 생성돼 출처도 versioning도
불가능한 산출물을 담던 tier였는데, 실제 접근 통제·버전 이력을 가질 근거가 없어 recipient도
release 참여도 못 하는 반쪽짜리 tier로 남아 있었다. 대신 **File Artifacts(B, Calypso)를
확장**해 그 역할을 대체했다 — 자세한 건 이 절 하단 참고. 내부 enum 값도 `'A'|'B'|'C'`로
줄었다(`api/src/common/constants/tier.ts`, `web/src/types/domain.ts`).

| 내부 값 | 이름 | 망 | SIREN이 아는 것 | 전형적 대상 |
|---|---|---|---|---|
| **A** | **OA Service** | OA | push event로 버전 메타 수신 + 야간 전체 재동기화(07장). canView/canEdit·html-view는 열람 시점에 그 서비스에 라이브로 묻는다 | 계약을 맞춘 RPM·SimHub 등 Hub 등록 서비스 |
| **B** | **File Artifacts** | **OA 또는 HPC, 또는 없음** — 아래 §2.2 참고 | 위와 동일한 event 기반 — 대상은 **Calypso 하나뿐**이고 SIREN 내장이라 Hub 레지스트리(Service Manage)에는 없다 | **Calypso**(SIREN 내장 산출물 등록 — 실물 파일뿐 아니라 OA-link/HPC-path 참조도 포함) |
| **C** | **HPC Service** | HPC | 위와 동일한 event 기반 — 단 실제 설계 데이터·파일은 전송하지 않는다. 버전 메타(라벨·경로·발행자)만 오간다 | HPC망 경로형 산출물(양방향 API 연동) |

★ **UI에는 A/B/C 글자를 노출하지 않는다** — "새 Artifact 추가" 다이얼로그는 항상 위 표의
"이름" 열로만 보여준다(04장 §6). Calypso가 OA Service가 아니라 File Artifacts인 이유, Calypso가
OA Service 목록에 없는 이유는 §3.1·§6.3 참고 — Calypso는 애초에 Hub 레지스트리 대상이
아니다.

- **tier는 산출물이 아니라 버전 엔트리의 속성이다.** 나중에 실연동이 붙어도 과거 기록을
  고치거나 옮기지 않는다 — 다음 엔트리가 다른 tier로 찍힐 뿐이다. 따라서 tier 승격에
  마이그레이션 로직이 필요 없다. (다른 tier로 옮겨가야 하는 경우도 "승격" 기능을 따로 만들지
  않는다 — 새 tier로 정식 Artifact를 등록하고, 기존 node들이 §6.6의 재매핑으로 하나씩
  갈아타면 된다. workflow마다 전환 시점이 달라도 무방하다.)
- **HPC Service는 더 이상 "항상 잠김"이 아니다.** HPC망과의 양방향 API 연동이 확정되면서
  OA Service/File Artifacts와 같은 라이브 게이트·event 대상이 됐다(§6.2, §6.3, 07장). 다만
  실 설계 데이터·파일 자체는 여전히 전송하지 않는다 — 그 제약이 HPC Service를 OA Service와
  구분하는 유일한 축이다.

### 2.2 File Artifacts(B)의 콘텐츠 종류 — Tier D를 흡수한 확장

Calypso에 등록하는 순간 콘텐츠 종류를 하나 고르고, **그 artifact의 남은 삶 동안 바뀌지
않는다** — 다른 종류가 필요하면 새 artifact를 등록하고 재매핑한다(§6.6).

| 종류 | network | 버전이 담는 것 | 전형적 대상 |
|---|---|---|---|
| **File** | 없음(`null`) — 캔버스에 망 배지를 그리지 않는다 | 파일 여러 개(`files[]`). 실물 그 자체를 Calypso가 파일 하나가 아니라 하나의 버전에 여러 개 묶어 들고 있다 | 우리가 만드는 산출물. 정보 파일일 수도, 실제 설계 산출물일 수도 있다 — 그래서 network를 안 물어본다 |
| **OA-link** | OA | 링크 하나(`viewUrl`) | 웹으로 접근 가능한 외부 산출물의 참조 |
| **HPC-path** | HPC | 경로 하나(`hpcPath`) | HPC망 경로에 실물이 있는 산출물의 참조 — 대표자 한 명이 외부에서 받아 등록하는 case가 전형적이다 |

- **network는 이 콘텐츠 종류에서 파생된다** — 캔버스·상세 slide의 OA/HPC 배지는 그 artifact에
  등록된 값을 그대로 읽을 뿐, tier로 미리 정해두지 않는다(예전엔 "File Artifacts는 항상
  OA"였는데 이제 아니다).
- **OA-link/HPC-path는 Tier D가 하던 역할을 대체한다** — 물어볼 서비스도 실물도 없이 "어디
  있는지"만 기록하던 산출물이 이제는 진짜 Calypso 산출물이 되어, 실제 governance(editors/
  viewGrants), 진짜 버전(major.minor), recipient 구성, release 참여를 전부 그대로 받는다.
  Tier D 때 고민했던 "recipient가 없어야 하나", "release에서 빼야 하나" 같은 질문 자체가
  없어진다 — File Artifacts는 이미 답이 정해진 tier이기 때문이다.
- **give/receive 양쪽 모두 새 File Artifacts를 등록할 수 있다**(§6.1) — 회사 안에서 만든
  산출물을 넘기는 give 쪽, 외부에서 받아 대표자가 등록하는 receive 쪽 둘 다 커버한다.
- 스키마는 `calypso/src/artifacts/schemas/artifact.schema.ts`(`Artifact.network`,
  `ArtifactVersion.files/viewUrl/hpcPath`) 참고.

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

## 3. 권한과 Recipient — 전 tier가 같은 모델이다

★ **이 장은 v3 설계 중 두 번 뒤집힌 결정이다.** 최초 설계는 "A만 서비스가 권한을 관리하고
B/C/D는 SIREN이 artifact 단위로 보관한다"였다. 실제로 만들다 보니 (1) artifact 하나를 여러
workflow가 공유하는데 그 권한을 한 군데(artifact)에 두면 한 workflow의 수정이 다른 workflow에도
번져 꼬이는 문제, (2) HPC Service는 HPC망 안에서 사실상 누구나 만들고 볼 수 있어서 SIREN이 권한을
따로 보관하는 의미가 없다는 점 때문에, **A/B/C(OA Service/File Artifacts/HPC Service) 전부
A와 같은 모델로 통일**했다. 그다음엔 이 모델에서 제외돼 있던 External/Attested(D) 자체를
폐기했다 — File Artifacts(B)가 OA-link/HPC-path 콘텐츠까지 갖도록 넓어지면서(§2.2), 지금은
**예외 없이 A/B/C 전부** 이 장의 모델 하나만 쓴다.

| | **OA Service / File Artifacts / HPC Service (A/B/C)** |
|---|---|
| Edit / View 권한 | **그 서비스**가 관리한다. SIREN은 전혀 보관하지 않는다 |
| SIREN에서 권한 편집 | **불가.** 그 서비스에 가서 고쳐야 한다 |
| Recipient 저장 위치 | **SIREN이 node(=그 workflow의 자리) 단위로 저장** |
| Recipient가 여러 workflow에서 같은가 | **아니다.** 같은 artifact도 workflow마다 recipient 구성이 다를 수 있다 |
| Recipient와 slide 열람의 관계 | **없다**(사용자 결정, §4.1 갱신) — slide를 열 수 있는지는 오직 그 서비스의 권한 하나로만 정해진다. recipient는 release 알림 대상과 Recipients/Comments 탭 표시 대상일 뿐이다 |

### 3.1 왜 SIREN이 권한에 관여하지 않는가

그 서비스가 자기 권한 체계로 versioning·열람을 통제한다. SIREN이 그 체계에 개입하면 서비스와
강한 의존이 생기고, 여러 workflow가 하나의 artifact를 공유하는 상황에서 "누가 최종 권한을
갖는지"가 SIREN 쪽에서 꼬인다. 그래서 **SIREN은 실제 데이터 접근 권한에는 일절 손대지 않는다**
— 그건 항상 그 서비스가 최종 판정한다. File Artifacts(Calypso)도 예외가 아니다 — Calypso
자체 데이터(`editors`/`viewGrants`)가 유일한 진실이고, SIREN은 그걸 그대로 물어볼 뿐이다.

★ **File Artifacts(B)는 view가 기본적으로 열려 있다(사용자 요청).** edit은 여전히
`editors`(등록자·Admin 포함)로만 좁혀지지만, view는 `restrictView`가 꺼져 있으면(기본값)
그 project의 누구나 가능하다 — Calypso 자체 게이트(§2 SIREN BE만 부를 수 있음, 프록시가
project 멤버십을 먼저 확인)를 통과한 요청이면 그대로 view가 나온다. 특정 artifact만 예전처럼
`viewGrants`로 좁히고 싶으면 그 artifact의 `restrictView`를 켠다 — 그러면 등록자/editors/
viewGrants에 없는 사람은 다시 `none`(list에서 빠지고 detail은 403)이 된다. A/C(OA/HPC
Service)는 이 변경과 무관하다 — 그 서비스 자체의 view 게이트를 그대로 쓴다.

recipient는 **release 알림 대상**이면서 **Recipients/Comments 탭에 누구를 보여줄지**를
정한다(§4.1, §5) — 더 이상 slide 열람 자체를 막지는 않는다. "recipient = 알림·탭 표시 대상"과
"recipient = 그 서비스의 실제 권한"은 여전히 무관하다 — recipient에 들어 있어도 그 서비스에서
view 권한이 없으면 slide는 (recipient 여부와 무관하게) 막힌다.

### 3.2 recipient는 node에 — A/B/C 공통, 단일 grant

`WorkflowNode.recipients`(02장 §4)에 저장하며, 부서 다중 + 사용자 다중의 **단일 grant**다.
edit/view로 나뉘지 않는다 — 실제 edit 여부는 그 서비스가 최종 판정한다(§4.1).

```ts
WorkflowNode.recipients = { departments: string[], users: string[] }
```

- 같은 artifact가 workflow X와 workflow Y 양쪽에 놓여 있어도, X의 node와 Y의 node는
  **서로 다른 recipients**를 가질 수 있다 — X는 AA·BB 부서에게, Y는 CC 부서에게만 알림이
  가는 식으로 독립적으로 구성한다.
- **`recipients`에 사람을 넣는 것 자체가 그 서비스의 권한을 부여하지 않는다.** 그 서비스에서
  실제로 view/edit 권한이 없는 사람을 recipient에 넣으면, 그 사람은 여전히 slide가 막힌다
  (§4.1) — recipient는 이제 slide 열람의 필요조건도 아니고 충분조건도 아니다. recipient
  관리자가 이를 인지하고 구성해야 한다.
- `Artifact.editAccess`/`viewAccess`/`expectedGiver`(`AccessGrant`) 필드는 완전히 제거했다 —
  artifact는 더 이상 권한을 전혀 들고 있지 않는다.

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

### 3.5 (폐기) External / Attested — File Artifacts(B)로 흡수됨

이 절이 다루던 tier(D)는 폐기했다. "출처도 versioning도 없는 산출물"이라는 문제는 이제
File Artifacts(B)의 OA-link/HPC-path 콘텐츠(§2.2)가 해결한다 — recipient·게이트·release
전부 A/B/C 공통 모델(§3, §4)을 그대로 쓰므로, 여기 따로 적을 예외가 없다.

---

## 4. 상세 slide 열람 규칙

판정 로직은 [01-permissions.md §4.2](01-permissions.md)에 있다. 화면 관점에서 다시 정리한다.

### 4.1 OA Service / File Artifacts / HPC Service — 서비스 권한 하나로 (A/B/C 공통, 예외 없음)

```
그 서비스에서 view 권한이 있는가? (라이브 조회)
  없다 → 막힌다.
  있다 → 열린다. canEdit 여부로 버전 트리 깊이가 갈린다(§7).
```

- **workflow Edit Access가 있는지, node.recipients에 속하는지는 이 판정에 관여하지 않는다**
  (사용자 결정 — 이전 버전은 여기가 2단 게이트였고, recipient를 먼저 통과해야 서비스 권한을
  물었다). 그 결과 같은 부서가 만든 workflow이고 artifact 자체는 view 제한이 없는데도, 그
  node의 recipient가 다른 부서로 지정돼 있으면 못 여는 상황이 나왔다 — recipient의 존재
  이유(같은 artifact를 workflow마다 다른 대상에게 보여주고 싶을 수 있다, §3.2)는 유효하지만,
  그걸 위해 열람 자체를 막는 대가가 너무 컸다. 지금은 recipient가 release 알림 대상과
  Recipients/Comments 탭 표시 대상으로만 쓰인다(§5).
- 연동 서비스에 `access` 엔드포인트가 필요하다는 점은 그대로다 —
  [prompts/a-tier-recipient-integration.md](prompts/a-tier-recipient-integration.md)로 전달한다.
  File Artifacts(Calypso)는 SIREN BE가 대신 물어보되(FE는 직접 호출하지 않는다, 07장 §2),
  판정 로직 자체는 같다.

### 4.2 (폐기) External / Attested — §4.1로 흡수됨

D가 없어지면서 "물어볼 서비스가 없는 tier"라는 예외 자체가 없어졌다. §4.1이 A/B/C 전부를 커버한다.

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

## 5. Recipients / Comments 탭

artifact 상세 slide 안의 탭 둘이다. **이 둘은 slide 자체(Overview)와 노출 기준이 다르다**
(사용자 결정, 01장 §3.8 갱신).

| 열람자 | Overview(§4) | Recipients / Comments |
|---|---|---|
| workflow Edit Access | 그 서비스 canView/canEdit로 판정 | **보인다.** Recipients는 편집 가능(`node.recipients`에 부서·사용자 추가·삭제, §3.2), Comments는 읽기·쓰기 모두 가능 |
| workflow View 권한자 (Edit 아님) | 그 서비스 canView/canEdit로 판정 — Edit 권한자와 동일 기준 | **탭 자체가 없다.** 그 artifact의 편집 권한이 있거나 recipient로 등록돼 있어도 마찬가지다 |
| 미매핑 노드 | "No source yet" | **탭 자체를 감춘다** |

> **판정 기준이 완전히 분리된다.** Overview는 그 서비스의 canView/canEdit 하나로만 열리고
> (§4.1), Recipients/Comments는 node.recipients 소속이나 artifact 자체의 편집 권한과
> 무관하게 **오직 workflow Edit Access**로만 열린다. 그래서 "artifact는 볼 수 있는데 그
> 두 탭은 안 보이는" 사람과 "workflow는 편집할 수 있지만 그 artifact는 서비스 쪽 권한이
> 없어 Overview가 막힌 채로 Recipients/Comments만 여는" 사람이 둘 다 있을 수 있다 — 의도된
> 동작이다.
> (예전 버전은 Recipients 탭을 View 권한자에게도 읽기 전용으로 열어줬다. 그 근거였던
> "recipient 소속 = slide 열람 게이트" 자체가 §4.1에서 폐지되면서, 그 읽기 전용 노출도
> 함께 걷어냈다.)

- 부서 후보는 `Project.departments`, 개별 사용자는 전사 검색(KnoxID 또는 이름).
- 사용자 표시는 KnoxID 저장 + SDPCommonAPI 이름 조회(한/영).
- Comments는 항상 publish된 버전에만 달 수 있다(working 버전 불가) — 이 규칙은 이번 변경과
  무관하게 그대로다.

---

## 6. "새 Artifact 추가" — 등록·변경 정책 ★T2 반영★

03장 §5.2의 "새 Artifact 추가" 버튼은 이제 **주는(own) / 받는(received) 양쪽 모두** 만든다.
이미 만들어진 node의 artifact를 바꾸는 것("변경")도 같은 규칙, 같은 UI를 그대로 재사용한다 —
WorkflowNode(자리)와 Artifact(실체)가 분리되어 있으므로(§1) 매핑을 바꾸는 것 자체는 자유롭다.

### 6.1 다이얼로그 흐름

1. **주는지 받는지 고른다** — 이후 모든 pickability 판정이 이 값을 따른다. node 생성 후에는
   바꾸지 않는다("변경"은 무엇을 매핑할지만 바꾸지, own/received 방향 자체는 안 바꾼다).
2. Name, Phase — 기존과 동일.
3. **출처를 고른다.** Tier 글자(A/B/C)는 화면 어디에도 노출하지 않는다:

   | 화면 표시 | 내부 Tier | 주는 쪽에 나오는가 | 받는 쪽에 나오는가 |
   |---|---|---|---|
   | **OA Service** | A | O | O |
   | **File Artifacts** | B | O | O |
   | **HPC Service** | C | O | O |

   - **HPC Service(C)는 더 이상 잠겨 있지 않다** — HPC망과의 양방향 API 연동이 확정되면서
     OA Service(A)와 동일하게 라이브 pickability 판정을 받는다(§6.2, §6.3).
   - **give/receive 양쪽 다 이 3개뿐이다** — Tier D 폐기 후 받는 쪽 전용 4번째 옵션이 없어졌다.
     File Artifacts(B)로 등록하면(§2.2) OA-link/HPC-path 콘텐츠도 고를 수 있어, 예전에 D가
     받던 case(출처도 실물도 없는 산출물)도 이 3개 안에서 커버된다.
4. 고른 출처에 맞는 후보 목록에서 실제 artifact를 고른다.

### 6.2 Pickability — 대칭 규칙

**주는 쪽 후보는 그 서비스의 edit 게이트를, 받는 쪽 후보는 그 서비스의 view 게이트를 통과한
artifact만 고를 수 있다.** SIREN이 아니라 항상 그 서비스가 최종 판정한다 — A/B/C 공통이다.

| Tier | 주는(own) 후보 조건 | 받는(received) 후보 조건 |
|---|---|---|
| **A**(OA Service) | 그 서비스 `canEdit`(라이브 조회) | 그 서비스 `canView`(라이브 조회) |
| **B**(File Artifacts) | Calypso `myAccess === 'edit'`(SIREN BE가 대신 물어봄, 07장 §2) | Calypso `myAccess`가 edit 또는 view — `restrictView`가 꺼진(기본) artifact는 project 멤버 전원이 view라 사실상 전부 후보에 뜬다 |
| **C**(HPC Service) | 그 서비스 `canEdit`(라이브 조회) — **더 이상 항상 잠겨 있지 않다** | 그 서비스 `canView`(라이브 조회) |

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
  주므로 그 값을 그대로 pickability에 쓴다. §3.1의 view 기본 개방 때문에, **받는(received)
  후보 목록은 사실상 그 project의 Calypso artifact 전체**가 된다 — 검색(이름/부서) 필터를
  화면에 둔다(사용자 요청 — CalypsoArtifactPicker의 기존 검색창을 그대로 쓴다).
  - **열람·recipient 관리도 Calypso 자체 권한(`editors`/`viewGrants`)이 유일한 진실이다** —
    §3에서 정리했듯 SIREN은 B의 권한을 따로 보관하지 않는다. 매핑 확정 직후 같은 방식으로
    Calypso의 전체 버전 이력을 한 번 pull해 온다.
  - **콘텐츠 종류(File/OA-link/HPC-path, §2.2)는 이 후보 목록에서 상관없다** — 이미 등록된
    artifact를 고르는 문제일 뿐이라, 종류와 무관하게 같은 흐름을 탄다. 종류를 정하는 건
    "새로" 등록할 때뿐이다.
- **HPC Service(C)** — OA Service(A)와 **동일한 흐름**이다. HPC망과의 양방향 API 연동이
  확정되면서 더 이상 mock(`HpcPathMock`)이나 "항상 잠김"이 아니다 — 서비스 목록에서 고르고,
  code+revision으로 후보를 받고, canEdit/canView를 라이브로 물어보고, 매핑 즉시 버전 이력을
  pull한다. 유일한 차이는 응답에 실 설계 데이터·파일이 없고 경로(vwp path)만 있다는 것뿐이다
  (07장).

### 6.4 (폐기) D Tier 등록 — File Artifacts(B) 신규 등록으로 대체

이 절이 다루던 "받는 전용, 출처 검증 없이 새로 만든다"는 흐름은 폐기했다. 지금은 give/receive
양쪽 다 **File Artifacts(B)로 새 Calypso artifact를 등록**할 수 있고(§2.2), 등록 시 콘텐츠
종류(File/OA-link/HPC-path)를 고른다 — 예전 D가 "받는 쪽에서만, 검증 없이" 만들던 것과 달리
이제는 실제 Calypso governance(editors/viewGrants) 안에서 만들어진다.

- 리스트에 원하는 artifact가 없으면 **새로 등록**할 수 있고, 이 경우 항상 Calypso artifact로
  할당된다 — OA Service/HPC Service는 그 서비스 안에 실제로 존재하는 것만 고를 수 있으므로
  (SIREN이 대신 새 artifact를 만들어주지 않는다), "새로" 만드는 경로는 File Artifacts뿐이다.
- give 쪽에서 새로 등록하면 등록자가 Calypso `editors`에 자동으로 들어간다(등록자·Admin은
  항상 edit, `calypso/src/artifacts/artifacts.service.ts`의 `computeAccess()`).
- receive 쪽에서 새로 등록(매핑용 placeholder)해도 **같은 규칙을 그대로 탄다** — 등록자가
  자동으로 편집 가능해진다. 원래는 이 경우 편집 권한을 주지 않기로 했었으나(받는 쪽은 실제로
  그 산출물을 만드는 쪽이 아니므로), 구분 없이 단순하게 두기로 **확정했다**(사용자 결정,
  README §4 T14) — 별도로 막는 로직은 만들지 않는다.
- 두 case 모두 **등록 시점엔 이름(과 give 쪽이면 department)만 받는다** — 콘텐츠 종류(File/
  OA-link/HPC-path)는 아직 안 정한다. 아직 어떤 draft version도 없고 실제 데이터도 없는
  빈 artifact 상태로 캔버스에 매핑된다.
- **콘텐츠 종류는 "새 Artifact 추가" 다이얼로그가 아니라, 그 artifact의 contents 화면에서
  첫 버전을 추가하는 순간 정해진다** — File(파일 업로드, 여러 개 가능) / Link(OA) / Path(HPC)
  중 하나를 고르면 그게 그 artifact의 `network`로 고정된다(§2.2, `lockNetworkOnFirstVersion`).
  이 화면(`web/src/components/artifact/ArtifactVersionContents.tsx`)은 SIREN 슬라이드의
  `CalypsoInlinePanel`과 Calypso 독립 페이지(`ArtifactDetailPage`)가 공유한다 — 둘 중
  어디서 첫 버전을 추가해도 같다.

### 6.5 한 workflow 안에서 같은 artifact 중복 금지

**같은 workflow 안에서 같은 artifact를 두 개의 node에 매핑할 수 없다 — 주는/받는 모두 마찬가지다**
(사용자 결정). release의 source 버전 지정이 node 단위이기 때문에, 같은 artifact가 두 node에
걸리면 어느 node가 진짜 upstream인지 flow edge 판정이 모호해지고, release 표에도 같은 산출물이
중복으로 찍힌다. node 생성·재매핑 양쪽에서 `(workflowId, artifactId)` 조합의 유일성을 서버가
검증한다 — **다른 workflow에서 같은 artifact를 재사용하는 것은 여전히 허용된다**(§1의 project 단위
공유 원칙 그대로).

### 6.6 재매핑("변경")과 recipient

이미 매핑된 node의 artifact를 바꾸면 **`node.recipients`(A/B/C 공통)를 초기화한다.** 이전
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

POST /workflows/:workflowId/nodes       { name, phaseId, layout, intent, artifactId? | newArtifact? }
PATCH /nodes/:id                        { name?, artifactId? | newArtifact? }
→ newArtifact = { source: 'live'|'file'|'hpc', name, serviceKey?, externalArtifactId? }
  둘 다 §6.2를 서버가 다시 검증하고(§6.5의 중복 금지 포함), find-or-create 또는 신규 생성 후
  node에 매핑한다. 최종 식별은 (serviceKey, externalArtifactId) 조합이다 — externalArtifactId는
  그 서비스 전체에서(project를 넘나들어) 유일해야 한다(07장 §3). 매핑이 확정되는 순간 SIREN이
  그 artifact의 전체 버전 이력을 한 번 라이브로 pull해 온다(§6.3, 07장 §3).
```

> **완료(README §4 T13)** — `ArtifactSourcePicker.tsx`가 admin이 등록한 OA/HPC Service와
> Calypso 산출물을 **한 목록**으로 보여준다. Service 항목을 펼치면 그 서비스의 실시간 후보가
> 안에 뜨고(§6.3 2단계 그대로), Calypso 항목은 바로 선택된다. 목록 맨 아래 "새로 등록"은
> 이름만 받아 빈 Calypso artifact를 만든다 — 콘텐츠 종류는 §6.4에서 설명한 대로 contents
> 화면에서 첫 버전을 추가할 때 정한다.

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
  묻는다**(§4.1, 07장 §5).
- **giver 여부는 §4.1의 `access.canEdit` 로 판정한다** — recipient 소속 여부와는 무관하다.
  그 서비스에서 edit 권한이 없으면(recipient이든 아니든) working 버전은 안 보인다. 즉 버전
  트리 깊이는 최종적으로 **그 서비스의 (라이브) 응답**이 결정하고, 버전 목록 자체는 캐시를
  쓴다 — 이 둘은 서로 다른 축이다.

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
