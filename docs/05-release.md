# 05. Release

> **Release란** — 이 workflow가 만든 산출물들을 **각 수신 부서에게 전달하는 행위**다.
> 산출물 하나가 자기 서비스에서 공식 버전을 확정하는 **publish**와는 다른 층위다.

## 1. 무엇이 바뀌었나

예전 HLD Release는 "workflow 전체를 통째로 얼린 스냅샷"이었다. 이제는 다르다.

| | 구 HLD Release | 신 Release |
|---|---|---|
| 성격 | workflow 전체 스냅샷 | **부서별 산출물 배송** |
| 캔버스 저장 | 좌표·flow·phase까지 통째로 | **저장하지 않는다** |
| 결과물 | 캔버스 재현 + 버전 표 | **표(table) 형태의 산출물 목록만** |
| 수신 개념 | 없음 | **산출물마다 받는 부서가 정해져 있다** |
| 알림 | 없음 | 부서/사용자에게 발송 |

**HLD라는 이름은 코드·주석·파일명에서 완전히 제거한다**(06장 §3).

---

## 2. Release 대상

### 2.1 포함

- 캔버스의 노드 중 **artifact가 매핑된 것 전부**(tier A~C 무관).
- **자동으로 전부 포함된다.** 사용자가 개별로 빼거나 넣을 수 없다.

### 2.2 제외

| 대상 | 이유 |
|---|---|
| artifact 미매핑 노드 | 전달할 실체가 없다 |
| 메모 노드 | 산출물이 아니다 |

### 2.3 publish되지 않은 산출물

**제외하지 않는다.** 그대로 포함하고 `Not published` 로 표기한다.
받는 쪽은 "이 산출물은 아직 전달되지 않았다"는 사실을 알게 된다.

---

## 3. 변경 감지와 highlight

- 직전 release(`seq - 1`)의 같은 artifact 항목과 비교한다.
- 비교 기준은 **major 버전뿐이다.** minor 변화는 비교하지 않는다.
  (`majorKey()` 정의는 [02-data-model.md §3](02-data-model.md) 참조)
- 달라진 항목만 표에서 **단일 highlight 색**으로 표시한다. 신규/변경을 색으로 구분하지 않는다.
  - 이 release에서 처음 등장한 산출물은 `firstTime: true` 로 별도 배지만 붙인다.
- **변경이 없어도 알림은 똑같이 간다.** highlight는 "무엇이 새로워졌는지"를 알려주는 표시일 뿐,
  전달 여부와 무관하다.

---

## 4. Release 절차

### 4.1 화면 흐름

```
[Release] 버튼
   ↓
GET /workflows/:id/release/preview
   ↓
┌─ Release 다이얼로그 ───────────────────────────────────┐
│  v4 · 2026-09-10                                       │
│                                                        │
│  ┌ 산출물 표 ───────────────────────────────────────┐ │
│  │ 산출물명 │ Tier │ 버전 │ 수신 부서 │ Source 버전 │ │
│  │ (변경)   │      │      │           │  ▼ 선택     │ │  ← changed:true 인 행만 picker
│  │ (그대로) │      │      │           │  (자동 유지) │ │  ← 나머지는 직전 release의 값을 그대로
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  Release note (필수)                                   │
│  ┌──────────────────────────────────────────────────┐ │
│  └──────────────────────────────────────────────────┘ │
│                          [ 취소 ]  [ Release ]        │
└────────────────────────────────────────────────────────┘
   ↓ confirm
POST /workflows/:id/releases
```

release의 표기는 **단일 정수 시퀀스**다 — `v1`, `v2`, `v3` … (major.minor 같은 두 자리가 아니다).
`Workflow.releaseSeq` 를 그대로 `v{n}` 으로 보여준다.

### 4.2 Source 버전 선택 — 바뀐 산출물만 고른다

Source 버전을 다시 고르는 것은 **이번 release에서 `changed: true` 인 산출물에 한해서만**이다.
바뀌지 않은 산출물은 **직전 release에서 이미 골라둔 source 선택을 그대로 이어받는다** — 사용자가
매번 똑같은 선택을 반복하지 않게 한다.

| 그 산출물이 | Source 선택 UI | 저장되는 값 |
|---|---|---|
| **`changed: true`** (major가 바뀌었거나 `firstTime`) | picker를 보여준다 | 사용자가 고른 값 |
| **`changed: false`** (바뀌지 않음) | picker를 보여주지 않는다 | **직전 release의 `sources` 값을 그대로 복사** |

- picker가 뜬 산출물마다, **flow로 연결된 직전 1홉(upstream)** 산출물의 버전을 고른다.
- **범위는 직전 1홉만이다.** A → B → C 에서 C를 release할 때 C의 source는 B뿐이다.
  A는 B를 release할 때 이미 기록되므로, release history를 타고 가면 전체 계보가 복원된다.
- 후보 목록: 그 source 산출물의 **published 버전 전체**(최신순).
- **기본값: 그 source의 최신 published 버전.**
- **published가 하나도 없으면** → 선택할 것이 없으므로 `없음(None)` 으로 남긴다.
  - **release는 그대로 진행된다.** 막지 않는다.
  - 표에서는 `없음 / None` 으로 표기하고, 받는 쪽 화면에는 **"아직 전달되지 않음"** 으로 보인다.
- upstream이 아예 없는 산출물은 source 칸이 빈 상태로 정상이다.
- **첫 release(그 workflow의 첫 번째 release, 또는 그 산출물이 처음 등장한 회차)에는 이어받을
  직전 값이 없으므로, `firstTime: true` 항목은 항상 `changed: true` 취급으로 picker를 보여준다.**

### 4.3 Release note

- **release 전체에 1개.** 필수 입력이다.
- 산출물별 note는 받지 않는다. 각 산출물의 publish note는 그 산출물이 관리하며,
  **release가 복제해 저장하지 않는다.**

### 4.4 실행

- 권한: **Edit Access 전원**(+ Owner, Admin).
- 실행 전 confirm:
  > "이 내용으로 release하시겠습니까? release는 취소하거나 되돌릴 수 없습니다."
  > "Release with these contents? A release cannot be revoked or undone."
- `releaseSeq` 를 원자적으로 증가시켜 순번을 받는다. FE는 요청 중 버튼을 잠근다.

### 4.5 철회 · 삭제

**불가능하다.** Revoke 기능을 만들지 않는다. update/delete API도 두지 않는다.
이건 약속된 시나리오이며, 요청이 와도 재논의 대상이다(README §4 T7).

### 4.6 (폐기) Tier B 자동 view 권한 부여

한때 release 실행 시 그 node의 recipient 부서에 File Artifact(Calypso) view 권한을 자동
upsert하는 규칙이 있었다. **Calypso의 view가 기본적으로 project member 전원에게 열려
있도록 바뀌면서(`restrictView` 플래그, 04장 §3.1) 더 이상 필요 없어져 폐기했다** — 이제
recipient 부서는 사실상 항상 이미 view 권한을 갖고 있다. 특정 artifact를 여전히 좁혀야
하면 `restrictView`를 켜고 `ArtifactAccessPanel`에서 직접 viewGrants를 관리한다.

---

## 5. 저장 내용

release 이후에도 workflow는 계속 바뀌고, 부서도 바뀐다. 그래서 **그 시점의 사실을 최대한 많이**
얼려 둔다. 스키마는 [02-data-model.md §6](02-data-model.md)에 있고, 여기서는 의도를 적는다.

| 저장 항목 | 왜 필요한가 |
|---|---|
| 산출물 이름 · tier · 망 | 나중에 이름이 바뀌거나 tier가 승격돼도 그때 기록이 남는다 |
| 버전 라벨 · `versionRef` · publish 일시 | 불변 참조. 이후 버전이 더 올라가도 이 항목은 그때를 가리킨다 |
| 경로(`hpcPath`) · 링크(`viewUrl`) | 실물을 다시 찾아갈 수 있어야 한다 |
| **수신 부서 · 수신 사용자** | 권한이 바뀌어도 "그때 누가 받았는지"가 남는다 |
| source 산출물의 버전 · 경로 · 링크 | 계보 추적의 핵심 |
| `changed` · `firstTime` | 나중에 다시 열어도 highlight를 재현할 수 있다 |
| phase id · 이름 | 표를 phase 순으로 묶어 보여줄 수 있다 |
| 날짜 · release note · 실행자 | 기본 이력 |
| workflow 이름 · 부서 (그 시점) | workflow가 개명·부서 이동해도 기록이 흔들리지 않는다 — 부서는 id로 저장하고 지금의 부서명을 실시간으로 찾아 보여주되, 그 부서 자체가 나중에 지워진 경우만을 위해 그 순간의 이름도 `departmentLabel`로 같이 얼려 둔다(02장 §9.4) |

**저장하지 않는 것**: 캔버스 좌표, flow edge, phase 날짜, 메모. 재현 요구가 없다.

> **마스킹은 열람 시점 기준이다.** release 문서에 권한을 얼려두지 않는다. 과거 release를 열 때도
> "지금 이 사람의 권한"으로 무엇을 보여줄지 매번 다시 판정한다.

---

## 6. 알림

### 6.1 원칙

**각 부서는 자기가 받을 산출물만 전달받는다.**

예) 산출물 A의 recipient가 AA·BB 부서라면, release가 나갈 때 A에 대한 알림은 AA·BB에게만 간다.
CC·DD 부서는 A가 있었다는 사실조차 알림에서 보지 못한다.

- 알림 본문에는 그 수신자가 받을 산출물 목록만 담는다.
- **변경이 없던 산출물도 함께 담는다.** (README §3.6)
- source가 `없음` 인 산출물도 담되, **"일부 선행 산출물 미전달"** 을 함께 표기한다.

### 6.2 수신자 계산

**A/B/C 전부 공통** — **그 node**의 `recipients`(부서 + 사용자, workflow별로 다를 수
있다) — 04장 §3 참고. artifact 단위로 따로 두던 옛 모델(D 전용)은 폐기했다.

- 부서 → 실제 사람은 **그 과제 members 중 해당 부서 전원**으로 전개한다.
- 같은 사람이 여러 경로로 걸리면 **한 통으로 합친다**(중복 발송 금지).

### 6.3 workflow 소속 부서에 대한 별도 notice

그 workflow의 `department` 에는 **일반 수신 알림과 별개로** "우리 workflow가 release를 냈다"는
notice를 보낸다.

> **이 부분은 TODO T4다.** 위 6.2와의 중복 처리, notice의 형태(메일인지 in-app만인지),
> 문구를 이 개발이 끝난 뒤 구체화한다. 지금은 인터페이스만 열어둔다.

### 6.4 전송 인프라

**TODO T3.** 실제 메일 발송과 SIREN 내 "My workspace"·알림 페이지는 이번 범위 밖이다.

이번에는 아래까지만 만든다.

```ts
// api/src/notifications/notification-sender.ts
export interface NotificationSender {
  send(payload: ReleaseNotification): Promise<void>;
}

// 기본 구현은 로그 출력 stub. 실제 어댑터(메일/사내 API)는 환경변수로 주입한다.
// TODO(T3): 메일 어댑터 + SIREN 알림 페이지 연동
```

- release 실행은 알림 전송 실패로 **롤백되지 않는다.** release는 확정하고, 전송 실패는 로그와
  재시도 큐에 남긴다. 전달 사실 자체는 `releases` 문서가 이미 증명한다.

---

## 7. Release history

3개의 뷰를 만든다.

### 7.1 workflow별 목록 · 상세

- **목록**: 그 workflow의 release를 최신순으로. 각 행에 `v{seq}`, 날짜, 실행자, 산출물 수,
  변경된 산출물 수, note 첫 줄. 맨 위에 **Current**(지금 캔버스 상태의 실시간 미리보기)가
  Edit Access자에게만 고정으로 붙는다.
- **상세**: 그 시점의 **표**. 캔버스는 재현하지 않는다.
- **"새 Node 추가" 버튼은 Current를 보고 있을 때만 노출된다** — 과거 release는 그 시점의
  스냅샷이라 여기서 새 node를 만드는 게 의미가 없다(사용자 확정). 과거 release를 보는 동안은
  이 버튼 자체가 렌더되지 않는다.

| 컬럼 | 내용 |
|---|---|
| Artifact | 산출물명 + tier 배지 + 망 배지 |
| Phase | 그 시점 phase 이름 |
| Version | published 버전 라벨. 없으면 `Not published` |
| Files / Path | 링크 또는 경로. 권한 없으면 마스킹 |
| Recipients | 수신 부서(+ 개별 사용자 수) |
| Source | source 산출물명 + 선택된 버전. 없으면 `None` |

- 변경된 행은 단일 highlight 색으로 표시한다.
- 행 클릭 시 그 artifact의 상세 slide가 열린다(권한 판정은 04장 §4).

#### 7.1.1 부서별 status/comment 대시보드 ★신규★

과거 release를 상세에서 열면(=Current가 아니라 특정 `v{seq}`를 골랐을 때), 위 산출물 표
**위쪽**에 그 release에 대해 부서들이 남긴 status/comment(09장 §4.2~4.3의 `releaseFeedback`)를
요약하는 패널을 얹는다. Current를 볼 때는 그리지 않는다 — release가 실제로 나간 뒤에야
받는 쪽이 status/comment를 남기기 시작하기 때문이다.

이 패널은 **workflow Edit Access(=이 release를 낸 쪽)에게만 보인다** — 같은 화면의 Comments
컬럼(01장 §3.8)과 같은 기준이다. View 권한자에게는 렌더되지 않는다.

| 상황(그 화면의 수신 부서 필터, 캔버스와 공유하는 `recipientFilter`) | 보여주는 것 |
|---|---|
| **필터 없음(전체 부서)** | 그 release의 recipient 부서 **전체**를 한 번에 — 부서마다 카드 하나, 최신 top-level status(없으면 `accepted` 기본값) + comment 개수만 요약 |
| **부서 1개 이상 필터** | 필터된 부서(들)**만** — 09장 §4.3의 status dot + 댓글 스레드 전체(답글 포함), 그 자리에서 **답글도 달 수 있다**(release를 낸 쪽에서 다는 답글) |

- 필터 없는 요약 카드는 새 엔드포인트 `GET /releases/:id/feedback/all`을 쓴다 — 부서별로
  묶어서 한 번에 돌려준다. 권한은 위와 동일(workflow Edit Access 또는 Admin).
- 부서로 좁혔을 때는 기존 09장 §4.3의 `GET /releases/:id/feedback?department=`를 그대로 쓴다.
  다만 그 라우트의 접근 판정이 확장된다(09장 §4.3 갱신) — **그 부서 소속이 아니어도, 이
  release의 workflow에 Edit Access가 있으면** 읽을 수 있다(기존엔 그 부서 소속이거나 Admin만
  가능했다). 부서 소속 사용자가 자기 부서 것만 보는 기존 경로(My Assignment의
  `ReleaseDetailDialog`)는 그대로 유지된다 — 이번 확장은 workflow 쪽에서 남의 부서 스레드를
  "읽을 수 있는" 새 경로를 **추가**하는 것이지, 기존 부서 전용 격리를 없애는 게 아니다.
- 이 패널이 09장 §4의 assumption A4("workflow가 여러 부서의 상태를 한눈에 모아보는 화면은
  아직 없다")를 완성한다 — A4는 이제 해소됨으로 표시한다(09장 §4).

### 7.2 부서별 필터 뷰

- "우리 부서가 받은 것"을 보는 화면이다.
- 부서를 고르면 그 부서가 recipient로 잡힌 **release item만** 가로질러 보여준다.
  (workflow 경계를 넘어 과제 전체에서 모은다)
- `recipientDepartments` 인덱스로 조회한다.
- 정렬은 날짜 최신순. 산출물명·workflow로 2차 필터를 건다.

### 7.3 artifact별 타임라인 — 버전 트리에 마커로 표기

별도의 타임라인 목록 화면을 새로 만들지 않는다. **산출물 상세 slide의 버전 트리(§7 버전 가시성)
위에, 그 버전이 release로 나갔던 시점을 마커로 얹는다.**

- 버전 트리의 각 항목(버전 하나) 옆에, 그 버전이 **처음으로 포함되어 나간 release**를
  `v{seq}` 배지로 붙인다. 같은 버전이 바뀌지 않아 여러 release에 계속 실렸다면(§4.2 "그대로"
  케이스), 그 버전 하나에 **`v3, v5, v6` 처럼 여러 release 배지가 나열**된다.
- 배지를 클릭하면 그 release의 상세(§7.1)로 이동해, 그때 어느 부서에 갔는지·그때의 source가
  무엇이었는지를 확인할 수 있다.
- 열람 권한(04장 §7)이 없는 버전에는 배지를 그리지 않는다 — working 버전이 release에 실릴 일은
  없으므로(publish된 것만 대상) 이 경우는 발생하지 않지만, 방어적으로 마스킹 규칙을 그대로 따른다.
- **이게 산출물 tracking의 본체다** — 한 산출물이 언제 어떤 버전으로 누구에게 갔는지가 그
  산출물 화면 하나에서 바로 보인다. 조회는 `items.artifactId` 인덱스로 한다.

---

## 8. Preview API가 계산하는 것

`GET /workflows/:id/release/preview` 는 실제 release와 **같은 로직**으로 항목을 계산해 돌려준다.
그래야 미리보기와 결과가 어긋나지 않는다.

1. 그 workflow의 노드 중 `artifactId !== null` 인 것을 모은다.
2. 각 artifact의 **최신 published 버전**을 확인한다.
   - **OA Service/File Artifacts/HPC Service(A/B/C) 전부 SIREN 캐시에서 읽는다** — event +
     야간 재동기화로 채워진 값이다(04장 §7, 07장 §3·§4). release/preview 시점에 그 서비스로
     라이브 조회를 하지 않는다.
   - D는 SIREN 로컬(수동) 기록에서 찾는다.
3. 직전 release와 `majorKey` 를 비교해 `changed` 를 계산한다.
4. **`changed: true`인 항목만** flow 그래프에서 직전 1홉 upstream을 모아 source 후보와
   기본값(최신 published)을 만든다. **`changed: false`인 항목은 직전 release의 `items[].sources`
   값을 그대로 복사**한다(§4.2) — source 후보 계산도, 사용자 선택도 필요 없다.
5. tier별 규칙으로 recipient를 계산한다.

> **평소 캔버스 렌더링도, preview/release 실행도 이제 외부 서비스를 호출하지 않는다** — 버전은
> SIREN 캐시에서 읽는다(위 2번). 그 서비스에 라이브로 묻는 건 **산출물 상세 slide를 열 때의
> canView/canEdit·html-view뿐**이다(04장 §7, 07장 §5). 그래야 서비스 하나가 느려도 캔버스도,
> release도 멈추지 않는다.
