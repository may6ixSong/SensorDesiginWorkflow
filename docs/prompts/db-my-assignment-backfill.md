# 프롬프트 — My Assignment(09장) 실 DB 보정 (실행 전용)

> **이 파일은 그대로 복사해서 desktop Claude Code에 붙여넣는 용도다.**
> 목표는 **실제 MongoDB의 데이터를 My Assignment 화면이 제대로 동작하는 상태로 만드는 것 하나뿐**이다.
> 코드를 만들거나 고치는 작업이 아니다 — 코드는 이미 다 반영되어 있고, 지금 뒤처져 있는 것은 DB뿐이다.

---

## 0. 절대 원칙 — 먼저 읽고 시작할 것

이 작업이 끝났을 때 **SIREN 저장소에는 단 한 줄의 변경도 남아 있으면 안 된다.**

| # | 규칙 |
|---|---|
| 1 | **`git add` / `git commit` / `git push` / `git merge` / 브랜치 생성 — 저장소에 무언가를 반영하는 명령은 어떤 경우에도 실행하지 않는다.** 실수로라도 실행하지 않는다. |
| 2 | 저장소 안의 파일을 **읽는 것은 얼마든지 해도 되고 오히려 필요하다**(스키마 모양 확인). 금지되는 것은 쓰기를 남기는 것이다. |
| 3 | **DB를 고치기 위해 저장소 코드를 잠깐 고치는 것은 허용한다.** 다만 DB 변경이 끝나면 **정확히 원래대로 되돌린다**(`git checkout -- <path>`). 왜 필요했는지는 보고서에 적는다. |
| 4 | 스크립트·로그·백업 파일은 **저장소 디렉터리 바깥**에 만든다(예: `~/siren-my-assignment/`). untracked 파일도 저장소 안에 두지 않는다. |
| 5 | 작업을 마치기 전에 저장소 루트에서 `git status`와 `git diff`를 실행해 **완전히 깨끗한지 확인하고 그 출력을 보고서에 붙인다.** |

**인메모리 모드에서는 이 작업 자체가 필요 없다.** `DB_CONNECTION` / `AES_KEY`가 비어 있으면 시드가
부팅할 때마다 새로 만들어진다. 이 문서는 **실제 MongoDB를 쓰는 환경 전용**이다.

---

## 1. 무엇이 바뀌었나 — 이번 변경의 전부

새 화면 **My Assignment**(`/my`, app bar의 Project List 왼쪽)가 생겼다. 과제 경계를 넘어
"내 일"만 모아 보는 화면이며, 탭 두 개다.

1. **Overview**
   - ① 내가/내 부서가 **recipient로 받은** workflow release 목록 (최신순, 페이지네이션)
   - ② 내가 실행했거나 **내 부서 workflow가 낸** release 목록 (최신순, 페이지네이션)
   - ③ **내 부서 workflow가 주는 산출물** 목록 (모든 과제·모든 workflow, 최근 1년, 최근 갱신순)
   - ①②의 행을 누르면 다이얼로그가 열려 그때의 release note · 산출물별 published 버전 ·
     source 산출물과 선택된 버전 · 그 시점 recipients를 보여준다.
2. **Calendar** — 날짜별로 **artifact 버전 발행 event**(Tier A/B/C 전부, 미발행 working 버전 포함)와
   **workflow release event**를 색을 갈라 찍는다. 달을 옮길 때마다 **그 달 범위만** 읽는다.

**스키마 필드는 하나도 추가하지 않았다. 새 컬렉션도 만들지 않았다.**
(사용자 결정 — 같은 데이터를 변형해 여러 컬렉션으로 관리하지 않는다.)
바뀐 것은 **인덱스 3개 컬렉션**과, 그 위에서 도는 **새 조회 라우트 4개 + release 상세 1개**뿐이다.

| 컬렉션 | 새 인덱스 |
|---|---|
| `releases` | `{recipientUsers:1, releasedAt:-1}` · `{releasedBy:1, releasedAt:-1}` · `{'workflowAt.department':1, releasedAt:-1}` · `{releasedAt:-1}` |
| `artifacts` | `{'versions.publishedAt':-1}` · `{'versions.observedAt':-1}` · `{updatedAt:-1}` |
| `blocks` | `{workflowId:1, intent:1, artifactId:1}` |

새 라우트: `GET /my/releases/received` · `GET /my/releases/published` · `GET /my/artifacts` ·
`GET /my/calendar?from=&to=` · `GET /releases/:id`.

**설계 정본은 `docs/09-my-assignment.md`다. 시작 전에 그 문서를 읽을 것.**
스키마 정본은 코드이며, 아래 파일들을 읽어 필드 구성을 확인한다(고치지 말 것):

```
api/src/releases/schemas/release.schema.ts
api/src/artifacts/schemas/artifact.schema.ts
api/src/blocks/schemas/block.schema.ts
api/src/workflows/schemas/workflow.schema.ts
api/src/projects/schemas/project.schema.ts
api/src/assignments/my-scope.service.ts        ← "무엇이 내 것인가"의 판정이 전부 여기 있다
api/src/assignments/assignments.service.ts
```

---

## 2. 화면이 무엇을 보고 판정하는지 — 보정 대상이 여기서 나온다

이 화면은 **새 필드를 읽지 않는다.** 대신 **원래 있었지만 실 DB에서 비어 있기 쉬운 기존 필드들**에
전적으로 의존한다. 그래서 지금 DB 그대로면 화면이 "권한 문제 없이, 그냥 텅 비어" 보일 수 있다.
이 프롬프트의 실질적인 일은 **그 빈칸을 채우는 것**이다.

| 판정 | 읽는 값 | 비어 있으면 생기는 증상 |
|---|---|---|
| 내가 접근 가능한 과제 | `projects.members[].knoxId` | 화면 전체가 빈다 |
| 내가 그 과제에서 속한 부서 | `projects.members[].departments[]` | **부서 기반 판정이 전부 무력화**된다 — ①②③ 모두 빈다 |
| 내 부서 workflow | `workflows.department` | ③과 달력의 버전 event가 빈다 |
| 내가 주는 산출물 자리 | `blocks.intent === 'own'`, `blocks.artifactId != null` | ③과 달력의 버전 event가 빈다 |
| 받은 release | `releases.recipientDepartments[]`, `releases.recipientUsers[]` | ①이 빈다 |
| 낸 release | `releases.releasedBy`, `releases.workflowAt.department` | ②가 빈다 |
| 산출물 목록 정렬·1년 창 | `artifacts.updatedAt` + 버전의 `publishedAt`/`observedAt`/`createdAt` | ③이 통째로 빠지거나 순서가 뒤죽박죽이 된다 |
| 달력 event 날짜 | 버전의 `publishedAt` → 없으면 `observedAt` → `assertedAt` → `createdAt` | 달력이 빈다 |

---

## 3. 해야 할 일

### 3.1 인덱스 생성

§1 표의 인덱스를 `createIndex`로 만든다. Mongoose의 `autoIndex`에 맡기지 말고 **직접 만들고
`getIndexes()`로 확인**한다. 만들기 전에 `collStats`/`countDocuments`로 각 컬렉션 문서 수를 재고,
큰 컬렉션이면 `background`(또는 그 드라이버 버전의 동등 옵션)로 만든다.

### 3.2 누락 필드 진단 — 고치기 전에 반드시 먼저 센다

컬렉션별로 아래를 세어 **보고서에 숫자로 남긴다.** 무엇을 얼마나 고쳤는지가 남아야 한다.

- `projects`: `members`가 비었거나, `members[].departments`가 비거나 없는 문서 수
- `projects`: `departments[]`가 비어 있는 문서 수
- `workflows`: `department`가 없거나 빈 문자열인 문서 수, 그 값이 그 과제의 `departments`에 **없는** 문서 수
- `blocks`: `intent`가 없는 문서 수 (스키마 기본값은 `'own'`이지만 옛 문서엔 필드 자체가 없을 수 있다)
- `blocks`: `artifactId != null`인 문서 수 (③·달력의 모집단이다 — 0이면 그 두 화면은 정상적으로 빈 것이다)
- `releases`: `recipientDepartments`/`recipientUsers`가 비어 있는 문서 수
- `releases`: `workflowAt.department`가 비어 있는 문서 수
- `artifacts`: `updatedAt`이 없는 문서 수
- `artifacts`: `versions[]`의 엔트리 중 `publishedAt`·`observedAt`·`assertedAt`·`createdAt`이 **전부** 없는 엔트리 수

### 3.3 보정

아래 순서대로, **각 단계마다 dry-run(무엇을 몇 건 바꿀지 출력)을 먼저 돌리고 사용자에게 보여준 뒤** 실행한다.

1. **`blocks.intent`** — 필드가 없는 문서에 `'own'`을 채운다(스키마 기본값과 같다).
   단, 그 block이 명백히 받는 산출물이면(예: 그 artifact를 **다른** workflow의 own block이 이미
   갖고 있고 이 workflow는 그것을 참조만 하고 있다면) `'received'`가 맞다 — 애매하면 **바꾸지 말고
   그대로 두고 보고서에 목록으로 남긴다.** 잘못 `own`을 주면 남의 산출물이 내 목록에 뜬다.

2. **`workflows.department`** — 비었으면 그 workflow `ownerKnoxId`의 그 과제 멤버 부서 중 첫 번째,
   그것도 없으면 그 과제의 `departments[0]`. 채운 뒤에는 **`editAccess.departments`에 그 값이
   들어 있는지 확인**하고 없으면 넣는다(01장 §3.4 — workflow 소속 부서는 편집 권한에서 뺄 수 없다).

3. **`releases.workflowAt.department`** — 비었으면 그 `workflowId`의 현재 `department`로 채운다.
   원칙적으로는 "그때의 부서"지만, 비어 있는 것보다는 현재 값이 낫다. 채운 문서 수를 보고서에 남긴다.

4. **`releases.recipientDepartments` / `recipientUsers`** — 비어 있으면 그 release의
   `items[].recipients.departments` / `.users`를 전부 모아 중복 제거해 다시 채운다(02장 §6의
   파생 필드다 — 원본은 items 안에 이미 있다). **items의 recipients까지 비어 있는 release는
   손대지 말고** 목록으로 남긴다.

5. **`artifacts.updatedAt`** — 없으면 그 artifact의 버전 중 가장 최근 사건 시각
   (`publishedAt ?? observedAt ?? assertedAt ?? createdAt`)으로, 버전도 없으면 `createdAt`으로,
   그것도 없으면 `_id`의 생성 시각(ObjectId timestamp)으로 채운다.

6. **버전 엔트리의 시각** — 네 필드가 전부 비어 있는 엔트리는 그 artifact의 `createdAt`(없으면
   `_id` 시각)을 `createdAt`에 채운다. **`publishedAt`을 임의로 만들어 넣지 않는다** — 그러면
   발행되지 않은 것이 발행된 것처럼 보인다. `isPublished:true`인데 `publishedAt`만 없는 엔트리에
   한해 `observedAt`을 복사하고, 그 건수를 따로 보고한다.

### 3.4 화면이 실제로 채워지도록 — 사용자·부서 배치

여기가 이번 작업의 핵심이다. 위 보정이 다 끝나도 **`projects.members[].departments`가 비어 있으면
My Assignment는 Admin을 제외한 모두에게 빈 화면**이다. 부서 판정이 전부 이 값에서 나오기 때문이다.

- `projects.members[].departments`가 비어 있는 멤버들에게 **그 과제의 `departments[]` 중에서
  적절히 분배해 채운다.** 새 사람을 만들어 넣지 말고 **기존 project member들로만** 한다.
- 분배 기준은 이 순서로 본다:
  1. 그 사람이 `ownerKnoxId`이거나 `editAccess.users`에 들어 있는 workflow가 있으면 **그 workflow의
     `department`**를 준다. (실제로 그 일을 하고 있다는 가장 강한 증거다)
  2. 그 사람이 어느 block의 `recipients.users`에 들어 있으면, 그 block이 속한 workflow의
     `department`가 아니라 **그 block을 받는 부서들** 중 하나를 준다.
  3. 그래도 안 정해지면 그 과제 `departments[]`를 **골고루** 돌려 준다(한 부서에 몰아주지 않는다).
- `projects.departments[]` 자체가 비어 있는 과제는, 그 과제 workflow들의 `department` 값을 모아
  채운다. 그것도 없으면 `api/src/common/constants/departments.ts`의 기본 목록에서 고른다.
- **결과가 "화면에 실제로 뭔가 보이는가"로 검증되어야 한다.** 각 과제마다 최소 한 명은
  ①②③ 각각에 결과가 나오는 상태여야 한다 — 아래 §4의 검증이 그걸 확인한다.

또한 **화면을 보여주기에 데이터가 너무 빈약하면 보강한다**(사용자 요청). 다만 아래 범위 안에서만 한다.

- `releases`가 과제 전체에 1~2건뿐이면, **기존 workflow·기존 block·기존 artifact 버전을 근거로**
  과거 시점의 release 문서를 몇 건 더 만든다. `seq`는 그 workflow의 `releaseSeq`와 어긋나지 않게
  이어 붙이고(만든 뒤 `workflows.releaseSeq`도 맞춰 올린다), `items[]`는 실제 그 시점 block/artifact
  구성에서 만든다. **없는 산출물이나 없는 버전을 지어내지 않는다.**
- 달력이 여러 달에 걸쳐 보이도록, 위에서 만드는 release의 `releasedAt`과 (필요하면) 기존 버전
  엔트리의 시각을 **최근 3~6개월에 퍼뜨린다.** 단 §3.3-6의 원칙은 그대로다 — 발행되지 않은 것을
  발행된 것으로 만들지 않는다.
- 만든 문서에는 `isMock` 을 **기존 그 컬렉션의 관례와 같게** 둔다(실데이터면 `false`). 무엇을 새로
  만들었는지는 **_id 목록까지 보고서에 남긴다** — 나중에 되돌릴 수 있어야 한다.

---

## 4. 검증 — 코드를 고치지 않고 확인하는 법

API를 직접 호출해 확인한다. api는 `X-Knox-Id` 헤더로만 호출자를 식별하므로 로그인이 필요 없다.

```bash
BASE=http://localhost:3000/api/v1   # 실제 환경에 맞게

# ① 받은 release
curl -s "$BASE/my/releases/received?page=1&size=10" -H "X-Knox-Id: <knoxId>"
# ② 낸 release
curl -s "$BASE/my/releases/published?page=1&size=10" -H "X-Knox-Id: <knoxId>"
# ③ 내 부서가 주는 산출물
curl -s "$BASE/my/artifacts" -H "X-Knox-Id: <knoxId>"
# 달력 (그 달 격자 범위. 100일을 넘기면 400이다)
curl -s "$BASE/my/calendar?from=2026-05-31T15:00:00.000Z&to=2026-07-05T15:00:00.000Z" -H "X-Knox-Id: <knoxId>"
# release 상세
curl -s "$BASE/releases/<releaseId>" -H "X-Knox-Id: <knoxId>"

# Admin은 필터가 없어야 한다 — 전부 다 나와야 한다
curl -s "$BASE/my/releases/received" -H "X-Knox-Id: <knoxId>" -H "X-User-Group: Admin"
```

확인할 것:

1. **서로 다른 부서의 사용자 3명 이상**에 대해 ①②③이 각각 비어 있지 않고, **사람마다 결과가 다르다.**
   전원이 똑같은 결과를 받으면 부서 분배가 잘못된 것이다(전부 한 부서에 몰렸을 가능성).
2. Admin(`X-User-Group: Admin`)의 결과가 **일반 사용자보다 크거나 같다.** 작으면 필터가 잘못 걸린 것이다.
3. 그 과제의 member가 **아닌** knoxId로 부르면 전부 빈 결과이고, 그 사람에게 `GET /releases/:id`는 **403**이다.
4. 달력을 최근 3~6개월에 대해 각각 불러 **버전 event와 release event가 둘 다** 나오는 달이 있다.
5. `?page=2`가 1페이지와 **다른** 결과를 주고, `meta.total`이 두 페이지에서 같다.

브라우저로도 한 번 본다 — `/my`에서 Overview의 세 패널과 Calendar 탭이 채워져 보이고,
release 행을 눌렀을 때 다이얼로그에 note·버전·source·recipients가 뜨는지.

---

## 5. 보고서에 반드시 담을 것

1. §3.2 진단 숫자 (보정 전).
2. §3.3 각 단계에서 실제로 바꾼 문서 수, 그리고 **바꾸지 않고 남긴 애매한 건들의 목록**.
3. §3.4에서 각 과제의 멤버에게 어떤 부서를 왜 배정했는지 — 과제별 요약 표로.
4. §3.4에서 **새로 만든 문서의 컬렉션·_id 목록** (되돌릴 수 있게).
5. §4 검증 출력 — 최소 3명 + Admin + 비멤버.
6. 저장소 루트의 `git status`와 `git diff` 출력. **둘 다 깨끗해야 한다.**
7. 규칙 3을 써서 저장소 파일을 잠깐 고쳤다면, 무엇을 왜 고쳤고 어떻게 되돌렸는지.
