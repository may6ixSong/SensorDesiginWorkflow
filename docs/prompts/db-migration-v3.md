# 프롬프트 — SIREN v3 DB 마이그레이션 스크립트 작성

> **이 파일은 그대로 복사해서 desktop Claude Code에 붙여넣는 용도다.**
> SIREN 저장소(`api/`)에서 실행하며, 실제 MongoDB를 v3 스키마로 옮기는 **일회성 CLI 스크립트**를
> 만드는 것이 목표다. 코드 구현은 이미 끝나 있고, 남은 것은 기존 데이터를 새 모양으로 옮기는 일뿐이다.
>
> 인메모리 모드(`DB_CONNECTION` / `AES_KEY` 미설정)에서는 시드가 이미 새 스키마로 다시 만들어지므로
> 이 작업이 필요 없다. **실제 DB를 쓰는 환경에서만** 쓴다.

---

## 배경 — 무엇이 바뀌었나

v3에서 데이터 모델이 다음과 같이 바뀌었다.

1. **HLD 개념 전면 폐기.** `hldReleases` 컬렉션과 관련 필드가 사라지고, 그 자리에 완전히 다른
   의미의 `releases`(workflow → 부서 전달 기록)가 들어왔다. **두 개는 서로 옮길 수 있는 관계가
   아니다** — 옛 데이터를 새 컬렉션으로 변환하지 말고 버린다.
2. **`deliverables` → `blocks` + `artifacts`.** "캔버스 위의 자리"와 "산출물 실체"를 분리했다.
   같은 산출물이 여러 workflow의 캔버스에 놓여도 버전 이력과 권한은 하나다.
3. **권한 모델이 `AccessGrant { departments[], users[] }` 한 모양으로 통일**되었다.
   `owners[]`, `viewGrants[]` 같은 옛 모양은 전부 여기로 접힌다.
4. **용어 분리:** 산출물이 자기 서비스에서 공식 버전을 확정하는 것이 **publish**,
   workflow가 부서에 전달하는 것이 **release**다. `isReleased` → `isPublished`.
5. **A Tier의 recipient는 artifact가 아니라 block에 붙는다** — 같은 artifact라도 workflow마다
   받는 부서가 다를 수 있기 때문이다.

목표 스키마의 정본은 코드다. 반드시 아래 파일들을 먼저 읽고 시작할 것:

```
api/src/common/schemas/access-grant.schema.ts
api/src/blocks/schemas/block.schema.ts
api/src/artifacts/schemas/artifact.schema.ts
api/src/workflows/schemas/workflow.schema.ts
api/src/releases/schemas/release.schema.ts
api/src/projects/schemas/project.schema.ts
```

설계 배경은 `docs/02-data-model.md`, `docs/04-artifact-and-publish.md`,
`docs/06-ui-motion-and-migration.md` §4에 있다.

---

## 만들 것

`api/src/database/migrations/v3-split-deliverables.ts` (파일명은 조정 가능) 에
`npm run migrate:v3` 로 실행되는 CLI 스크립트를 만든다.

### 필수 요건

- **멱등해야 한다.** 두 번 돌려도 결과가 같아야 하고, 이미 옮겨진 문서를 다시 쪼개면 안 된다.
  (예: `blocks` 컬렉션이 이미 있고 원본 `deliverables._id`가 이미 소비되었는지로 판정)
- **`--dry-run` 을 지원한다.** 아무것도 쓰지 않고 "무엇을 몇 건 바꿀 것인지"만 출력한다.
  기본값은 dry-run이고, 실제 쓰기는 `--apply` 를 줘야 한다.
- 실행 결과를 표준출력에 요약한다 — 컬렉션별 처리 건수, 스킵 건수, **실패 목록(문서 _id와 사유)**.
- 실패한 문서 하나 때문에 전체가 멈추지 않는다. 모아서 마지막에 보고한다.
- 마이그레이션 전에 `deliverables`, `workflows`, `projects` 를 각각
  `<name>_backup_v3` 로 복제해 둔다(이미 있으면 건너뛰고 경고).

---

## 변환 규칙

### 1. 폐기 (drop)

| 컬렉션 | 처리 |
|---|---|
| `hldReleases` | **drop.** 새 `releases` 로 옮기지 않는다 |
| `hubSyncCheckpoints` | drop |

### 2. `projects`

| 필드 | 처리 |
|---|---|
| `code`, `revision` | 그대로. **다만 `revision` 이 `REVISION_RE`(`api/src/common/constants/revision.ts`)에 안 맞으면 `EVT0` 으로 정규화하고 그 사실을 로그에 남긴다** |
| `departments` | 없으면 `[]`. 값이 있으면 trim + 중복 제거 |
| `members[].departments` | `projects.departments` 에 없는 값이 있으면 그 부서를 `projects.departments` 에 추가한다(사람 쪽을 지우지 않는다) |

`(code, revision)` 유니크 인덱스가 새로 걸린다. **중복이 있으면 마이그레이션을 중단하고
중복 쌍을 전부 출력한다** — 자동으로 하나를 고르지 말 것. 사람이 판단할 문제다.

### 3. `workflows`

| 기존 | 새 필드 | 규칙 |
|---|---|---|
| `domain` | `department` | 값 복사. 비어 있으면 생성자(`createdBy`)의 부서 → 그것도 없으면 그 project의 `departments[0]` → 그것도 없으면 실패 목록에 넣고 스킵 |
| `owners[]` | `ownerKnoxId` + `editAccess.users` | `owners[0]` 을 `ownerKnoxId` 로, 나머지는 `editAccess.users` 로 |
| `viewGrants[]` | `viewAccess.users` | `knoxId` 만 가져온다. 항목의 `department` 는 버린다 |
| — | `editAccess.departments` | **반드시 `[department]` 를 포함**한다. 이건 나중에도 삭제 불가인 항목이다 |
| — | `releaseSeq` | `0` |
| — | `canvasLock` | `null` |
| — | `phaseWidths` | 없으면 `{}` |

`department` 가 그 project의 `departments` 에 없으면, **project 쪽에 그 부서를 추가**한다
(workflow를 고아로 만들지 않는다).

### 4. `deliverables` → `blocks` + `artifacts`

이 부분이 핵심이다. 문서 하나가 둘로 쪼개진다.

```
그룹핑:
  같은 project 안에서 같은 (serviceKey, externalArtifactId) 를 가진 deliverable 문서들
    → artifacts 1건으로 합친다
      · versions 는 최신순으로 병합하고 중복 versionRef 는 제거한다
      · name / tier / network 는 가장 최근 문서의 값을 쓴다
      · tier 는 versions[0].tier 를 캐시한 값이어야 한다(불일치하면 versions[0] 기준으로 고친다)
    → 그 그룹의 각 deliverable 은 artifactId 가 그 artifact 를 가리키는 blocks 1건이 된다

  serviceKey 가 null 이고 externalUrl / sourceDept / sourceContact 도 없는 문서
    → artifact 를 만들지 않는다. artifactId: null 인 blocks 만 남긴다
      (= "자리는 잡았으나 출처 미지정" 이라는 정상 상태다)

  serviceKey 는 없고 sourceDept / sourceContact 만 있는 문서 (구 D 티어)
    → artifacts 1건을 tier 'D' 로 만들고 이름을 그대로 쓴다. 그룹핑하지 않는다(문서 1:1)
```

**Block 으로 가는 값:** `projectId`, `workflowId`, `phaseId`, `name`,
`layout{x,y,w,h}`, `series`, `seriesIdx`, `seriesTotal`, `createdBy`, `isMock`.
`intent` 는 전부 `'own'` 으로 둔다.

**Artifact 로 가는 값:** `projectId`, `name`, `tier`, `network`, `serviceKey`,
`externalArtifactId`, `artifactTypeKey`, `externalUrl`, `versions[]`, `createdBy`, `isMock`.

**버전 필드:** `versions[].isReleased` → `versions[].isPublished` 로 이름만 바꾼다.
값은 그대로다. `isReleased` 필드는 `$unset` 한다.

### 5. 권한 초기값

```
A Tier artifact 가 매핑된 block
  → block.recipients.viewAccess.departments = 구 recvDept 가 있으면 [recvDept], 없으면 []
  → block.recipients.editAccess = { departments: [], users: [] }
  → artifact.editAccess / viewAccess 는 **비워 둔다** (A는 서비스가 권한을 판정한다)

B / C / D artifact
  → artifact.viewAccess.departments = 구 recvDept 가 있으면 [recvDept], 없으면 []
  → artifact.editAccess.departments = 그 블록이 있던 workflow 의 department
     (여러 workflow 에 걸쳐 있으면 그 department 들의 합집합)
  → block.recipients 는 비워 둔다
```

> **주의:** 같은 artifact 가 여러 workflow 에 있으면 `viewAccess` 는 **합집합**이다.
> 권한을 좁히는 방향으로 병합하면 기존에 보이던 사람이 못 보게 되어 사고가 난다.

### 6. `edges` / `memos`

`deliverableId` 를 가리키던 참조가 있으면 새 `blocks._id` 로 갱신한다.
(원본 `deliverables._id` → 새 `blocks._id` 매핑 표를 만들어 두고 쓴다. 실제로 `_id` 를
그대로 재사용하면 이 단계가 통째로 없어지므로 **가능하면 block 의 `_id` 를 원본
`deliverables._id` 로 유지할 것** — 그러면 edges/memos 는 손댈 필요가 없다.)

### 7. 인덱스

마이그레이션 마지막에 새 인덱스를 만든다. 이름은 스키마 파일 하단에 정의되어 있다:

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

옛 인덱스(`deliverables.*`, `hldReleases.*`) 는 컬렉션과 함께 사라진다.

---

## 끝나고 확인할 것

스크립트가 스스로 검증하고 결과를 출력하게 한다:

```
[ ] deliverables 문서 수 == blocks 문서 수
[ ] artifactId 가 null 이 아닌 모든 block 에 대해, 그 artifact 가 존재하고
    artifact.projectId === block.projectId   ← 위반이 1건이라도 있으면 실패로 보고
[ ] 모든 workflow 에서 editAccess.departments.includes(department) === true
[ ] 모든 workflow 의 ownerKnoxId 가 비어 있지 않다
[ ] isReleased 필드가 남아 있는 문서가 0건이다
[ ] hldReleases / hubSyncCheckpoints / deliverables 컬렉션이 존재하지 않는다
```

마지막으로 `npm run build && npm run test` 가 통과하는지 확인하고, API를 실제 DB에 붙여
아래를 눈으로 확인한다.

```
GET /api/v1/projects                       → 내가 member 인 과제만 나온다
GET /api/v1/projects/:id/workflows         → 각 workflow 에 myAccess 가 붙어 온다
GET /api/v1/workflows/:id/blocks           → 블록마다 artifact 가 채워지거나 null 이다
```

---

## 하지 말 것

- **`hldReleases` 를 `releases` 로 변환하지 말 것.** 의미가 다르다. 버린다.
- **권한을 좁히는 방향으로 병합하지 말 것.** 병합은 항상 합집합이다.
- **`(code, revision)` 중복을 자동으로 해소하지 말 것.** 중단하고 사람에게 보고한다.
- **부서 문자열을 임의로 정규화하지 말 것**(대소문자 변환·공백 제거 이상은 금지).
  부서명은 과제마다 자유 입력이라 자동 매칭이 오히려 데이터를 망친다.
