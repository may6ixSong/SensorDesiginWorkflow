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

- 캔버스의 블록 중 **artifact가 매핑된 것 전부**(tier A~D 무관).
- **자동으로 전부 포함된다.** 사용자가 개별로 빼거나 넣을 수 없다.

### 2.2 제외

| 대상 | 이유 |
|---|---|
| artifact 미매핑 블록 | 전달할 실체가 없다 |
| 메모 블록 | 산출물이 아니다 |

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
│  Release #4 · 2026-09-10                              │
│                                                        │
│  ┌ 산출물 표 ───────────────────────────────────────┐ │
│  │ 산출물명 │ Tier │ 버전 │ 수신 부서 │ Source 버전 │ │
│  │ ...      │      │      │           │  ▼ 선택     │ │
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

### 4.2 Source 버전 선택

각 산출물마다, **flow로 연결된 직전 1홉(upstream)** 산출물의 버전을 고른다.

- **범위는 직전 1홉만이다.** A → B → C 에서 C를 release할 때 C의 source는 B뿐이다.
  A는 B를 release할 때 이미 기록되므로, release history를 타고 가면 전체 계보가 복원된다.
- 후보 목록: 그 source 산출물의 **published 버전 전체**(최신순).
- **기본값: 그 source의 최신 published 버전.**
- **published가 하나도 없으면** → 선택할 것이 없으므로 `없음(None)` 으로 남긴다.
  - **release는 그대로 진행된다.** 막지 않는다.
  - 표에서는 `없음 / None` 으로 표기하고, 받는 쪽 화면에는 **"아직 전달되지 않음"** 으로 보인다.
- upstream이 아예 없는 산출물은 source 칸이 빈 상태로 정상이다.

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
| workflow 이름 · 부서 (그 시점) | workflow가 개명·부서 이동해도 기록이 흔들리지 않는다 |

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

| Tier | 알림 대상 |
|---|---|
| A | `artifact.recipients` 의 부서 + 사용자 |
| B/C/D | `artifact.viewAccess` 의 부서 + 사용자 **및 `editAccess` 해당자** |

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

- **목록**: 그 workflow의 release를 최신순으로. 각 행에 `#seq`, 날짜, 실행자, 산출물 수,
  변경된 산출물 수, note 첫 줄.
- **상세**: 그 시점의 **표**. 캔버스는 재현하지 않는다.

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

### 7.2 부서별 필터 뷰

- "우리 부서가 받은 것"을 보는 화면이다.
- 부서를 고르면 그 부서가 recipient로 잡힌 **release item만** 가로질러 보여준다.
  (workflow 경계를 넘어 과제 전체에서 모은다)
- `recipientDepartments` 인덱스로 조회한다.
- 정렬은 날짜 최신순. 산출물명·workflow로 2차 필터를 건다.

### 7.3 artifact별 타임라인

- 산출물 상세 slide 안에서 "이 산출물이 포함된 release" 를 시간순으로 보여준다.
- 각 항목: release `#seq`, 날짜, 그때의 버전, 그때의 수신 부서, 그때의 source 버전.
- **이게 산출물 tracking의 본체다** — 한 산출물이 언제 어떤 버전으로 누구에게 갔는지가 한 화면에 모인다.
- `items.artifactId` 인덱스로 조회한다.

---

## 8. Preview API가 계산하는 것

`GET /workflows/:id/release/preview` 는 실제 release와 **같은 로직**으로 항목을 계산해 돌려준다.
그래야 미리보기와 결과가 어긋나지 않는다.

1. 그 workflow의 블록 중 `artifactId !== null` 인 것을 모은다.
2. 각 artifact의 **최신 published 버전**을 확인한다.
   - A/B Tier이고 연동이 있으면 이 시점에 서비스에 라이브 조회한다.
   - 조회에 실패한 서비스는 **SIREN이 마지막으로 알고 있던 값**을 쓰고, 항목에 "조회 실패" 플래그를 단다.
     release를 막지는 않는다.
   - C/D는 SIREN 로컬 기록에서 찾는다.
3. 직전 release와 `majorKey` 를 비교해 `changed` 를 계산한다.
4. flow 그래프에서 직전 1홉 upstream을 모아 source 후보와 기본값을 만든다.
5. tier별 규칙으로 recipient를 계산한다.

> **평소 캔버스 렌더링은 외부 서비스를 한 번도 호출하지 않는다.** 라이브 조회는 preview/release
> 실행 시점과 산출물 상세 slide를 열 때뿐이다. 그래야 서비스 하나가 느려도 캔버스가 멈추지 않는다.
