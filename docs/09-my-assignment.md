# 09. My Assignment

과제(Project) 하나를 고르기 전에, **내 일만 과제 경계를 넘어 모아 보는 화면**이다.
app bar의 `My Assignment`(Project List 왼쪽) → `/my`.

탭 두 개로 갈린다.

| 탭 | 내용 |
|---|---|
| **Overview** | ① 받은 release · ② 낸 release · ③ 내 부서가 주는 산출물 |
| **Calendar** | 날짜별 **artifact 버전 발행 event**와 **workflow release event** |

---

## 1. 무엇이 "내 것"인가 — scope 판정

세 갈래이며, **셋 다 SIREN이 직접 들고 있는 값만으로 끝난다.** 산출물마다 그 서비스에
권한을 물어보는 호출(01장 §4.2의 게이트 2)은 이 화면의 어떤 목록에도 들어가지 않는다.

```
내가 member인 과제                                   ← Project 계층이 언제나 먼저다(01장 §2.2)
  ├─ release를 "받았다"   node.recipients가 평탄화된 release.recipientDepartments / recipientUsers
  ├─ release를 "냈다"     release.releasedBy == 나  또는  release.workflowAt.department ∈ 내 부서
  └─ 산출물을 "관리한다"  workflow.department ∈ 내 부서  AND  node.intent == 'own'  AND  artifactId != null
```

### 1.1 산출물 기준이 왜 `workflow.department + intent:'own'`인가

Tier A/C는 실제 편집 권한을 **그 서비스가** 들고 있어 SIREN이 알 수 없다(01장 §4.1).
Tier B(Calypso)만 물어볼 수 있는데, 그 하나 때문에 tier마다 다른 기준을 쓰면 같은 화면
안에서 A/B/C가 서로 다른 뜻으로 섞인다. 게다가 목록 하나를 그리자고 산출물 수만큼 외부
호출을 낼 수는 없다.

그래서 **"내 부서 workflow가 주는 산출물로 만든 node에 매핑된 artifact"** 하나를 A/B/C
공통 기준으로 삼는다(사용자 확정). 산출물의 실제 편집자가 누구인지가 아니라, **그 산출물을
내보내기로 되어 있는 자리가 내 부서 workflow 안에 있는가**를 본다.

### 1.2 부서는 과제마다 다르다

`myDepartments(user, project)` 는 그 과제의 로스터 기준이다(01장 §2.4). 그래서 부서 조건을
전역으로 한 번 거는 게 아니라 **과제별로 하나씩 `$or`에 넣는다.** 같은 사람이 과제 A에서는
Analog, 과제 B에서는 PTE일 수 있다.

### 1.3 "지금 속해 있으면 속한 것"

release가 나갈 당시 내가 그 부서가 아니었어도, **지금 그 부서면 내 것으로 본다**(사용자 확정).
부서 단위 권한을 조회 시점에 실시간으로 판정하는 원칙(01장 §3.2)과 같은 방향이다.

반대로 release **쪽**의 부서는 그 시점에 얼려둔 `workflowAt.department`를 쓴다 — workflow가
나중에 부서를 옮겨도 "그때 어느 부서가 냈는가"는 흔들리지 않아야 한다(05장 §5).

### 1.4 Admin

**모든 엔드포인트에서 필터가 통째로 없다.** 전 과제·전 workflow·전 node가 scope다
(01장 §1, 사용자 요청). 달력의 1개월 범위와 산출물 목록의 1년 창만 Admin에게도 그대로 적용된다 —
그건 권한이 아니라 화면이 요구하는 범위이기 때문이다.

---

## 2. 받은 release · 낸 release (Overview ①②)

- 최신순, **페이지네이션**(기본 10건). release는 철회·삭제가 없어 쌓이기만 하므로
  (05장 §4.5) 전량 조회는 시간이 갈수록 반드시 느려진다.
- 조회는 `releases`의 파생 필드 + 인덱스로 끝난다 — `recipientDepartments`/`recipientUsers`는
  이미 release 생성 시 items의 수신 대상을 평탄화해 둔 값이다(02장 §6).
- **목록 행에는 버전 라벨·링크·경로가 없다.** 그 값들은 산출물별 열람 권한을 그 서비스에
  라이브로 물어봐야 정해지기 때문이다. 목록에는 `v{seq}` · workflow 이름 · 부서 · 실행자 ·
  날짜 · 산출물 수 · 변경 수 · **내가 어느 부서로 받았는지**까지만 싣는다.
- 같은 release가 **받은 것이면서 낸 것**일 수 있다(내 부서가 내 부서에 전달). 양쪽 목록에
  모두 나오고, 다이얼로그에 `RECEIVED` · `PUBLISHED` 배지가 함께 뜬다.

---

## 3. 내 부서가 주는 산출물 (Overview ③)

- 모든 과제·모든 workflow를 가로질러, §1의 산출물 기준을 통과한 **node**를 나열한다.
- **행의 정체성은 artifact가 아니라 node이다.** 같은 산출물이 여러 workflow에 놓이면 그만큼
  행이 나온다 — 그 자리마다 phase도 recipient 구성도 다르다(01장 §4.4).
- **최근 1년 안에 움직인 것만** 가져온다(사용자 요청). "움직였다"는
  `artifact.updatedAt`과 **마지막 버전 사건** 중 더 최근 쪽이다 — 버전은 문서 안의 배열에서
  갱신되므로 `updatedAt`만 보면 이번 주에 새 버전을 받은 산출물이 빠질 수 있다.
- 정렬은 그 값의 내림차순.
- **행 클릭 이벤트가 없다.** 무엇을 열지 아직 정하지 않았다(사용자 요청 — 나중에 구체화).

---

## 4. Release 상세 다이얼로그

받은/낸 목록의 행, 그리고 달력의 release event를 누르면 열린다.
`GET /releases/:id` 한 건에 대해서만 산출물별 마스킹 판정이 돈다.

담는 것:

| 영역 | 내용 |
|---|---|
| 머리 | `v{seq}` · 그 시점 workflow 이름·부서 · 과제 · 실행자 · 일시 · RECEIVED/PUBLISHED 배지 |
| Release note | release 전체에 하나뿐인 그 note 원문(05장 §4.3) |
| 산출물마다 | 이름 · tier · 망 · phase · **published 버전**(라벨·일시·링크/경로) · **source 산출물과 그때 선택된 버전** · **그 시점 recipients** |

- 변경된 행(`changed`)은 단일 highlight 색으로 칠한다(05장 §3).
- **`Not published`와 `권한 없음`은 절대 같은 화면을 쓰지 않는다**(04장 §4.3). 전자는 "아직
  확정된 버전이 없다", 후자(`No access — hidden`)는 "있는지 없는지도 알려줄 수 없다"이다.
- 마스킹은 **열람 시점 기준**이다 — 과거 release를 다시 열어도 그때가 아니라 지금의 권한으로
  다시 판정한다(05장 §5).

### 4.1 이 release를 볼 자격

Project 계층을 통과한 뒤, 다음 중 하나면 열린다. 아니면 403이다.

- 그 release의 recipient(개인 또는 내 부서)
- 실행자 본인
- 그 workflow의 소속 부서
- 그 workflow에 대한 view 이상 권한

### 4.2 부서 필터 (받은 release만)

한 사람이 한 과제에서 **여러 부서에 동시에 속할 수 있다.** 그래서 "받은 release"를 열면
다른 부서에게 보낸 산출물까지 섞여 보이는 문제가 생긴다(사용자 확정 — "다른 부서에게 보낸
artifact는 목록에서 보이면 안 된다").

- `GET /releases/:id`가 `viewerDepartments`(= `myDepartments(actor, project)`, Admin은 그
  과제의 전 부서)를 함께 내려준다. FE는 이 목록으로 드롭다운을 그리고, 산출물 목록을
  `item.recipients.departments`가 그 부서를 포함하는 것만으로 좁힌다.
- **낸(Outbox) release나 개별 recipientUsers로만 받은 경우**(내 부서 소속 없이 받은 경우)는
  `viewerDepartments`가 비거나 필터를 아예 켜지 않는다 — 이 화면 범위 밖이다(§7 A4 참고).
- 다이얼로그를 처음 열 때는 무조건 부서 목록의 **첫 번째**를 고른다(사용자 확정). 부서가
  1개면 드롭다운에 다른 옵션이 없을 뿐 그대로 보여준다.

### 4.3 부서별 release 댓글 스레드

release **한 건 전체**에 대해(산출물 하나하나가 아니라), 그걸 받은 **한 부서**가 댓글
스레드를 남길 수 있다(사용자 확정 — "comment랑 status는 각 artifact별이 아니라
release별". 추후 workflow에서 부서별로 release status를 보기 위함이다). 최상위 댓글마다
상태를 하나 달 수 있고(답글에는 없다), 상태는 세 가지뿐이다.

| 상태 | dot | 뜻 |
|---|---|---|
| `accepted` | 초록 | 이 release를 전부 수용 |
| `partial` | 노랑 | 일부만 수용 |
| `blocked` | 빨강 | 현재는 수용 불가능 |

- 새 컬렉션 `ReleaseFeedback`을 둔다 — §6의 "새 컬렉션을 두지 않는다" 원칙은 **기존
  데이터를 부서 관점으로 다시 베끼는 것**을 금지한 것이고, 이건 그런 사본이 아니라 그 자체로
  원본인 새 사실(누가 언제 어떤 상태/코멘트를 남겼는가)이라 해당하지 않는다.
- **진짜 댓글처럼** 계속 이어서 쓸 수 있고, 답글도 달 수 있다(`parentId`) — 답글은 새
  상태를 선언하지 않는다(사용자 확정: "comment의 답글은 status가 없어도 돼"). 전부
  **append-only**다 — Release 자체의 철회 불가 원칙(05장 §4.5)과 같은 이유로 update/delete
  라우트를 두지 않는다. "지금 상태"는 최상위 댓글 중 가장 최근 것이다.
- **status는 반드시 고르지 않아도 된다** — 최상위 댓글을 쓰면서 상태를 생략하면 서버가
  `accepted`(초록)로 채운다(사용자 확정). FE 작성 폼도 처음부터 초록을 골라둔 채로
  시작해서, 그대로 두고 코멘트만 써도 자연히 "전부 수용"이 된다.
- `GET/POST /releases/:releaseId/feedback` (department는 쿼리/바디로 필수).
  판정 순서: ① 그 release를 볼 자격(§4.1) → ② 그 department가 실제로 그 release의
  recipient인가(아니면 400) → ③ actor가 지금 이 과제에서 그 department 소속이거나, **그
  release의 workflow에 Edit Access가 있거나**(★신규, 05장 §7.1.1), Admin(아니면 403).
- **My Assignment의 이 화면(받는 쪽)에서는 여전히 다른 부서의 스레드가 보이지 않는다** — 위
  ③의 새 경로(workflow Edit Access)는 **workflow 쪽 화면**(05장 §7.1.1의 대시보드)에서만
  실제로 쓰인다. My Assignment는 그 release를 "받은" 사용자의 화면이므로 `viewerDepartments`가
  여전히 자기 소속 부서로만 좁혀져 있고, 이 다이얼로그가 다른 부서 파라미터로 조회를 시도하는
  경로 자체가 없다 — 판정 규칙이 넓어졌을 뿐 이 화면의 동작은 바뀌지 않는다.
- **"전체 부서" 조회**는 별도 신규 라우트 `GET /releases/:releaseId/feedback/all`이다(05장
  §7.1.1) — department 부서별로 묶어 한 번에 돌려주며, workflow Edit Access 또는 Admin만
  호출할 수 있다.

---

## 5. Calendar

달 격자 한 장에 두 종류의 event를 **색으로 갈라** 찍는다.

| event | 색 | 무엇이 나오나 |
|---|---|---|
| **artifact 버전 발행** | primary | §1의 산출물 기준을 통과한 artifact의 버전. **Tier A/B/C 전부** |
| **workflow release** | recv | 내 부서가 냈거나, 내가/내 부서가 받은 release |

- **미발행(working) 버전도 찍는다**(사용자 확정) — SIREN이 event로 받아 기록은 했지만 그
  서비스가 아직 공식 확정하지 않은 엔트리다(`isPublished:false`). 색을 하나 더 늘리는 대신
  **테두리를 점선으로 하고 채움을 비워** 구분한다.
- event의 날짜는 `publishedAt ?? observedAt ?? assertedAt ?? createdAt` 이다. 미발행 엔트리는
  `publishedAt`이 null이라 SIREN이 그 사실을 관측한 시각으로 떨어진다.
- 칸을 누르면 그날 전체가 다이얼로그로 펴진다. release 항목만 클릭 대상이다 — 버전 event는
  아직 열 곳을 정하지 않았다(§3과 같은 이유).

### 5.1 한 달치만 읽는다

이 화면의 성능 요구는 여기에 걸려 있다. 달을 옮길 때마다 **그 격자 범위의 event만** 읽는다.

- 범위는 FE가 **실제로 그리는 격자의 첫 칸 ~ 마지막 칸 다음 순간**을 ISO로 그대로 보낸다
  (`GET /my/calendar?from=&to=`). 연/월만 넘기면 서버 시간대로 환산되면서 월초·월말 하루가
  어긋난다.
- 서버는 100일을 넘는 범위를 400으로 거부한다.
- 이미 본 달은 FE 캐시에 남아 다시 부르지 않는다.

### 5.2 버전 event의 범위 필터가 과매치되는 이유

버전은 `artifacts` 문서 **안의 배열**이다. 배열 필드에 `{$gte, $lt}`를 걸면 MongoDB는
"같은 원소 하나가 양쪽을 다 만족"이 아니라 "각 조건을 만족하는 원소가 배열 안에 하나씩
있으면" 문서를 매치시킨다. 그래서 이 조회는 **문서 단위로 과매치**된다.

그래도 읽어오는 문서 수는 `_id: {$in: 내 scope}` 로 이미 좁혀져 있고, **엔트리 단위 필터는
메모리에서 끝난다.** 과매치는 안전한 방향의 오차다 — 빠뜨리지 않고 더 가져올 뿐이다.

---

## 6. 새 컬렉션을 만들지 않았다

이 화면을 위해 **user별 event feed 같은 새 컬렉션을 두지 않기로 했다**(사용자 확정 —
"같은 data를 조금 변형해서 여러 collection으로 관리하는 건 지양").

그 대신 기존 컬렉션에 인덱스만 더했다.

| 컬렉션 | 추가한 인덱스 | 쓰는 곳 |
|---|---|---|
| `releases` | `{recipientUsers, releasedAt}` · `{releasedBy, releasedAt}` · `{'workflowAt.department', releasedAt}` · `{releasedAt}` | §2, §5 |
| `artifacts` | `{'versions.publishedAt'}` · `{'versions.observedAt'}` · `{updatedAt}` | §3, §5 |
| `nodes` | `{workflowId, intent, artifactId}` | §1의 scope 계산 |

**denormalize한 event 사본을 두지 않은 진짜 이유는 성능이 아니라 정합성이다.** audience는
살아 움직인다 — 부서 이동, workflow 권한 변경, recipient 수정, 그리고 **같은 artifact가
나중에 다른 workflow에 추가로 매핑되는 일**까지. 사본에 audience를 얼려두면 §1.3의
"지금 속해 있으면 속한 것"이 깨지고, 그걸 안 깨뜨리려면 결국 매 변경마다 과거 사본 전체를
다시 계산해야 한다.

---

## 7. 열려 있는 것

| # | 내용 |
|---|---|
| A1 | 산출물 행·달력의 버전 event **클릭 동작**이 없다. 무엇을 열지 정해지지 않았다(사용자: "나중에 구체화") |
| A2 | workflow의 **owner지만 그 부서 소속은 아닌** 사람은 §1의 산출물 기준에서 빠진다. 기준을 부서로 좁힌 결정(사용자 확정)의 직접적 결과이며, 필요해지면 `wf.ownerKnoxId == 나`를 OR로 더하면 된다 |
| A3 | 05장 §6.4(T3)의 알림 인프라와 아직 연결돼 있지 않다 — 이 화면은 알림을 **받는 곳**이 아니라 release 기록을 **다시 읽는 곳**이다 |
| ~~A4~~ | **해소됨.** §4.3의 부서별 상태/코멘트는 예전엔 받는 부서가 남기는 쪽만 있었다 — 이제
workflow(낸 쪽)이 여러 부서의 상태를 한눈에 모아보는 대시보드가 workflow의 list view(release
상세) 안에 생겼다. 05장 §7.1.1, §4.3(위) 갱신분 참고 |
