# 프롬프트 — Block→Node 개명 + 부서 ID화 실 DB 마이그레이션 (실행 전용)

> **이 파일은 그대로 복사해서 desktop Claude Code에 붙여넣는 용도다.**
> 목표는 **실제 MongoDB의 데이터를 코드가 이미 반영한 v4 스키마 모양으로 바꾸는 것 하나뿐**이다.
> 코드를 만들거나 고치는 작업이 아니다 — 코드는 이미 이 개정으로 다 바뀌어 있고, 지금 뒤처져
> 있는 것은 DB뿐이다. `docs/prompts/db-migration-v3.md`(직전 마이그레이션)의 바로 다음 순서다.

---

## 0. 절대 원칙 — 먼저 읽고 시작할 것

이 작업이 끝났을 때 **SIREN 저장소에는 단 한 줄의 변경도 남아 있으면 안 된다.**

| # | 규칙 |
|---|---|
| 1 | **SIREN 저장소 안의 어떤 파일도 만들거나 고치거나 지우지 않는다.** 읽는 것은 얼마든지 해도 되고 오히려 필요하다(스키마 모양 확인 등). 금지되는 것은 **쓰기**뿐이다. |
| 2 | **`git add` / `git commit` / `git push` / `git merge` / 브랜치 생성 — 저장소에 무언가를 반영하는 명령은 어떤 경우에도 실행하지 않는다.** 실수로라도 실행하지 않는다. |
| 3 | 스크립트·로그·백업 파일은 **저장소 디렉터리 바깥**에 만든다(예: `~/siren-node-dept-migration/`). 저장소 안에 임시 파일을 두는 것도 안 된다 — untracked라도 안 된다. |
| 4 | 부득이하게 저장소 안의 파일을 잠깐 고쳐야만 실행이 가능한 상황이 오면, **DB 변경을 끝낸 뒤 그 파일을 정확히 원래대로 되돌린다**(`git checkout -- <path>`). 그리고 왜 필요했는지 보고서에 적는다. 이 경우에도 규칙 2는 그대로 유효하다. |
| 5 | 작업을 마치기 전에 저장소 루트에서 `git status`와 `git diff`를 실행해 **완전히 깨끗한지 확인하고 그 출력을 보고서에 붙인다.** |
| 6 | **`siren_hub_dev` 데이터베이스는 이 작업 전체에서 단 한 번도 쓰기 대상이 되지 않는다.** 읽기 전용 소스로만 연결한다 — 컬렉션 rename도, 문서 수정도, 인덱스 추가도 전부 금지. 모든 변환 결과는 새 `siren` 데이터베이스에 쓴다(§5). 이유: 중간에 무엇이 잘못되더라도 `siren_hub_dev`가 그대로 남아 있으면 언제든 처음부터 다시 시작할 수 있다 — 이게 이번 마이그레이션의 안전망이다. |

> 이 제한은 **SIREN 저장소에만** 적용된다. Calypso는 별도 저장소가 아니라 이 모노레포 안의
> `calypso/` 디렉터리이지만 규칙은 동일하게 적용된다 — `calypso/`의 파일도 고치지 않는다.

**인메모리 모드에서는 이 작업 자체가 필요 없다.** `DB_CONNECTION` / `AES_KEY`가 비어 있으면 시드가
부팅할 때마다 새 스키마로 다시 만들어진다. 이 문서는 **실제 MongoDB를 쓰는 환경 전용**이다.

---

## 1. 배경 — 무엇이 바뀌었나

1. **`Block` → `Node` 전면 개명.** 캔버스 위의 자리를 가리키던 컬렉션/클래스/필드명이 전부
   `Node`/`WorkflowNode`로 바뀌었다 — `blocks` 컬렉션은 이제 **컬렉션 이름 자체가 `nodes`**다.
   `edges.fromId`/`toId`의 참조 대상, `releases.items[].nodeId`(구 `blockId`) 등 `Block`을
   참조하던 모든 필드도 이름만 바뀌었고 값의 의미(ObjectId 참조)는 그대로다.
2. **부서가 이름 문자열에서 `{id, name}`으로 바뀌었다.** `projects.departments`가
   `string[]`에서 `{ id: string, name: string }[]`로 바뀌었고, 그 부서를 참조하던 다른 모든
   필드(아래 §6.3 표)도 **이름 문자열 대신 그 부서의 `id`를 저장**하도록 바뀌었다. 이제
   부서명을 바꾸면(`PATCH /projects/:id/departments/:deptId` — rename) 그 부서를 참조하는
   모든 화면이 즉시 새 이름으로 보인다 — 이게 이번 개정의 핵심 동기다.
3. **release 이력의 부서 표기는 그 시점 이름을 같이 얼려 둔다.** `releases.workflowAt`에
   `departmentLabel`(그 순간의 부서 이름, 문자열)이 새로 추가된다 — `department`(id)가 가리키는
   부서가 나중에 지워지는 극단적인 경우에만 쓰이는 대체 표시값이다. 평소에는 `department`(id)를
   지금의 `projects.departments`에서 실시간으로 찾아 보여준다.
4. **release feedback(부서별 status/comment)을 workflow 쪽에서 한눈에 모아보는 대시보드**가
   생겼다 — 기존 `releaseFeedback` 컬렉션의 구조는 그대로이고(스키마 변경 없음), 이 마이그레이션은
   그 대시보드를 실제로 확인해볼 수 있도록 **샘플 데이터만** 채운다(§6.4).
5. **개발 DB 이름이 `siren_hub_dev`에서 `siren`으로 바뀐다** — 단, `siren_hub_dev`는 읽기
   전용 소스로만 쓰고 절대 고치지 않는다(§0 규칙 6). 모든 변환 결과는 새 `siren` DB에 쓴다(§5.5).

**목표 스키마의 정본은 코드다.** 아래 파일들을 **읽어서**(고치지 말고) 정확한 필드 구성을 먼저
확인할 것:

```
api/src/nodes/schemas/node.schema.ts
api/src/projects/schemas/project.schema.ts
api/src/workflows/schemas/workflow.schema.ts
api/src/releases/schemas/release.schema.ts
api/src/releases/schemas/release-feedback.schema.ts
api/src/common/schemas/access-grant.schema.ts
api/src/database/database.module.ts        ← 각 모델의 실제 컬렉션 이름을 여기서 확인한다
calypso/src/artifacts/schemas/artifact.schema.ts
```

설계 배경은 `docs/02-data-model.md`, `docs/01-permissions.md`, `docs/05-release.md` §7에 있다.

---

## 2. 작업 공간 만들기 (저장소 **바깥**)

```bash
mkdir -p ~/siren-node-dept-migration && cd ~/siren-node-dept-migration
npm init -y
npm install mongodb crypto-js
```

여기에 `migrate.mjs`를 만들고 여기서 실행한다. **SIREN 저장소의 `package.json`이나 `node_modules`는
건드리지 않는다.**

### 왜 Mongoose가 아니라 raw 드라이버인가

문서 필드에는 암호화가 걸려 있지 않다. `AES_KEY`는 **연결 문자열(`DB_CONNECTION`)을 푸는 데만**
쓰이고(`api/src/config/configuration.ts`), 문서 본문은 평문으로 저장된다. 그래서 공식 `mongodb`
드라이버로 직접 읽고 쓰는 것이 안전하며, 그 편이 저장소 코드에 전혀 의존하지 않아 §0 규칙 1을
지키기 쉽다.

---

## 3. 연결 문자열 얻기 — 소스 하나, 목적지 하나

이 마이그레이션은 **두 데이터베이스에 동시에 연결한다:**

- **소스(읽기 전용)** — `siren_hub_dev`. 지금 실제로 쓰이고 있는 개발 DB.
- **목적지(쓰기)** — `siren`. 아직 존재하지 않는 새 DB(처음 쓰면 Mongo가 자동으로 만든다).

두 DB 모두 **같은 Mongo 서버/클러스터 안에 있다** — 즉 연결 문자열은 호스트가 같고 DB 이름
경로만 다르다(`mongodb://<host>:<port>/siren_hub_dev` vs `.../siren`). 실제 호스트는
`api/.env` 또는 `api/.env.development`를 **읽어서**(고치지 말고) `DB_CONNECTION`/`AES_KEY`를
가져와 복호화한다:

```js
import CryptoJS from 'crypto-js';
const uri = CryptoJS.AES.decrypt(DB_CONNECTION, AES_KEY).toString(CryptoJS.enc.Utf8);
// uri는 지금 "siren_hub_dev"를 가리키고 있을 것이다 — 그 사실 자체가 이 마이그레이션이
// 아직 실행되지 않았다는 신호다(§4). 이 uri의 호스트:포트만 가져오고 DB 이름 세그먼트는
// 이 스크립트가 'siren_hub_dev'(소스)/'siren'(목적지) 두 개로 직접 갈아끼운다.
```

복호화 결과가 빈 문자열이면 키가 틀린 것이다. **그 상태로 진행하지 말고 멈춘다.**

`api/.env`의 `DB_CONNECTION`을 실제로 `siren`으로 바꾸는 것은 **이 프롬프트의 일이 아니다**
(§0 규칙 1·4 — `.env`도 저장소 파일이다) — §5.5 끝에서 사람에게 안내만 한다.

---

## 4. 먼저 확인할 것 — 실제 컬렉션 이름과 진행 여부

```js
const srcNames = (await srcDb.listCollections().toArray()).map((c) => c.name);
const dstNames = (await dstDb.listCollections().toArray()).map((c) => c.name);
console.log({ srcNames, dstNames });
```

그 결과를 보고서 맨 앞에 남긴다.

- `srcNames`에 `blocks`가 없고 `nodes`만 있다면 — **이상하다.** 소스(`siren_hub_dev`)는 절대
  쓰기 대상이 된 적이 없어야 하므로, 이 마이그레이션이 이미 실행되어 소스 자체를 바꿨다는
  뜻일 수 없다. `db-migration-v3.md`가 이미 컬렉션을 `blocks`로 만들어 뒀어야 정상이다 —
  `blocks`도 `nodes`도 없다면 v3 마이그레이션부터 먼저 필요하다는 뜻이니 **멈추고 보고한다.**
- `dstNames`가 이미 `nodes`/`projects`/`workflows` 등을 담고 있어 이번 마이그레이션이 이미
  한 번 완료된 것처럼 보이면 — **덮어쓰지 않는다.** §5.3의 멱등성 규칙에 따라 스킵하고
  그 사실을 보고한다(재실행이라는 뜻이다).

---

## 5. 실행 순서

### 5.1 백업 (가장 먼저, 소스가 아니라 목적지 쪽에)

`siren_hub_dev`는 애초에 쓰기 대상이 아니므로 "백업"의 의미가 다르다 — 여기서 백업이란,
**`siren` 안에 변환된 결과를 쓰기 직전 상태의 스냅샷**을 남겨서, 이 스크립트를 여러 번 돌리며
검증하다가 잘못된 중간 상태를 지우고 다시 시작할 수 있게 하는 것이다. 저장 위치는 자유다 —
`siren` 안에 `<collection>_backup` 컬렉션으로 두거나, 저장소 바깥의 로컬 파일(`mongodump`
결과)로 둬도 된다. **유일한 제약은 `siren_hub_dev`를 절대 건드리지 않는 것**뿐이다(§0 규칙 6).

### 5.2 dry-run이 기본

- 아무 인자 없이 실행하면 **아무것도 쓰지 않고**(소스에도, 목적지에도) "무엇을 몇 건 만들
  것인지"만 출력한다.
- 실제 쓰기는 `--apply`를 줘야만 한다.
- 먼저 dry-run 결과를 사람이 볼 수 있게 보고하고, 그 다음에 `--apply`를 실행한다.

### 5.3 멱등성

두 번 돌려도 결과가 같아야 한다 — `siren`에 이미 그 `_id`(소스와 동일한 `_id`를 그대로
재사용한다, 아래 §6 참고)의 문서가 있으면 다시 쓰지 않고 스킵한다.

### 5.4 실패 처리

문서 하나가 실패해도 전체를 멈추지 않는다. 모아서 마지막에 **문서 `_id`와 사유**를 함께 보고한다.

### 5.5 전체 흐름 — "복사하며 변환"이지 "제자리 변환"이 아니다

**모든 단계가 `siren_hub_dev`에서 읽고 `siren`에 쓰는 편도(one-way) 흐름이다.** 컬렉션
rename도 예외가 아니다 — `renameCollection`을 쓰지 않는다(그건 제자리 조작이라 소스를
바꾼다). 대신:

```js
const srcDocs = await srcDb.collection('blocks').find({}).toArray();
await dstDb.collection('nodes').insertMany(srcDocs.map(transformNode));
```

컬렉션별 순서(뒤 컬렉션이 앞 컬렉션의 `siren` 쪽 결과를 참조하므로 이 순서를 지킨다):

1. `projects` → `siren.projects` (부서 id 발급, §6.1)
2. `workflows` → `siren.workflows` (부서 문자열 → id, §6.2)
3. `blocks` → `siren.nodes` (컬렉션명 변경 + 부서 문자열 → id, §6.2)
4. `edges`, `memos` → `siren.edges`/`siren.memos` (참조 `_id`는 그대로 복사되므로 손댈 것
   없음 — `blocks._id`를 그대로 재사용해 `nodes._id`로 옮겼다면 참조가 자동으로 맞다, §6.2)
5. `artifacts`, `artifactServices`, `hubSyncCheckpoints`, `auditLogs` → 이름 그대로 `siren`에
   복사(변환 없음, 부서 문자열이 없는 컬렉션들이다 — `auditLogs`의 `meta` 안에 우연히 부서
   문자열이 있어도 감사 로그는 원문 그대로 보존한다, 건드리지 않는다)
6. `releases` → `siren.releases` (부서 문자열 → id + `departmentLabel` 동결, §6.4)
7. `releaseFeedback` → `siren.releaseFeedback` (그대로 복사, 값 변환 없음) + 샘플 데이터
   추가 삽입(§6.5, `siren` 안에서만 일어나는 순수 추가)
8. Calypso의 별도 DB(`calypso/.env`의 `DB_CONNECTION`이 가리키는 DB — SIREN의 `siren_hub_dev`/
   `siren`과 같은 서버라도 **다른 데이터베이스 이름**이다, §1의 스키마 설명 그대로) → 그
   DB 안의 `artifacts` 컬렉션의 부서 문자열을 id로 변환(§6.3). **이 DB는 Calypso 전용이라
   이름을 바꾸지 않는다** — SIREN의 `siren_hub_dev`→`siren` 개명과는 무관하고, 그 DB
   자체에서 제자리로 값만 바꾼다(컬렉션/DB 이름은 그대로 두는 대신, §0 규칙 6과 같은 이유로
   먼저 그 DB 전체를 `<calypso-db-name>_backup`으로 복제해 두고 나서 진행한다).

**레거시 컬렉션은 옮기지 않는다** — `siren_hub_dev`에 남아 있는, 지금 코드 어디에서도 참조하지
않는 컬렉션은 `siren`으로 복사하지 않는다. §4의 `srcNames` 목록을 아래 목록과 대조해서 없는
것들을 보고서에 "옮기지 않음"으로 명시한다:

```
현재 코드가 쓰는 컬렉션 전체(이 목록에 없으면 legacy로 간주하고 옮기지 않는다):
projects, workflows, artifacts(SIREN), nodes(구 blocks), edges, memos, releases,
releaseFeedback, artifactServices, hubSyncCheckpoints, auditLogs
(+ Calypso 쪽 별도 DB의 artifacts — 이건 SIREN의 siren_hub_dev/siren과 다른 DB이므로
이 목록과 별개로 다룬다, 위 8번)
```

---

## 6. 변환 규칙

### 6.1 `projects` — 부서 id 발급

```
departments: string[]  →  departments: [{ id: new ObjectId().toString(), name: <원래 문자열, trim만> }]
```

- 부서 문자열을 임의로 정규화하지 말 것(trim 이상은 금지) — `db-migration-v3.md`와 같은 원칙.
  같은 이름이 대소문자만 다르게 두 번 있었다면 **각각 다른 항목으로 남긴다**(자동으로 합치지
  않는다) — 합치면 그 프로젝트의 workflow/member 배정이 어느 쪽을 가리켰는지 알 수 없어진다.
- 이 단계에서 **프로젝트별 `name → id` 맵**을 만들어 메모리에 들고 있는다 — §6.2/§6.3/§6.4가
  전부 이 맵으로 조회한다. 맵은 프로젝트마다 독립이다(다른 프로젝트의 같은 이름 부서는
  다른 id를 갖는다 — 부서는 애초에 project-scoped였다).
- `members[].departments: string[]`도 같은 맵으로 이름→id 치환한다. 맵에 없는 이름(스킴이
  깨진 데이터)은 **그대로 두고 보고 목록에 추가한다** — 지어내지 않는다.
- `managers`는 KnoxID 배열이라 무관, 손대지 않는다.

### 6.2 `workflows`, `blocks`(→`nodes`) — 이름 문자열을 그 프로젝트의 id로

```
workflows.department               (string, 이름)  → department               (string, id)
workflows.editAccess.departments   (string[], 이름) → editAccess.departments   (string[], id)
workflows.viewAccess.departments   (string[], 이름) → viewAccess.departments   (string[], id)
blocks.recipients.departments      (string[], 이름) → nodes.recipients.departments (string[], id)
```

- 조회는 그 문서의 `projectId`로 §6.1의 맵을 골라 쓴다.
- **`blocks` → `nodes`는 컬렉션명이 바뀔 뿐 `_id`는 그대로 재사용한다** — `edges.fromId`/
  `toId`, `memos`가 참조하는 id가 그대로 유효하려면 이게 필수다. `intent`/`layout`/`series*`/
  `createdBy`/`isMock`/`artifactId`는 값 변환 없이 그대로 복사한다.
- **워크플로 자기 부서가 자기 node의 recipient로 들어있는 경우를 여기서 같이 정리한다** —
  사용자가 실 데이터에서 실제로 발견한 문제다: 어떤 workflow의 `department`가 그 workflow
  안의 node `recipients.departments`에도 들어 있는 사례가 있다(부서가 자기 자신에게
  전달하는 건 의미가 없다). id로 바꾸는 이 단계에서 함께 제거한다 — 변환된 `nodes` 문서를
  쓰기 전에, `node.recipients.departments`에서 그 node가 속한 workflow의 `department`(id)와
  같은 값이 있으면 뺀다. **몇 건을 고쳤는지 `_id` 목록과 함께 보고한다.**

### 6.3 Calypso `artifacts` — 별도 DB, SIREN의 `projectId`로 조회

Calypso의 `Artifact.department`/`editors[].department`/`viewGrants[].department`는 "SIREN
공용 데이터의 부서 목록에서 고른 값"이다(스키마 주석) — 즉 SIREN `projects`의 부서를
참조하고 있다. Calypso 문서의 `projectId`(SIREN의 project `_id`, 문자열)로 §6.1에서 만든
**SIREN 쪽** 프로젝트별 맵을 그대로 조회해서 치환한다 — Calypso 자신은 프로젝트를 소유하지
않으므로(참조만 한다, `calypso/src/artifacts/schemas/artifact.schema.ts` 주석) 별도 맵을
만들 필요가 없다.

```
artifacts.department                   (string, 이름) → department                   (string, id)
artifacts.editors[].department         (string, 이름) → editors[].department         (string, id)
artifacts.viewGrants[].department      (string, 이름) → viewGrants[].department      (string, id)
```

`type: 'user'`인 grant의 `department: null`은 그대로 둔다(건드릴 대상이 아니다).

Calypso 쪽은 §5.5 8번에서 설명했듯 **제자리 변환**이다(SIREN처럼 별도 DB로 복사하지 않는다) —
대신 그 DB 전체를 미리 백업 컬렉션으로 복제해 두고 진행한다.

### 6.4 `releases` — 부서 id 치환 + 그 순간 이름 동결

```
releases.workflowAt.department          (string, 이름)  → department      (string, id, §6.2와 같은 맵으로 조회)
—                                                        → departmentLabel (string) = 원래 있던 이름 문자열 그대로

releases.items[].recipients.departments (string[], 이름) → recipients.departments (string[], id)
releases.items[].blockId                (참조)           → nodeId (필드명만, 값은 그대로 — §6.2에서 _id를 유지했으므로 여전히 유효한 참조다)
releases.items[].sources[].blockId      (참조)           → sources[].nodeId (동일)
```

`recipientDepartments`/`recipientUsers`(문서 최상위, 조회 최적화용 평탄화 필드)도
`recipientDepartments`는 같은 방식으로 이름→id 치환한다.

### 6.5 `releaseFeedback` — 샘플 데이터 추가 (신규 삽입만, 기존 문서는 그대로 복사)

목적: workflow 쪽에서 여러 부서의 release status/comment를 한 번에 모아보는 새 대시보드
화면(`docs/05-release.md` §7 갱신분)을 실 데이터로 확인할 수 있게 한다.

- 대상: `siren.releases`로 옮긴 문서 중 `recipientDepartments`가 비어있지 않은 것들 — 프로젝트당
  최대 5건(적으면 있는 만큼 전부)을 고른다.
- 각 대상 release에 대해:
  1. 그 release의 recipient 부서 중 하나를 골라, **그 부서에 실제로 속한 project member**의
     knoxId를 `createdBy`로 하는 top-level `releaseFeedback` 문서 하나를 만든다 — `status`는
     `'accepted'`/`'partial'`/`'blocked'` 중 하나(다양하게 섞는다), `comment`는 짧고 사실적인
     한 줄(예: "확인했습니다 — v3 반영 확인" 같은 평이한 문장, 실제 서비스 문구를 흉내내되
     지어낸 개인정보는 넣지 않는다).
  2. 그 댓글에, **release를 낸 workflow의 department에 속한 member**의 knoxId로 답글
     (`parentId` = 위 댓글의 `_id`, `status: null`)을 하나 추가한다 — "workflow가 다는 답글"
     시나리오를 실 데이터에 채우는 부분이다.
- **실존하는 knoxId만 쓴다** — 그 project의 `members[]`에 없는 사람을 지어내지 않는다. 부서에
  속한 멤버가 한 명도 없으면 그 release는 건너뛰고 보고한다.
- **멱등성**: 이미 그 releaseId에 `releaseFeedback` 문서가 하나라도 있으면(재실행이든, 실제
  운영 데이터든) 건너뛴다 — 중복 생성하지 않는다.
- 기존에 `siren_hub_dev`에 이미 있던 `releaseFeedback` 문서는 위 규칙과 무관하게 전부 그대로
  `siren`으로 복사한다(값 변환 없음, `department` 필드는 이 컬렉션에서 애초에 id를 저장한 적이
  없었다 — 접근 통제가 project-roster 기준 실시간 판정이라 department 문자열 자체가 필터
  조건일 뿐 권한 소스가 아니었기 때문에, 이 컬렉션은 이번 개정에서도 원래 값 형태를 그대로
  둔다. 단, 새로 만드는 §6.5의 샘플 문서와 형태를 맞추기 위해서라도 이 필드가 지금 무엇을
  저장하고 있는지 먼저 `api/src/releases/schemas/release-feedback.schema.ts`를 읽어 확인할 것 —
  코드가 이 필드를 id로 바꿨다면 여기도 §6.1 맵으로 치환해야 하므로, 반드시 스키마 파일을
  최종 확인 소스로 삼는다).

---

## 7. 끝나고 검증

스크립트가 **스스로 확인하고 결과를 출력**하게 한다. 전부 DB 조회만으로 가능하다:

```
[ ] siren_hub_dev의 모든 컬렉션 문서 수가 마이그레이션 시작 전과 정확히 같다(= 한 번도 안 바뀌었다)
[ ] siren.nodes 문서 수 == siren_hub_dev.blocks 문서 수
[ ] siren.projects의 모든 departments[].id가 그 프로젝트 안에서 유일하다
[ ] workflows.department / editAccess.departments / viewAccess.departments 의 모든 값이
    그 프로젝트의 departments[].id 집합 안에 있다(남은 이름 문자열이 있으면 실패로 보고)
[ ] nodes.recipients.departments 도 동일 검증
[ ] 어떤 node도 자기 workflow의 department(id)를 자기 recipients에 포함하지 않는다
[ ] calypso artifacts.department / editors[].department / viewGrants[].department 도
    (department가 null이 아닌 경우) 그 project의 departments[].id 집합 안에 있다
[ ] releases.workflowAt.departmentLabel 이 채워지지 않은 문서가 0건이다
[ ] edges / memos 가 가리키는 node id가 전부 siren.nodes에 존재한다
[ ] siren.releaseFeedback 에 §6.5 샘플이 최소 1건 이상 있다(프로젝트에 recipient 있는
    release가 하나라도 있었다면)
[ ] git status / git diff 가 저장소 루트에서 완전히 비어 있다
```

---

## 8. DB 이름 정리 — `siren_hub_dev`(읽기 전용 소스) → `siren`(새 목적지)

- **`siren_hub_dev`는 이 문서의 어떤 단계에서도 쓰기 대상이 아니다** — §5.5의 편도 복사
  흐름이 그 자체로 이 요구사항을 만족한다. 별도의 "rename" 동작(`mongorenameCollection`이나
  DB 단위 rename)은 필요 없고, 하지도 않는다.
- 백업은 원하는 곳에 자유롭게 만들어도 된다(§5.1) — `siren_hub_dev` 안에만 아니면 된다.
- 검증(§7)이 전부 통과하면, `siren`이 이제 완전한 신규 스키마의 정본이다. `api/.env`(또는
  `.env.development`)의 `DB_CONNECTION`을 `siren`을 가리키도록 바꾸는 것은 **사람이 직접
  한다** — 이 프롬프트를 받은 세션은 저장소 파일을 고치지 않으므로(§0 규칙 1) 이 마지막
  한 줄만은 보고서에 "이제 `api/.env`의 `DB_CONNECTION`을 `siren`으로 가리키도록 바꾸세요"라고
  안내만 하고 직접 실행하지 않는다.
- `siren_hub_dev`는 검증이 끝난 뒤에도 **삭제하거나 비우지 않는다** — 그대로 둔다(사용자가
  별도로 정리하기 전까지는 손대지 않는 것이 원칙, §0 규칙 6과 같은 이유).

---

## 9. 마무리 — 반드시 실행할 것

```bash
cd <SIREN 저장소 루트>
git status
git diff
```

**둘 다 완전히 비어 있어야 한다.** 출력을 보고서에 그대로 붙인다.
무언가 남아 있다면 `git checkout -- <path>`로 되돌리고, 왜 생겼는지 설명한다.
어떤 경우에도 `git add` / `git commit`으로 정리하지 않는다.

**검증(§7)이 전부 초록불이면, 이번 마이그레이션이 만든 백업(§5.1의 `siren` 안 `_backup`
컬렉션이나 저장소 바깥의 덤프 디렉터리, Calypso 쪽 `_backup` 컬렉션)을 전부 지운다** —
사용자가 명시적으로 요청한 사항이다: 반영이 잘 됐다면 백업은 남겨둘 이유가 없다. **단,
`siren_hub_dev` 자체와 그 안의 어떤 것도 지우지 않는다**(§0 규칙 6, §8) — 여기서 "지운다"는
이번 마이그레이션이 새로 만든 백업 산출물에만 해당한다. `db-migration-v3.md`가 예전에
`siren_hub_dev` 안에 남겨둔 `deliverables_backup_v3` 등도, 검증이 전부 통과한 뒤라면 같은
원칙으로 정리 대상이지만 — 이것도 "`siren_hub_dev` 안의 무언가를 지운다"는 쓰기 동작이므로
**§0 규칙 6과 충돌한다**. 이 건은 자동으로 지우지 말고, 검증 결과와 함께 "이 백업들도 지워도
되는지" 사람에게 물어보는 별도 안내로 보고서에 남긴다.

---

## 10. 하지 말 것 (요약)

- **SIREN 저장소의 파일을 만들거나 고치거나 지우지 말 것.** 스크립트는 저장소 바깥에 둔다.
- **`git add` / `git commit` / `git push`를 실행하지 말 것.** 어떤 이유로도.
- **`siren_hub_dev`에 단 한 번의 쓰기도 하지 말 것** — rename, update, insert, index 생성
  전부 금지. 모든 쓰기는 `siren`(또는 Calypso 쪽 자기 DB)에만 한다.
- 부서 문자열을 임의로 정규화하지 말 것(trim 이상은 금지). 같은 이름이 대소문자만 다르게
  중복돼 있어도 자동으로 합치지 말 것 — 사람이 판단할 문제다.
- release feedback 샘플 데이터에 실존하지 않는 knoxId를 지어내지 말 것.
- 백업 없이 `--apply`를 실행하지 말 것.
- 검증(§7)이 전부 통과하기 전에는 어떤 백업도 지우지 말 것. 통과한 뒤에도 `siren_hub_dev`
  안의 것은 §0 규칙 6에 따라 지우지 말고 사람에게 물어볼 것(§9).
