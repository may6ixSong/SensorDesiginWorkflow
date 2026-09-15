# RPM 연동 갱신 + mock/dev DB 정리 — 데스크톱 세션용 실행 프롬프트

> 이 문서는 **SIREN·Calypso 저장소 밖에서 수행해야 하는 작업**을 다른 세션(사용자의 데스크톱
> Claude Code)에 그대로 붙여넣기 위한 것이다. SIREN이 허브로서 전면 재설계되면서(docs/07-
> hub-operations.md), 외부에서 SIREN에 연동된 유일한 실서비스인 RPM의 코드와, 별도로 쌓여 있는
> mock/dev DB 데이터를 새 계약에 맞게 고쳐야 한다.

아래 프롬프트를 그대로 데스크톱 세션에 붙여넣으면 된다. **RPM 로컬 저장소 경로**만 붙여넣기
전에 채워 넣을 것 (`<RPM_REPO_PATH>` 표시된 자리).

---

## 여기부터 데스크톱 세션에 붙여넣을 프롬프트

너는 지금부터 두 가지 작업을 한다 — (A) RPM 저장소 코드를 SIREN의 바뀐 Observer 계약에 맞게
갱신하고, (B) mock/dev MongoDB에 남아 있는 옛 스키마 데이터를 정리한다.

### 절대 원칙 (세 가지, 예외 없음)

1. **SIREN 저장소(SensorDesiginWorkflow)의 코드는 어떤 파일도 수정하지 않는다.** 읽는 것도
   참고용으로만 하고, 쓰기·수정·삭제는 전혀 하지 않는다.
2. **어떤 저장소에도 git commit을 하지 않는다.** RPM 저장소를 포함해서다 — 코드는 고치되,
   커밋은 사람이 직접 검토하고 하게 남겨둔다. `git add`도 하지 않는다.
3. **DB 데이터 수정을 위해 스크립트가 필요하면, 만들어서 한 번 실행하고 그 자리에서 바로
   삭제한다.** 저장소에 마이그레이션 스크립트를 남겨두지 않는다.

RPM 로컬 저장소 경로: `<RPM_REPO_PATH>`

---

### A. RPM의 Observer 계약 구현 갱신

SIREN은 RPM을 "OA Service"(Tier A)로 연동한 유일한 실서비스다. 계약이 두 군데 바뀌었다.

#### A-1. 후보 목록 조회 — project 사전 링크 폐지

**이전**: SIREN이 먼저 `GET /projects/search?code=&revision=`로 project 후보를 받아 사람이
하나를 확정하고(`externalProjectId`), 그 값으로 `GET /artifacts?projectId=&knoxId=&isAdmin=`를
불렀다.

**지금**: project 사전 링크 단계 자체가 없다. SIREN은 "새 Artifact 추가" 다이얼로그를 열 때마다
아래를 **매번 실시간으로** 호출한다:

```
GET /artifacts?code={code}&revision={revision}&knoxId={knoxId}&isAdmin={true|false}
```

- `GET /projects/search`는 SIREN이 더 이상 호출하지 않는다 — 지워도 되고 남겨둬도 상관없다
  (호출자가 없을 뿐).
- **code+revision이 RPM 안에서 유일하지 않을 수 있다면(예: production run과 internal test가
  같은 code/revision을 쓰는 경우), 해당하는 모든 후보를 한꺼번에 돌려주면 된다.** SIREN은 그
  응답을 그대로 믿고 사람이 후보 중 하나를 고르게 할 뿐, RPM 쪽에서 하나로 좁혀줄 필요는 없다.
- 응답 모양(ArtifactSummary 배열)은 안 바뀌었다 — `artifactId`/`name`/`department`/
  `currentVersion`.

#### A-2. `externalArtifactId`는 이제 project를 넘나들어 전역으로 유일해야 한다

`access`/`current-version`/`versions`/`html-view` 엔드포인트 자체의 요청/응답 모양은 그대로다
(`artifactId` path param 하나로 충분 — project 파라미터를 추가하지 않았다). 대신 전제가 하나
새로 생겼다:

> **`externalArtifactId`가 RPM 전체에서(어느 project 소속이든) 유일해야 한다.** SIREN은 이제
> project 식별 없이 이 id 하나만으로 산출물을 찾는다 — 한 project 안에서만 유일하고 다른
> project와 겹치는 채번 방식(예: project마다 1번부터 다시 매기는 auto-increment)을 쓰고
> 있다면, 전역 유일 체계로 바꿔야 한다(예: UUID, 또는 project 식별자를 접두어로 포함).

#### A-3. 신규 — version 발행 시 SIREN에 push 이벤트를 보낸다

지금까지는 SIREN이 필요할 때마다 RPM에 물어보는 pull 방식뿐이었는데, 이제 RPM이 **버전이
발행/갱신될 때마다 먼저 SIREN에 알려준다.** (SIREN은 이걸 받아서 자기 DB에 캐시해 두고,
매번 라이브로 안 물어봐도 되게 한다 — 못 받으면 나중에 주기적으로 다시 pull하는 안전망도
있으니, 이 이벤트 전송이 100% 신뢰성 있게 가야 하는 건 아니다.)

```
POST {SIREN_API_BASE}/hub/events/version-published
Authorization: Bearer <RPM에 발급된 토큰>
Content-Type: application/json
```

토큰과 `artifactTypeKey`는 SIREN의 Service Manage 화면(OA Service 등록)에서 RPM을 등록할 때
발급된다 — **이 값들을 모르면 작업을 진행하지 말고 사용자에게 물어봐라.** (SIREN 쪽에서
"Service명: RPM, Artifact명: <RPM이 내는 산출물 종류>, BaseURL: RPM의 API 베이스"로 등록하면
토큰과 artifactTypeKey를 화면에서 그대로 보여준다.)

요청 바디는 아래 TypeScript 인터페이스를 **정확히** 따라야 한다 — 이 모양을 조금이라도
벗어나면(필수 필드 누락, 타입 불일치, 정의 안 된 필드 포함) SIREN이 요청 전체를 400으로
거부한다. 일부만 기록되는 부분 반영은 없다.

```ts
interface VersionPublishedEvent {
  /** Service Manage에서 SIREN이 발급한 값 — 어떤 종류의 산출물인지 */
  artifactTypeKey: string;

  /** RPM 안에서 이 산출물 인스턴스를 가리키는 값 — RPM 전체에서 유일해야 한다(A-2 참고) */
  externalArtifactId: string;

  /** 화면 표시용 이름. 보낼 때마다 SIREN의 캐시된 이름을 이 값으로 갱신한다 */
  artifactName: string;

  /** 이 버전 엔트리를 마지막으로 갱신한 사람의 knox id */
  updatedUserId: string;

  /** 이 버전 엔트리가 RPM에서 마지막으로 갱신된 시각 (ISO 8601) */
  updatedAt: string;

  /**
   * 표시용이자 사실상의 불변 참조다 — **같은 externalArtifactId 안에서 이 값을 절대
   * 재사용하면 안 된다.** RPM의 release 버전들 + `latest+`(작업중 snapshot 자리표시자,
   * 아직 SIREN 문서에 있는 RPM 특유의 규칙 그대로) 둘 다 이 이벤트로 보낸다.
   */
  versionLabel: string;

  /** 그 산출물을 받는(view 권한) 사람이 볼 수 있는 버전인지 — RPM의 release 확정 여부와 같다. `latest+`는 항상 false다 */
  isPublished: boolean;

  /** RPM의 산출물 상세 페이지 링크. 없으면 null */
  viewUrl: string | null;

  /** RPM은 Tier A(OA Service)이므로 이 필드는 항상 null이다 (HPC Service 전용 필드) */
  path: null;
}
```

- 응답: `{ recorded: boolean }`. `recorded:false`면 그 산출물이 아직 SIREN의 어느 workflow에도
  매핑된 적이 없다는 뜻이다 — 정상이다, 재시도할 필요 없다(나중에 누가 매핑하면 SIREN이 그
  순간 RPM에 전체 이력을 다시 물어봐서 채운다).
- 실패해도 RPM 자신의 publish 동작을 막지 말 것 — 로그만 남기고 계속 진행한다(best-effort).
- `latest+`(작업중 snapshot)를 포함해 **버전이 갱신될 때마다** 쏜다 — official release만
  쏘는 게 아니다.

---

### B. mock/dev MongoDB 정리

SIREN 스키마가 바뀌면서 다음이 더 이상 유효하지 않다:

- `projectServiceLinks` 컬렉션 — project를 code+revision으로 미리 링크해 두던 것. 이제 안 쓴다.
- `hpcPathMocks` 컬렉션 — HPC Service가 "항상 잠김"이던 시절의 미리보기 전용 mock. HPC망
  양방향 연동이 확정되면서 이제 안 쓴다.
- `artifacts` 컬렉션의 `editAccess`/`viewAccess` 필드 — tier A/B/C 문서에서는 더 이상 읽지
  않는다(D tier만 아직 씀). 남아 있어도 무해하지만(안 읽으니까), 깨끗이 정리하고 싶다면 tier가
  A/B/C인 문서에서 이 두 필드를 지워도 안전하다.

**"목업 DB"라고 해서 SIREN 저장소 안의 `api/src/database/seed-data.ts`를 고치라는 뜻이
아니다 — 그건 SIREN 코드라 원칙 1에 걸려 손대면 안 된다.** 여기서 말하는 건 실제로 어딘가에
떠 있는(사내 공유 dev/staging) MongoDB 인스턴스에 이미 들어가 있는 문서들이다. 접속 정보를
모르면 진행하지 말고 사용자에게 물어봐라.

절차:
1. 그 DB에 접속해서 `projectServiceLinks`, `hpcPathMocks` 컬렉션이 있는지 확인한다.
2. 있으면 드롭하거나(운영 데이터가 전혀 없는 순수 mock/dev 환경이 확실할 때) 또는 문서
   개수·내용을 사용자에게 먼저 보여주고 확인받은 뒤 지운다 — 뭐가 들어있는지도 모르고 바로
   지우지 말 것.
3. `artifacts` 컬렉션에서 tier가 `A`/`B`/`C`인 문서 중 `editAccess`/`viewAccess`가 비어있지
   않은 게 있으면, 원한다면 그 두 필드를 unset하는 스크립트를 짧게 작성해 실행한다.
4. **스크립트 파일을 만들었다면, 실행이 끝나는 즉시 그 파일을 삭제한다.** (`node script.js`
   실행 후 `rm script.js` 같은 식으로.)
5. 작업 후 무엇을 지웠는지/바꿨는지 요약해서 사용자에게 보고한다 — 되돌릴 수 없는 작업이니
   실행 전에 그 DB가 정말 mock/dev용이 맞는지(운영 DB가 아닌지) 한 번 더 확인할 것.

---

### 확인 후 진행

RPM 저장소 경로, SIREN이 RPM에 발급한 토큰/artifactTypeKey, 그리고 mock/dev DB 접속 정보
셋 중 하나라도 모르면 코드를 고치기 전에 먼저 사용자에게 물어봐라. 다 끝나면 A/B 각각
무엇을 바꿨는지(RPM 쪽 diff 요약, DB에서 지운/바꾼 것) 정리해서 보고하고, **아무것도
커밋하지 않았다는 것**을 마지막에 다시 확인해줘.
