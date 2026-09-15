# RPM 연동 갱신 + mock/dev DB 정리 + Calypso 토큰 운영 반영 — 데스크톱 세션용 실행 프롬프트

> 이 문서는 **SIREN·Calypso 저장소 밖에서 수행해야 하는 작업**을 다른 세션(사용자의 데스크톱
> Claude Code)에 그대로 붙여넣기 위한 것이다. SIREN이 허브로서 전면 재설계되면서(docs/07-
> hub-operations.md, PR #19로 main에 병합 완료), 세 가지가 필요하다 — (A) 외부에서 SIREN에
> 연동된 유일한 실서비스인 RPM의 코드를 새 계약에 맞게 갱신, (B) 별도로 쌓여 있는 mock/dev
> DB의 옛 스키마 데이터 정리, (C) Calypso의 event 토큰을 실제 운영 DB/배포에 반영.
>
> (이전 버전 `rpm-and-mockdb-hub-v4-prompt.md`에 C를 추가하고 A/B 문구를 최신 상태로
> 다듬은 것이다 — v4는 이 파일로 대체된다.)

아래 프롬프트를 그대로 데스크톱 세션에 붙여넣으면 된다.
- **RPM 로컬 저장소 경로**: `D:\DPI\RPM`
- 이번 작업이 **실제 운영(production) SIREN DB / Calypso 배포**를 건드리는 작업(C)을
  포함한다는 점을 알고 있을 것 — 접속 정보를 세션이 모르면 진행 전에 물어보게 되어 있다.

---

## 여기부터 데스크톱 세션에 붙여넣을 프롬프트

너는 지금부터 세 가지 작업을 한다 — (A) RPM 저장소 코드를 SIREN의 바뀐 Observer 계약에
맞게 갱신, (B) mock/dev MongoDB에 남아 있는 옛 스키마 데이터 정리, (C) Calypso의
event 토큰을 실제 운영 DB와 실제 Calypso 배포 설정에 반영.

### 절대 원칙 (네 가지, 예외 없음)

1. **SIREN 저장소(SensorDesiginWorkflow)의 코드는 어떤 파일도 수정하지 않는다.** 읽는 것도
   참고용으로만 하고, 쓰기·수정·삭제는 전혀 하지 않는다.
2. **어떤 저장소에도 git commit을 하지 않는다.** RPM 저장소를 포함해서다 — 코드는 고치되,
   커밋은 사람이 직접 검토하고 하게 남겨둔다. `git add`도 하지 않는다.
3. **DB 데이터 수정을 위해 스크립트가 필요하면, 만들어서 한 번 실행하고 그 자리에서 바로
   삭제한다.** 저장소에 마이그레이션 스크립트를 남겨두지 않는다.
4. **(C)는 실제 운영 데이터를 건드리는 작업이다.** 접속 정보·배포 접근 권한 중 하나라도
   모르면 진행하지 말고 사용자에게 먼저 물어봐라. 되돌리기 어려운 작업이니, DB에 쓰기
   전에 무엇을 쓸 것인지 사용자에게 먼저 보여주고 진행해도 되는지 확인받아라.

RPM 로컬 저장소 경로: `D:\DPI\RPM`

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
토큰과 artifactTypeKey를 화면에서 그대로 보여준다. RPM은 이번 재설계 전에는 이런 토큰 발급
개념 자체가 없었으므로, **사용자가 Service Manage에서 RPM을 이 화면으로 새로 등록해서 토큰을
발급받아 너에게 전달해야 한다** — 기존에 RPM용으로 등록되어 있던 문서가 있었더라도 그 문서엔
토큰이 없다.)

요청 바디는 아래 TypeScript 인터페이스를 **정확히** 따라야 한다 — 이 모양을 조금이라도
벗어나면(필수 필드 누락, 타입 불일치, 정의 안 된 필드 포함) SIREN이 요청 전체를 400으로
거부한다. 일부만 기록되는 부분 반영은 없다.

★ **RPM 코드를 이전에(이 문서의 예전 버전으로) 이미 고쳤다면 다시 확인해라 — `artifactName`
필드가 빠졌다.** 예전엔 있었는데, 그 필드가 있으면 SIREN 쪽 admin이 "새 Artifact 추가"
다이얼로그에서 직접 지정한 이름이 RPM이 보내는 이름으로 매 이벤트마다 영구히 덮어써지는
문제가 있어서 아예 뺐다(07장 §4.1). **RPM이 아직도 요청 바디에 `artifactName`을 실어 보내고
있다면, SIREN이 이제 그 요청을 400으로 거부한다** — `whitelist:true`라 정의 안 된 필드가
섞이면 통째로 거부되기 때문이다. RPM 코드에서 이 필드를 완전히 빼야 한다.

```ts
interface VersionPublishedEvent {
  /** Service Manage에서 SIREN이 발급한 값 — 어떤 종류의 산출물인지 */
  artifactTypeKey: string;

  /** RPM 안에서 이 산출물 인스턴스를 가리키는 값 — RPM 전체에서 유일해야 한다(A-2 참고) */
  externalArtifactId: string;

  /** 이 버전 엔트리를 마지막으로 갱신한 사람의 knox id */
  updatedUserId: string;

  /** 이 버전 엔트리가 RPM에서 마지막으로 갱신된 시각 (ISO 8601) */
  updatedAt: string;

  /**
   * 표시용이자 사실상의 불변 참조다 — **같은 externalArtifactId 안에서 이 값을 절대
   * 재사용하면 안 된다.** RPM의 release 버전들 + 작업중 snapshot(있다면) 둘 다 이
   * 이벤트로 보낸다. 작업중 snapshot의 이름에는 정해진 관례가 없다 — 예전엔 `latest+`를
   * 쓰도록 권했지만 그 관례는 없앴다. 아무 문자열이나 써도 되고, `isPublished:false`만
   * 지키면 된다.
   */
  versionLabel: string;

  /** 그 산출물을 받는(view 권한) 사람이 볼 수 있는 버전인지 — RPM의 release 확정 여부와 같다. 작업중 snapshot은 항상 false다 */
  isPublished: boolean;

  /** RPM의 산출물 상세 페이지 링크. 없으면 null */
  viewUrl: string | null;

  /** RPM은 Tier A(OA Service)이므로 이 필드는 항상 null이다 (HPC Service 전용 필드) */
  path: null;

  /**
   * release note/update note 같은 자유 텍스트 — RPM에 그런 note가 있다면 그대로 보낸다.
   * SIREN 상세 slide의 버전 목록에서 버전별로 그대로 보여준다. 없으면 null로 보낸다.
   */
  note: string | null;
}
```

- 응답: `{ recorded: boolean }`. `recorded:false`면 그 산출물이 아직 SIREN의 어느 workflow에도
  매핑된 적이 없다는 뜻이다 — 정상이다, 재시도할 필요 없다(나중에 누가 매핑하면 SIREN이 그
  순간 RPM에 전체 이력을 다시 물어봐서 채운다).
- 실패해도 RPM 자신의 publish 동작을 막지 말 것 — 로그만 남기고 계속 진행한다(best-effort).
- 작업중 snapshot을 포함해 **버전이 갱신될 때마다** 쏜다 — official release만 쏘는 게
  아니다.

---

### B. mock/dev MongoDB 정리 — 지금 설계 전체에 맞게 다시 맞춘다

**이건 단순히 몇 개 지우는 스팟 청소가 아니다.** mock/dev DB에 이미 들어있는 데이터를 지금
설계(04/07장) 기준으로 전부 다시 맞춘다는 생각으로 진행해라 — 아래 B-1~B-3이 지금까지
파악된 구체적인 항목들이고, 훑어보다가 이 목록에 없는 것 중에서도 지금 스키마와 명백히
안 맞는 게 보이면(예: 지워진 필드가 값이 채워진 채로 남아있는 경우 등) 임의로 고치지 말고
무엇을 발견했는지 사용자에게 먼저 보고해라.

**"목업 DB"라고 해서 SIREN 저장소 안의 `api/src/database/seed-data.ts`를 고치라는 뜻이
아니다 — 그건 SIREN 코드라 원칙 1에 걸려 손대면 안 된다.** 여기서 말하는 건 실제로 어딘가에
떠 있는(사내 공유 dev/staging) MongoDB 인스턴스에 이미 들어가 있는 문서들이다. 접속 정보를
모르면 진행하지 말고 사용자에게 물어봐라.

참고할 실제 스키마(원칙 1에 걸리지 않는 **읽기**는 괜찮다): `api/src/artifacts/schemas/artifact.schema.ts`
(Artifact/ArtifactVersion), `api/src/hub/schemas/artifact-service.schema.ts`(ArtifactService).
아래 필드 이름·모양은 전부 여기서 그대로 가져온 것이지만, 실제로 쓰기 전에 그 파일을 다시
한번 열어 확인해도 좋다.

#### B-1. 폐기된 컬렉션 · 필드 정리

- `projectServiceLinks` 컬렉션 — project를 code+revision으로 미리 링크해 두던 것. 이제 안 쓴다.
- `hpcPathMocks` 컬렉션 — HPC Service가 "항상 잠김"이던 시절의 미리보기 전용 mock. HPC망
  양방향 연동이 확정되면서 이제 안 쓴다.
- `artifacts` 컬렉션의 `editAccess`/`viewAccess` 필드 — tier A/B/C 문서에서는 더 이상 읽지
  않는다(D tier만 아직 씀). 남아 있어도 무해하지만(안 읽으니까), 깨끗이 정리하고 싶다면 tier가
  A/B/C인 문서에서 이 두 필드를 지워도 안전하다.
- `artifactServices` 컬렉션의 `artifactTypes[].viewUrlTemplate`/`artifactTypes[].sampleUrl`
  필드 — 종류별 구분이 `description` 하나로 단순화되면서 더 이상 읽지 않는다(레거시 필드,
  무해하게 방치해도 되고 지워도 된다).

#### B-2. RPM/Calypso처럼 실제로 발행된 버전이 있는 A/B Tier 산출물 — 진짜 버전을 SIREN에 채워 넣는다

`artifacts` 컬렉션에서 `tier`가 `A`(RPM 등 OA Service) 또는 `B`(Calypso)이고, `serviceKey`+
`externalArtifactId`가 실제로 살아있는 서비스의 산출물을 가리키는 문서를 찾는다. 그 산출물이
그 서비스에 **실제로 발행된 버전을 갖고 있다면**, 그 버전 이력을 실제로 그 서비스에 물어봐서
(Observer 계약 `GET {baseUrl}/artifacts/{externalArtifactId}/versions` — RPM/Calypso 둘 다
이 모양이다, `docs/observer-contract-v1.yaml`의 `VersionRecord` 참고) SIREN의 `versions`
필드를 진짜 데이터로 채운다. 지금 비어있거나, 예전 설계 시절의 가짜/수동 데이터로 채워져
있다면 그것도 실제 데이터로 덮어써라.

`VersionRecord` → SIREN의 `ArtifactVersion` 서브도큐먼트 매핑(최신이 배열 앞(index 0)):

```js
{
  tier: 'A' | 'B',                    // 그 artifact 문서의 tier와 같게
  versionLabel: record.versionLabel,
  isPublished: record.isReleased,
  versionRef: record.versionRef,
  giverKnoxId: record.giver.knoxId,   // null일 수 있음 — 그대로 null
  giverDept: record.giver.dept,       // null일 수 있음 — 그대로 null
  sourceRefs: record.sourceRefs.map(r => ({
    artifactKey: r.artifactKey, serviceKey: r.serviceKey,
    versionRef: r.versionRef, versionLabel: r.versionLabel,
    capturedAt: r.capturedAt ? new Date(r.capturedAt) : null,
  })),
  viewUrl: record.viewUrl,
  hpcPath: null,
  note: '',                           // Observer 계약엔 note가 없다 — 빈 문자열
  assertedBy: null, assertedAt: null, // A/B는 수동 기록이 아니므로 항상 null
  observedAt: new Date(),             // 지금 실제로 물어본 시각
  hasHtmlView: record.hasHtmlView ?? false,
  publishedAt: record.isReleased ? new Date(record.createdAt) : null,
  createdAt: new Date(record.createdAt),
}
```

이 매핑은 SIREN 백엔드의 `HubSyncService.upsertVersionEntry()`가 하는 일과 같은 결과를
만들려는 것이다 — SIREN 코드 자체를 실행하라는 뜻은 아니고(원칙 1), 이 스크립트가 그 결과를
직접 DB에 써 넣으면 된다. 어느 artifact가 매핑 대상인지 모르겠으면 전부 하지 말고 목록을
사용자에게 먼저 보여주고 확인받아라.

#### B-3. C Tier / D Tier 산출물의 version 데이터 — 지금 설계에 안 맞으므로 삭제

`artifacts` 컬렉션에서 `tier`가 `C`(HPC Service) 또는 `D`(External/Attested)인 문서 중
`versions` 배열이 비어있지 않은 게 있으면, **그 버전 데이터는 지금 설계에 맞지 않는다 —
지워라** (`versions: []`로 비운다). C Tier는 예전 "항상 잠김" 시절 `hpcPathMocks` 기반으로
수동으로 채워졌던 미리보기용 가짜 버전이라 지금의 실연동(pull) 모델과 안 맞고, D Tier는 이
mock 데이터에 남아있는 버전이 실제로 검증 가능한 근거 없이 들어간 자리표시자일 뿐이라
지금 설계 기준으로는 없는 게 맞다. **DB에서 지우기 전에 몇 건이나 있는지, 어떤 내용인지
사용자에게 먼저 보여주고 진행해도 되는지 확인받아라** — 되돌릴 수 없는 삭제다.

---

절차:
1. 그 DB에 접속해서 `projectServiceLinks`, `hpcPathMocks` 컬렉션이 있는지 확인한다(B-1).
2. 있으면 드롭하거나(운영 데이터가 전혀 없는 순수 mock/dev 환경이 확실할 때) 또는 문서
   개수·내용을 사용자에게 먼저 보여주고 확인받은 뒤 지운다 — 뭐가 들어있는지도 모르고 바로
   지우지 말 것.
3. `artifacts` 컬렉션에서 tier가 `A`/`B`/`C`인 문서 중 `editAccess`/`viewAccess`가 비어있지
   않은 게 있으면, 원한다면 그 두 필드를 unset하는 스크립트를 짧게 작성해 실행한다.
   `artifactServices`의 레거시 `viewUrlTemplate`/`sampleUrl` 하위 필드도 원한다면 같이 정리한다(B-1).
4. tier `A`/`B`이면서 실제 서비스에 매핑된 artifact 목록을 뽑아 사용자에게 보여주고,
   확인받은 뒤 B-2대로 실제 버전 이력을 물어와서 채운다.
5. tier `C`/`D`이면서 `versions`가 비어있지 않은 artifact 목록을 뽑아 사용자에게 보여주고,
   확인받은 뒤 B-3대로 비운다.
6. **스크립트 파일을 만들었다면, 실행이 끝나는 즉시 그 파일을 삭제한다.** (`node script.js`
   실행 후 `rm script.js` 같은 식으로.)
7. 작업 후 무엇을 지웠는지/바꿨는지/채웠는지 요약해서 사용자에게 보고한다 — 되돌릴 수 없는
   작업이니 실행 전에 그 DB가 정말 mock/dev용이 맞는지(운영 DB가 아닌지) 한 번 더 확인할 것.

---

### C. Calypso 실제 운영 반영 — 배포 주소 + 이벤트 토큰 + 호출 인증 토큰

> ★ 토큰 값은 **네가(데스크톱 세션이) 지금 직접 생성해서, 그 자리에서 바로 운영 DB/운영
> 설정에 써 넣는다.** 어디서 받아오는 값이 아니다 — 생성부터 저장까지 전부 이 작업
> 안에서 끝낸다. 생성한 값을 이 문서나 다른 어떤 파일에도 적어 남기지 마라(이 문서는 git에
> 커밋되는 파일이다), 채팅 응답에 평문으로 다시 출력하지도 마라 — DB에 쓰고 Calypso
> `.env`에 쓰는 것으로 끝이다.

#### C-0. 실제 Calypso 배포 주소를 SIREN 운영 설정에 반영

Calypso BE의 실제 API 주소: `https://siren.samsungds.net:44353/api/v1`

**실제 운영 SIREN 배포**의 환경변수에 아래를 반영한다(`api/src/config/configuration.ts`의
`calypsoApiUrl` — SIREN BE가 release 시점 currentVersion 조회와 Calypso 프록시 라우트
(`/calypso-artifacts/*`) 호출에 쓰는 베이스 URL이다. Calypso 자신의 `PUBLIC_BASE_URL`과는
다른 값이니 헷갈리지 말 것 — 이건 SIREN이 Calypso **BE api**를 부르는 주소다):

```
CALYPSO_API=https://siren.samsungds.net:44353/api/v1
```

#### C-1. Calypso→SIREN 이벤트 토큰 — 운영 SIREN DB에 반영

배경: Calypso(File Artifacts, B tier)가 SIREN에 version 이벤트를 보낼 때 쓰는 Bearer 토큰은
이제 다른 서비스와 똑같이 **SIREN DB의 `artifactServices` 컬렉션에 저장된 문서의 `token`
필드**로 검증한다(SIREN 코드는 이미 이렇게 병합되어 있다 — `api/src/hub/guards/hub-token.guard.ts`).
로컬 mock/dev 모드에서는 SIREN이 부팅 시 `key:'calypso', isBuiltIn:true` 문서를 고정 토큰
(`mock-token-calypso`)으로 자동으로 넣어주지만(`api/src/database/seed-data.ts`), **실제 운영
DB에는 이 문서가 없다** — 네가 지금 만들어 넣어야 한다. **`mock-token-calypso`를 그대로
운영에 재사용하지 마라** — 그 값은 이미 저장소에 공개로 커밋되어 있어 누구나 안다.

★ 참고로 Calypso 쪽에는 아직 이 이벤트를 실제로 **보내는 코드 자체가 없다**(별도로 나중에
구현될 기능이다). 그러니 이 작업을 해도 지금 당장 뭔가 동작이 바뀌지는 않는다 — 나중에 그
기능이 구현됐을 때 바로 쓸 수 있도록 운영 값만 미리 준비해 두는 것이다.

1. **실제 운영(production) SIREN MongoDB**에 접속한다 — B에서 다룬 mock/dev DB와는 다른
   인스턴스다. 접속 정보를 모르면 진행하지 말고 사용자에게 물어봐라.
2. `artifactServices` 컬렉션(정확한 컬렉션 이름은 접속해서 `db.getCollectionNames()`로 직접
   확인할 것 — SIREN이 Mongoose 기본 규칙으로 만들었다면 `artifactservices`가 맞겠지만,
   추측하지 말고 실제 DB에서 확인 후 진행한다)에 `key: 'calypso'`인 문서가 이미 있는지 먼저
   확인한다. **이미 있으면 아무것도 하지 말고, 그 사실을 사용자에게 보고하고 멈춰라** — 이미
   누가 해뒀다는 뜻이다.
3. **새 토큰을 네가 직접 생성한다.** SIREN 자체가 다른 서비스 토큰을 발급할 때 쓰는 방식과
   같게 맞춘다: `require('crypto').randomBytes(32).toString('hex')` (64자리 hex 문자열).
4. 아래 문서를 삽입한다(형태만 사용자에게 보여주고 진행 확인은 받되, **토큰 값 자체는
   채팅에 출력하지 말고** `<생성한 값>` 같은 자리표시자로만 보여줘라):
   ```js
   {
     key: 'calypso',
     name: 'Calypso',
     description: '',
     icon: '',
     contractVersion: '1.0',
     defaultTier: 'B',
     transport: 'none',
     baseUrl: null,
     token: '<방금 3번에서 생성한 값>',
     viewUrlTemplate: null,
     embedUploadUrlTemplate: null,
     isBuiltIn: true,
     enabled: true,
     isMock: false,
     artifactTypes: [],
     createdAt: new Date(),
     updatedAt: new Date(),
   }
   ```
5. **삽입에 쓴 스크립트 파일은 실행 직후 바로 삭제한다** (원칙 3과 동일하게) — 생성한 토큰
   값이 그 스크립트 파일에만 잠깐 머물렀다가 DB에 쓰인 뒤 완전히 사라지게 한다.

#### C-2. 실제 Calypso 배포 설정에 같은 값 반영

실제 Calypso가 배포되어 있는 환경(서버, 배포 파이프라인 등 — 접근 권한을 모르면 진행하지
말고 사용자에게 물어봐라)의 환경변수 파일(`.env.production` 등)에 아래를 추가/갱신한다 —
**C-1에서 방금 네가 생성한 값과 정확히 같은 값**을 쓴다:

```
CALYPSO_EVENT_TOKEN=<C-1에서 생성한 값과 동일>
```

(Calypso 저장소의 `.env.example`에 이미 이 키에 대한 설명 주석이 있다 — 참고만 하고 그
저장소의 `.env.production` 등 실제 배포 설정 파일이나 배포 시스템의 환경변수 설정에 반영해라.
Calypso 코드가 이 값을 아직 읽지 않으므로 지금 당장 재시작이 꼭 필요하진 않지만, 배포
파이프라인 관례상 재시작이 필요하면 사용자와 상의해서 진행해라.)

#### C-3. 반대 방향 — SIREN→Calypso 호출 인증 토큰도 운영 값으로 채운다

배경: C-0에서 실제 주소를 넣으면 SIREN BE가 그 순간부터 진짜로 Calypso BE를 호출하기
시작한다. 이 호출엔 별도의 공유 비밀(`X-Siren-Token` 헤더, `docs/07-hub-operations.md §2.1`)
이 있는데, SIREN 쪽 `CALYPSO_API_TOKEN`과 Calypso 쪽 `SIREN_CALLER_TOKEN`이 **둘 다 비어
있으면 검증을 건너뛴다(fail-open, 로컬 개발 기본값)** — 운영에 이 값을 채우지 않으면
Calypso BE의 사람용 화면·observer 라우트 전체가 사실상 인증 없이 열려 있는 것과 같다.
C-0로 실제 연동이 시작되는 지금 이 값도 같이 채워야 한다.

1. C-1과 같은 방식(`randomBytes(32).toString('hex')`)으로 **새 토큰을 네가 직접 생성한다.**
   **C-1의 이벤트 토큰과는 다른 값이어야 한다** — 서로 다른 방향의 호출을 서로 다른 비밀로
   증명한다는 게 설계 원칙이다(C-1에서 만든 값을 재사용하지 말 것, 반드시 새로 생성).
2. **실제 운영 SIREN 배포**의 환경변수 파일에 반영한다:
   ```
   CALYPSO_API_TOKEN=<방금 생성한 값>
   ```
3. **실제 Calypso 배포**의 환경변수 파일에 정확히 같은 값을 반영한다:
   ```
   SIREN_CALLER_TOKEN=<2번과 정확히 같은 값>
   ```

#### C-4. 보고

토큰 값 자체는 **평문으로 채팅에 남기지 말고**(운영 비밀이다), 어디에 저장했는지(운영 DB의
`artifactServices.calypso` 문서, SIREN 운영 설정의 `CALYPSO_API`/`CALYPSO_API_TOKEN`, Calypso
배포 설정의 `CALYPSO_EVENT_TOKEN`/`SIREN_CALLER_TOKEN`)와 각 쌍의 값이 서로 정확히 동일한지
직접 대조해서 확인했다는 사실만 요약해서 보고한다.

---

### 확인 후 진행

RPM 저장소 경로, SIREN이 RPM에 발급한 토큰/artifactTypeKey, mock/dev DB 접속 정보, 운영
SIREN DB 접속 정보, 실제 SIREN/Calypso 배포 접근 권한 — 이 중 하나라도 모르면 그 부분을
진행하기 전에 먼저 사용자에게 물어봐라(다른 부분은 아는 것부터 먼저 진행해도 된다). C-1/C-3의
토큰 값은 물어볼 필요 없다 — 네가 직접 생성해서 바로 써 넣는다. 다 끝나면 A/B/C 각각
무엇을 바꿨는지(RPM 쪽 diff 요약, DB에서 지운/바꾼 것, 운영 DB에 넣은 문서와 SIREN/Calypso
배포 설정 반영 여부 — 토큰 값 자체는 빼고) 정리해서 보고하고, **아무것도 커밋하지 않았다는
것**을 마지막에 다시 확인해줘.
