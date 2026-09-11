# 프롬프트 — v3 마이그레이션 점검/보정 (실행 전용, 후속)

> **이 파일은 그대로 복사해서 desktop Claude Code에 붙여넣는 용도다.**
> `db-migration-v3.md`로 1차 마이그레이션을 이미 돌린 뒤, 실사용 중 **Tier A로 Hub
> 레지스트리에 등록된 외부 서비스(Calypso가 아니라 별도로 운영 중인 서비스) 산출물의
> 버전이 slide에 안 보인다**는 증상이 나왔다. 이 서비스는 이번 세션 전부터 이미 연동돼
> 있었고 버전도 정상적으로 보이던 것이었다 — 즉 **v3 마이그레이션 과정에서 뭔가 깨진
> 것**으로 보고 진단한다. 이 파일은 그 원인을 **추측하지 말고 실제 DB를 찍어서** 진단하고,
> 확인된 것만 고친다. 그리고 그 김에 옛 스키마에서 넘어온 **불필요한 leftover 필드**가
> 있는지도 전체 컬렉션에 대해 감사(audit)한다.

---

## 0. 절대 원칙 — `db-migration-v3.md`와 완전히 동일하다

| # | 규칙 |
|---|---|
| 1 | **SIREN 저장소 안의 어떤 파일도 만들거나 고치거나 지우지 않는다.** 읽는 것은 얼마든지 해도 된다(오히려 스키마 확인을 위해 반드시 필요하다). 금지되는 것은 **쓰기**뿐이다. |
| 2 | **`git add` / `git commit` / `git push` / `git merge` / 브랜치 생성 등 저장소에 무언가를 반영하는 명령은 어떤 경우에도 실행하지 않는다.** |
| 3 | 스크립트·로그·백업은 **저장소 디렉터리 바깥**에 둔다(예: `~/siren-v3-migration/` — 이전 작업과 같은 폴더를 써도 된다). |
| 4 | 부득이하게 저장소 안 파일을 잠깐 고쳐야만 진단/실행이 가능하면, **DB 작업을 끝낸 뒤 정확히 원래대로 되돌린다**(`git checkout -- <path>`). 왜 필요했는지 보고서에 적는다. |
| 5 | 작업을 마치기 전 저장소 루트에서 `git status`/`git diff`가 **완전히 깨끗한지 확인**하고 그 출력을 보고서에 붙인다. |
| 6 | **DB에 실제로 쓰기 전에 반드시 dry-run 결과와 진단 내용을 먼저 보고한다.** 특히 아래 2부(필드 삭제)는 "무엇을, 왜, 몇 건"을 사람이 읽고 판단할 수 있게 먼저 보여준 다음에만 `--apply`한다. |

> 이 제한은 **SIREN 저장소에만** 적용된다. 외부 연동 서비스(RPM 등) 저장소는 해당 없다.
> **인메모리 모드**(`DB_CONNECTION`/`AES_KEY`가 비어 있는 환경)라면 이 작업 자체가 필요 없다
> — 재기동하면 시드가 새 스키마로 다시 만들어진다.

연결 문자열을 얻는 방법, 컬렉션 실제 이름을 먼저 찍어봐야 한다는 것 등은 `db-migration-v3.md`
§3~4와 동일하니 그대로 따른다. **이 파일과 같은 작업 스크립트/폴더를 재사용해도 된다.**

정본 스키마는 항상 코드다. 이번에 특히 아래 파일들을 **읽어서**(고치지 말고) 확인한다:

```
api/src/artifacts/schemas/artifact.schema.ts
api/src/blocks/schemas/block.schema.ts
api/src/hub/schemas/artifact-service.schema.ts
api/src/hub/observer-client.service.ts
api/src/hub/hub.service.ts
api/src/artifacts/artifact-access.service.ts
api/src/workflows/schemas/workflow.schema.ts
api/src/projects/schemas/project.schema.ts
api/src/releases/schemas/release.schema.ts
```

---

## 1부 — "Tier A 산출물의 버전이 slide에 안 보인다" 진단

### 1.1 배경 — Tier A가 어떻게 동작해야 하는가

Tier A(Live) 산출물은 버전을 DB에 저장해두지 않는다. **slide를 열 때마다 그 서비스에
실시간으로 물어본다.** 흐름은 이렇다:

```
artifacts 문서 (serviceKey, externalArtifactId, tier:'A')
        │
        │ serviceKey로 조회
        ▼
artifactServices 문서 (key === serviceKey)
  · enabled: true
  · transport: 'http'
  · baseUrl: 'https://...'          ← 이게 없거나 transport≠'http'면
                                        ObserverClientService가 "조용히" null/빈 값을 반환한다
        │
        │ baseUrl 기준으로 실제 HTTP 호출
        ▼
그 서비스의 Observer 계약 엔드포인트 (current-version / versions / access)
```

**`serviceKey`가 `artifactServices`의 어떤 `key`와도 안 맞으면** `hub.service.ts`의
`findByKeyOrThrow()`가 예외를 던진다(조용히 넘어가지 않는다) — 이건 "버전이 안 보인다"가
아니라 slide 자체가 에러/빈 화면으로 깨지는 쪽에 가깝다. 반대로 **`baseUrl`이 비어있거나
`transport`가 `'http'`가 아니면** 예외 없이 그냥 빈 결과가 조용히 내려온다 — 이쪽이
사용자가 말한 "버전이 그냥 안 보인다"는 증상에 더 가깝다.

**지금 문제되는 서비스는 Calypso가 아니라 Hub 레지스트리에 등록된 별도 외부 서비스다**
(확인됨) — 그러니 위 경로가 정확히 맞는 대상이다. (참고로 Calypso는 이 경로를 안 탄다 —
Hub 레지스트리에 없고 별도의 `CalypsoClientService`가 직접 호출한다. §1.5는 혹시 나중에
Calypso 쪽에서도 비슷한 증상이 생기면 참고하라고 남겨둔 것뿐, 이번 건과는 무관하다.)

### 1.2 실제 문서를 찍어서 확인한다 (추측 금지)

문제가 되는 artifact를 찾는다 — project/workflow 이름, block 이름, 또는 `serviceKey`로
검색한다. 찾으면 **그 문서 전체를 그대로 로그에 남긴다**(민감정보 있으면 마스킹은 하되
구조는 남긴다):

```js
const art = await db.collection('artifacts').findOne({ /* 이름 또는 externalArtifactId로 */ });
console.log(JSON.stringify(art, null, 2));
```

확인할 것:

- `art.tier === 'A'`가 맞는가 (아니면 애초에 Live 경로 대상이 아니다)
- `art.serviceKey`가 정확히 어떤 문자열인가 — 대소문자/공백/오타 없는지
- `art.externalArtifactId`가 비어있지 않은가

### 1.3 매칭되는 Hub 서비스 등록 문서를 찍는다

```js
const svc = await db.collection('artifactservices').findOne({ key: art.serviceKey });
console.log(JSON.stringify(svc, null, 2));
```

- `svc`가 **아예 없으면** → 이게 원인이다. `artifacts.serviceKey`가 가리키는 서비스가
  Hub 레지스트리에서 사라졌거나(예: 1차 마이그레이션 때 키 이름이 바뀌었거나) 애초에
  등록된 적이 없다는 뜻. **다른 비슷한 이름의 서비스가 있는지** `db.collection('artifactservices').find({}).toArray()`로
  전체 목록을 찍어서 비교한다 — 오타/케이스 차이로 안 맞는 경우가 많다.
- `svc.enabled !== true` → 비활성화돼 있다.
- `svc.transport !== 'http'` → B/C/D용 설정이 A tier 서비스에 잘못 들어가 있을 수 있다.
- `svc.baseUrl`이 비어있다 → 실연동 주소가 없다.

### 1.4 실제로 그 서비스를 호출해본다

`svc.baseUrl`이 있다면, Observer 계약의 `current-version` 엔드포인트를 **직접 curl로
호출**해서 그 서비스 자체가 응답하는지도 확인한다(SIREN DB 문제가 아니라 그 서비스 쪽
문제일 수도 있다 — 이 경우는 DB로 고칠 수 없으니 그대로 보고만 한다):

```bash
curl -s "$BASE_URL/artifacts/$EXTERNAL_ARTIFACT_ID/current-version?knoxId=<본인 knoxId>"
```

### 1.5 Calypso인 경우

`art.serviceKey === 'calypso'`라면 Hub 레지스트리가 아니라 `calypso/.env`의
`PUBLIC_BASE_URL`/`CALYPSO_API_URL`(SIREN api 쪽 env 이름은
`api/src/config/configuration.ts`에서 확인) 설정과, Calypso 쪽 `artifacts` 컬렉션에
`art.externalArtifactId`에 해당하는 문서가 실제로 존재하는지를 확인한다. 이쪽은 SIREN
DB가 아니라 **Calypso 자체 DB**를 봐야 한다 — Calypso도 별도 MongoDB를 쓴다면 그
연결 문자열은 `calypso/.env`에서 가져온다(SIREN과 동일한 AES 복호화 방식).

### 1.6 원인을 확정한 뒤에만 고친다

- `artifacts.serviceKey`가 오타/구버전 키라서 안 맞는 것이 원인이라면 → **dry-run으로
  몇 건이 영향받는지 먼저 출력**하고, 올바른 키로 바꾸는 안을 보고서에 적은 뒤 `--apply`.
- `artifactServices` 등록 자체가 누락/비활성이라서 원인이라면 → 그 문서를 되살리거나
  `enabled: true`로 바꾸는 안을 보고서에 적은 뒤 `--apply`. **`baseUrl`을 모르면 지어내지
  말고 사람에게 물어본다** — 잘못된 주소를 넣으면 조용히 실패하는 게 더 나쁘다.
- 그 서비스 자체가 응답하지 않는 것(§1.4)이 원인이라면 → **DB로 고칠 수 있는 문제가
  아니다.** 그 사실을 그대로 보고하고 끝낸다.

**`tier` 값 자체는 건드리지 않는다.** Tier A + Calypso는 설계상 정상 조합이다
(`docs/04-artifact-and-publish.md` §2). "Tier가 이상해서 안 보인다"는 가설은 이미
배제된 상태로 시작한다.

---

## 2부 — 옛 스키마 leftover 필드 감사 (audit)

1차 마이그레이션(`db-migration-v3.md`)이 스키마를 바꿨지만, **DB에 실제로 들어있는
문서에 옛 필드가 그대로 남아있을 수 있다**(Mongoose는 스키마에 없는 필드가 있어도 읽기
전에는 에러를 내지 않는다 — 조용히 방치되기 쉽다). 아래 컬렉션에 대해 **실제 문서의
필드 집합**과 **현재 스키마 파일에 정의된 `@Prop` 필드 집합**을 비교한다.

### 2.1 방법

각 컬렉션에서 문서를 전수(또는 샘플 수백 건) 스캔해 **모든 필드 키의 합집합**을 구하고,
그 스키마 파일에 `@Prop`으로 선언된 필드 목록과 대조한다. `_id`, `createdAt`, `updatedAt`,
`__v`는 당연히 제외한다.

```js
async function fieldUnion(collection) {
  const keys = new Set();
  const cursor = db.collection(collection).find({});
  for await (const doc of cursor) {
    for (const k of Object.keys(doc)) keys.add(k);
  }
  return keys;
}
```

### 2.2 대상 컬렉션과 그 스키마 파일

| 컬렉션(실제 이름은 §4처럼 먼저 확인) | 스키마 파일 |
|---|---|
| `artifacts` | `api/src/artifacts/schemas/artifact.schema.ts` |
| `blocks` | `api/src/blocks/schemas/block.schema.ts` |
| `workflows` | `api/src/workflows/schemas/workflow.schema.ts` |
| `projects` | `api/src/projects/schemas/project.schema.ts` |
| `releases` | `api/src/releases/schemas/release.schema.ts` |
| `artifactservices` | `api/src/hub/schemas/artifact-service.schema.ts` |

### 2.3 흔히 남아있을 만한 옛 필드 (참고용 — 이 목록만 믿지 말고 실제로 비교할 것)

`db-migration-v3.md` §6를 보면 다음 필드들이 새 스키마로 **이름이 바뀌거나 위치가
옮겨진 것들**이다. 옛 이름이 그대로 남아있다면 leftover다:

- `isReleased` (→ `isPublished`로 개명됨. `versions[]` 안에 남아있을 수 있다)
- `owners[]`, `viewGrants[]` (→ `ownerKnoxId` + `editAccess`/`viewAccess`로 재구성됨)
- `domain` (→ `department`로 개명됨)
- `recvDept`, `sourceDept`, `sourceContact` (→ `recipients`/`viewAccess`로 흡수됨)
- `docType`, `artifactKey` (v3 이전부터 이미 폐기 예정이던 필드 — `AddBlockDialog.tsx`
  주석 참고)
- `externalUrl`이 아닌 옛 이름의 유사 필드가 있는지

### 2.4 보고 형식 — 삭제는 이 보고 다음에만

```
[컬렉션명]
  스키마에 없는 필드: fieldA (123건), fieldB (4건), ...
  각 필드가 코드 어디에서도 안 읽힌다는 것을 grep으로 확인했는지: yes/no
```

**코드에서 여전히 읽고 있는 필드는 절대 지우지 않는다** — 스키마 파일에 `@Prop`으로
선언 안 됐다고 해서 코드가 안 쓰는 건 아니다(예: raw 쿼리나 다른 서비스가 참조할 수
있다). `grep -rn "필드명" api/src`로 실제 참조가 있는지 먼저 확인하고, **없는 것만**
삭제 후보로 올린다.

### 2.5 삭제 실행

삭제 후보 목록을 보고한 뒤, 사람이 확인했다는 전제로 `$unset`한다. dry-run 먼저:

```js
// dry-run: 몇 건이 영향받는지만 센다
const count = await db.collection('artifacts').countDocuments({ oldFieldName: { $exists: true } });

// --apply일 때만
await db.collection('artifacts').updateMany({ oldFieldName: { $exists: true } }, { $unset: { oldFieldName: '' } });
```

---

## 3. 끝나고 검증

```
[ ] 문제였던 "Service A" 산출물의 serviceKey가 artifactservices의 실제 key와 일치한다
[ ] 그 artifactservices 문서가 enabled:true, transport:'http', baseUrl이 비어있지 않다
    (또는 §1.4에서 "서비스 자체 문제"로 결론 내고 그렇게 보고했다)
[ ] 2부에서 삭제한 필드는 전부 사전에 grep으로 "코드에서 안 읽는다"를 확인한 것들뿐이다
[ ] tier 값은 어떤 문서도 건드리지 않았다
```

## 4. 마무리 — 반드시 실행할 것

```bash
cd <SIREN 저장소 루트>
git status
git diff
```

**둘 다 완전히 비어 있어야 한다.** 출력을 보고서에 그대로 붙인다. 무언가 남아 있다면
`git checkout -- <path>`로 되돌리고 왜 생겼는지 설명한다. 어떤 경우에도 `git add` /
`git commit`으로 정리하지 않는다.

---

## 5. 하지 말 것 (요약)

- **SIREN 저장소의 파일을 만들거나 고치거나 지우지 말 것.**
- **`git add` / `git commit` / `git push`를 실행하지 말 것.**
- "Tier가 이상하다"는 가설로 `tier` 값을 고치지 말 것 — Tier A + Calypso는 정상이다.
- `artifactServices.baseUrl`을 모르는데 지어내서 채우지 말 것 — 모르면 사람에게 물어본다.
- 스키마에 없다고 코드 참조 확인 없이 필드를 지우지 말 것.
- 보고 없이 곧장 `--apply`하지 말 것 — dry-run과 진단 결과를 먼저 보여준다.
