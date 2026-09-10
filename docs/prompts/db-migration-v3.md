# 프롬프트 — SIREN v3 실 DB 마이그레이션 (실행 전용)

> **이 파일은 그대로 복사해서 desktop Claude Code에 붙여넣는 용도다.**
> 목표는 **실제 MongoDB의 데이터를 v3 스키마 모양으로 바꾸는 것 하나뿐**이다.
> 코드를 만들거나 고치는 작업이 아니다 — 코드는 이미 v3로 다 바뀌어 있고, 지금 뒤처져 있는 것은 DB뿐이다.

---

## 0. 절대 원칙 — 먼저 읽고 시작할 것

이 작업이 끝났을 때 **SIREN 저장소에는 단 한 줄의 변경도 남아 있으면 안 된다.**

| # | 규칙 |
|---|---|
| 1 | **SIREN 저장소 안의 어떤 파일도 만들거나 고치거나 지우지 않는다.** 읽는 것은 얼마든지 해도 되고 오히려 필요하다(스키마 모양 확인 등). 금지되는 것은 **쓰기**뿐이다. |
| 2 | **`git add` / `git commit` / `git push` / `git merge` / 브랜치 생성 — 저장소에 무언가를 반영하는 명령은 어떤 경우에도 실행하지 않는다.** 실수로라도 실행하지 않는다. |
| 3 | 스크립트·로그·백업 파일은 **저장소 디렉터리 바깥**에 만든다(예: `~/siren-v3-migration/`). 저장소 안에 임시 파일을 두는 것도 안 된다 — untracked라도 안 된다. |
| 4 | 부득이하게 저장소 안의 파일을 잠깐 고쳐야만 실행이 가능한 상황이 오면, **DB 변경을 끝낸 뒤 그 파일을 정확히 원래대로 되돌린다**(`git checkout -- <path>`). 그리고 왜 필요했는지 보고서에 적는다. 이 경우에도 규칙 2는 그대로 유효하다. |
| 5 | 작업을 마치기 전에 저장소 루트에서 `git status`와 `git diff`를 실행해 **완전히 깨끗한지 확인하고 그 출력을 보고서에 붙인다.** |

> 이 제한은 **SIREN 저장소에만** 적용된다. RPM 같은 외부 연동 서비스의 저장소는 해당 없다
> (그쪽 작업은 `rpm-access-endpoint.md`가 따로 다룬다).

**인메모리 모드에서는 이 작업 자체가 필요 없다.** `DB_CONNECTION` / `AES_KEY`가 비어 있으면 시드가
부팅할 때마다 새 스키마로 다시 만들어진다. 이 문서는 **실제 MongoDB를 쓰는 환경 전용**이다.

---

## 1. 배경 — 무엇이 바뀌었나

1. **HLD 개념 전면 폐기.** 옛 HLD release 컬렉션이 사라지고, 그 자리에 **의미가 완전히 다른**
   `releases`(workflow → 부서 전달 기록)가 들어왔다. **둘은 서로 옮길 수 있는 관계가 아니다** —
   옛 데이터를 새 컬렉션으로 변환하지 말고 버린다.
2. **`deliverables` → `blocks` + `artifacts`.** "캔버스 위의 자리"와 "산출물 실체"를 분리했다.
   같은 산출물이 여러 workflow의 캔버스에 놓여도 버전 이력과 권한은 하나다.
3. **권한 모델이 `AccessGrant { departments[], users[] }` 한 모양으로 통일**되었다.
   `owners[]`, `viewGrants[]` 같은 옛 모양은 전부 여기로 접힌다.
4. **용어 분리:** 산출물이 자기 서비스에서 공식 버전을 확정하는 것이 **publish**,
   workflow가 부서에 전달하는 것이 **release**다. `isReleased` → `isPublished`.
5. **A Tier의 recipient는 artifact가 아니라 block에 붙는다** — 같은 artifact라도 workflow마다
   받는 부서가 다를 수 있기 때문이다.

**목표 스키마의 정본은 코드다.** 아래 파일들을 **읽어서**(고치지 말고) 정확한 필드 구성을 먼저 확인할 것:

```
api/src/common/schemas/access-grant.schema.ts
api/src/blocks/schemas/block.schema.ts
api/src/artifacts/schemas/artifact.schema.ts
api/src/workflows/schemas/workflow.schema.ts
api/src/releases/schemas/release.schema.ts
api/src/projects/schemas/project.schema.ts
```

설계 배경은 `docs/02-data-model.md`, `docs/04-artifact-and-publish.md`에 있다.

---

## 2. 작업 공간 만들기 (저장소 **바깥**)

```bash
mkdir -p ~/siren-v3-migration && cd ~/siren-v3-migration
npm init -y
npm install mongodb crypto-js
```

여기에 `migrate.mjs`를 만들고 여기서 실행한다. **SIREN 저장소의 `package.json`이나 `node_modules`는
건드리지 않는다.**

### 왜 Mongoose가 아니라 raw 드라이버인가

문서 필드에는 암호화가 걸려 있지 않다. `AES_KEY`는 **연결 문자열(`DB_CONNECTION`)을 푸는 데만**
쓰이고(`api/src/config/configuration.ts`), 문서 본문은 평문으로 저장된다. 그래서 공식 `mongodb`
드라이버로 직접 읽고 쓰는 것이 안전하며, 그 편이 저장소 코드에 전혀 의존하지 않아 규칙 1을 지키기 쉽다.

---

## 3. 연결 문자열 얻기

`api/.env.production`(또는 그 환경이 실제로 쓰는 env 파일)을 **읽어서** `DB_CONNECTION`과 `AES_KEY`를
가져온다. `NODE_ENV=production`이면 `.env.production`, 아니면 `.env.development`를 읽는다
(`api/src/config/env.ts` 참고).

`DB_CONNECTION`은 AES 암호문이다. 복호화 방식은 `api/src/utils/index.ts`와 같다:

```js
import CryptoJS from 'crypto-js';
const uri = CryptoJS.AES.decrypt(DB_CONNECTION, AES_KEY).toString(CryptoJS.enc.Utf8);
```

복호화 결과가 빈 문자열이면 키가 틀린 것이다. **그 상태로 진행하지 말고 멈춘다.**

---

## 4. 먼저 확인할 것 — 실제 컬렉션 이름

Mongoose는 컬렉션 이름을 **전부 소문자로** 만든다. 그래서 옛 HLD 컬렉션은 `hldReleases`가 아니라
`hldreleases`일 가능성이 높고, `ArtifactService`는 `artifactservices`다.

**추측하지 말고 먼저 실제 목록을 찍어서 확인한다:**

```js
const names = (await db.listCollections().toArray()).map((c) => c.name);
console.log(names);
```

그 결과를 보고서 맨 앞에 남기고, 아래 규칙의 이름들을 실제 이름에 맞춘다.
**이미 `blocks` / `artifacts`가 존재하고 문서가 들어 있다면 이 마이그레이션은 이미 수행된 것이다** —
그 경우 아무것도 쓰지 말고 그 사실을 보고한다.

---

## 5. 실행 순서

### 5.1 백업 (가장 먼저)

`deliverables`, `workflows`, `projects`, 그리고 옛 HLD 컬렉션을 각각
`<name>_backup_v3`로 복제한다. **이미 있으면 덮어쓰지 말고 경고만 남기고 진행한다**(두 번째 실행이라는 뜻).

```js
await db.collection('deliverables').aggregate([{ $out: 'deliverables_backup_v3' }]).toArray();
```

> 백업은 DB 안에 만드는 것이고, 파일로 덤프를 뜬다면 그 파일도 **저장소 바깥**에 둔다.

### 5.2 dry-run이 기본

- 아무 인자 없이 실행하면 **아무것도 쓰지 않고** "무엇을 몇 건 바꿀 것인지"만 출력한다.
- 실제 쓰기는 `--apply`를 줘야만 한다.
- 먼저 dry-run 결과를 사람이 볼 수 있게 보고하고, 그 다음에 `--apply`를 실행한다.

### 5.3 멱등성

두 번 돌려도 결과가 같아야 한다. 이미 옮겨진 문서를 다시 쪼개면 안 된다
(예: 그 `deliverables._id`가 이미 `blocks`에 존재하는지로 판정 — §6.3의 `_id` 유지 규칙 참고).

### 5.4 실패 처리

문서 하나가 실패해도 전체를 멈추지 않는다. 모아서 마지막에 **문서 `_id`와 사유**를 함께 보고한다.

---

## 6. 변환 규칙

### 6.1 폐기 (drop)

| 컬렉션 | 처리 |
|---|---|
| 옛 HLD release 컬렉션 (`hldreleases` 등, §4에서 확인한 실제 이름) | **drop.** 새 `releases`로 옮기지 않는다 |
| `hubsynccheckpoints` | drop |

### 6.2 `projects`

| 필드 | 처리 |
|---|---|
| `code`, `revision` | 그대로. 단 `revision`이 `REVISION_RE`(`api/src/common/constants/revision.ts`)에 안 맞으면 `EVT0`으로 정규화하고 그 사실을 로그에 남긴다 |
| `departments` | 없으면 `[]`. 있으면 trim + 중복 제거 |
| `members[].departments` | `projects.departments`에 없는 값이 있으면 **그 부서를 `projects.departments`에 추가한다** (사람 쪽을 지우지 않는다) |

`(code, revision)`에 unique 인덱스가 새로 걸린다. **중복이 있으면 마이그레이션을 중단하고 중복 쌍을
전부 출력한다** — 자동으로 하나를 고르지 말 것. 사람이 판단할 문제다.

### 6.3 `deliverables` → `blocks` + `artifacts`

이 부분이 핵심이다. 문서 하나가 둘로 쪼개진다.

```
그룹핑:
  같은 project 안에서 같은 (serviceKey, externalArtifactId)를 가진 deliverable 문서들
    → artifacts 1건으로 합친다
      · versions는 최신순으로 병합하고 중복 versionRef는 제거한다
      · name / tier / network는 가장 최근 문서의 값을 쓴다
      · tier는 versions[0].tier를 캐시한 값이어야 한다(불일치하면 versions[0] 기준으로 고친다)
    → 그 그룹의 각 deliverable은 artifactId가 그 artifact를 가리키는 blocks 1건이 된다

  serviceKey가 null이고 externalUrl / sourceDept / sourceContact도 없는 문서
    → artifact를 만들지 않는다. artifactId: null인 blocks만 남긴다
      (= "자리는 잡았으나 출처 미지정"이라는 정상 상태다)

  serviceKey는 없고 sourceDept / sourceContact만 있는 문서 (구 D 티어)
    → artifacts 1건을 tier 'D'로 만들고 이름을 그대로 쓴다. 그룹핑하지 않는다(문서 1:1)
```

**★ `blocks._id`는 원본 `deliverables._id`를 그대로 재사용한다.** 그러면 `edges`/`memos`가 들고 있는
참조를 손댈 필요가 없고(§6.5), 멱등성 판정도 이 값 하나로 끝난다.

**Block으로 가는 값:** `projectId`, `workflowId`, `phaseId`, `name`, `layout{x,y,w,h}`,
`series`, `seriesIdx`, `seriesTotal`, `createdBy`, `isMock`. `intent`는 전부 `'own'`으로 둔다.

**Artifact로 가는 값:** `projectId`, `name`, `tier`, `network`, `serviceKey`,
`externalArtifactId`, `artifactTypeKey`, `externalUrl`, `versions[]`, `createdBy`, `isMock`.

**버전 필드:** `versions[].isReleased` → `versions[].isPublished`로 **이름만** 바꾼다. 값은 그대로다.
`isReleased` 필드는 `$unset`한다.

### 6.4 권한 초기값

```
A Tier artifact가 매핑된 block
  → block.recipients.viewAccess.departments = 구 recvDept가 있으면 [recvDept], 없으면 []
  → block.recipients.editAccess = { departments: [], users: [] }
  → artifact.editAccess / viewAccess는 **비워 둔다** (A는 서비스가 권한을 판정한다)

B / C / D artifact
  → artifact.viewAccess.departments = 구 recvDept가 있으면 [recvDept], 없으면 []
  → artifact.editAccess.departments = 그 블록이 있던 workflow의 department
     (여러 workflow에 걸쳐 있으면 그 department들의 합집합)
  → block.recipients는 비워 둔다
```

> **주의:** 같은 artifact가 여러 workflow에 있으면 `viewAccess`는 **합집합**이다.
> 권한을 좁히는 방향으로 병합하면 기존에 보이던 사람이 못 보게 되어 사고가 난다.

### 6.5 `workflows`

| 기존 | 새 필드 | 규칙 |
|---|---|---|
| `domain` | `department` | 값 복사. 비어 있으면 생성자(`createdBy`)의 부서 → 그것도 없으면 그 project의 `departments[0]` → 그것도 없으면 실패 목록에 넣고 스킵 |
| `owners[]` | `ownerKnoxId` + `editAccess.users` | `owners[0]`을 `ownerKnoxId`로, 나머지는 `editAccess.users`로 |
| `viewGrants[]` | `viewAccess.users` | `knoxId`만 가져온다. 항목의 `department`는 버린다 |
| — | `editAccess.departments` | **반드시 `[department]`를 포함**한다. 나중에도 삭제 불가인 항목이다 |
| — | `releaseSeq` | `0` |
| — | `canvasLock` | `null` |
| — | `phaseWidths` | 없으면 `{}` |

`department`가 그 project의 `departments`에 없으면 **project 쪽에 그 부서를 추가**한다
(workflow를 고아로 만들지 않는다).

### 6.6 `edges` / `memos`

§6.3의 `_id` 유지 규칙을 지켰다면 **손댈 것이 없다.** 그래도 마지막에
"`edges`/`memos`가 가리키는 id가 전부 `blocks`에 존재하는지"는 검증한다(§7).

### 6.7 인덱스

마지막에 새 인덱스를 만든다(이름은 각 스키마 파일 하단에 정의되어 있다):

```
projects:  { code: 1, revision: 1 } unique
blocks:    { workflowId: 1, phaseId: 1 }, { series: 1 }
artifacts: { projectId: 1, serviceKey: 1, externalArtifactId: 1 },
           { 'viewAccess.departments': 1 }, { 'editAccess.departments': 1 }
workflows: { 'editAccess.departments': 1 }, { 'editAccess.users': 1 },
           { 'viewAccess.departments': 1 }, { 'viewAccess.users': 1 }
releases:  { workflowId: 1, seq: -1 }, { projectId: 1, releasedAt: -1 },
           { recipientDepartments: 1, releasedAt: -1 }, { 'items.artifactId': 1, releasedAt: -1 }
```

옛 인덱스는 컬렉션과 함께 사라진다.

---

## 7. 끝나고 검증

스크립트가 **스스로 확인하고 결과를 출력**하게 한다. 전부 DB 조회만으로 가능하다:

```
[ ] deliverables 문서 수 == blocks 문서 수
[ ] artifactId가 null이 아닌 모든 block에 대해, 그 artifact가 존재하고
    artifact.projectId === block.projectId       ← 1건이라도 위반이면 실패로 보고
[ ] edges / memos가 가리키는 block id가 전부 blocks에 존재한다
[ ] 모든 workflow에서 editAccess.departments.includes(department) === true
[ ] 모든 workflow의 ownerKnoxId가 비어 있지 않다
[ ] isReleased 필드가 남아 있는 문서가 0건이다
[ ] 옛 HLD release 컬렉션 / hubsynccheckpoints / deliverables 가 존재하지 않는다
```

### 앱으로 확인하고 싶다면

이미 배포/실행 중인 SIREN API가 있다면 재기동한 뒤 아래를 확인해도 좋다.
**단, 이때도 저장소 파일은 고치지 않는다.** 빌드 산출물(`dist/`)은 gitignore 대상이라 무방하다.

```
GET /api/v1/projects                → 내가 member인 과제만 나온다
GET /api/v1/projects/:id/workflows  → workflow마다 myAccess가 붙어 온다
GET /api/v1/workflows/:id/blocks    → 블록마다 artifact가 채워지거나 null이다
```

---

## 8. 마무리 — 반드시 실행할 것

```bash
cd <SIREN 저장소 루트>
git status
git diff
```

**둘 다 완전히 비어 있어야 한다.** 출력을 보고서에 그대로 붙인다.
무언가 남아 있다면 `git checkout -- <path>`로 되돌리고, 왜 생겼는지 설명한다.
어떤 경우에도 `git add` / `git commit`으로 정리하지 않는다.

---

## 9. 하지 말 것 (요약)

- **SIREN 저장소의 파일을 만들거나 고치거나 지우지 말 것.** 스크립트는 저장소 바깥에 둔다.
- **`git add` / `git commit` / `git push`를 실행하지 말 것.** 어떤 이유로도.
- 옛 HLD release 컬렉션을 `releases`로 변환하지 말 것. 의미가 다르다. 버린다.
- 권한을 좁히는 방향으로 병합하지 말 것. 병합은 항상 합집합이다.
- `(code, revision)` 중복을 자동으로 해소하지 말 것. 중단하고 사람에게 보고한다.
- 부서 문자열을 임의로 정규화하지 말 것(trim 이상은 금지). 부서명은 과제마다 자유 입력이라
  자동 매칭이 오히려 데이터를 망친다.
- 백업 없이 `--apply`를 실행하지 말 것.
