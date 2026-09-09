# 프롬프트: RPM("Readout Pattern")을 SIREN Hub에 연동하기

RPM 코드베이스와 실행 중인 SIREN 인스턴스에 접근 가능한 별도의 Claude Code 세션에
그대로 붙여넣기 위한 프롬프트다. 두 가지 작업을 포함한다.

1. **RPM 자체 API 구축** — SIREN의 Observer 계약 v2를 구현한다
   (전체 스펙 원문은 `docs/siren-artifact-hub-design.md` §19.2 참고).
2. **실행 중인 SIREN 앱에 RPM을 등록하고 실제 project/deliverable에 연결** —
   아래 엔드포인트를 실제로 SIREN에 호출해서 진행한다. 읽고 넘어가는 게 아니다.

아래 내용을 그대로 그 세션에 전달하면 된다.

---

## 시작 전에 알아야 할 배경

RPM은 SIREN 밖에 있는 기존 서비스이고, **Readout Pattern**이라는 산출물 종류를
만들어낸다. SIREN은 RPM의 데이터를 절대 소유하지 않고, RPM이 추가해야 하는
읽기 전용 HTTP GET 엔드포인트 4개를 통해서만 관측한다. SIREN은 이걸 그때그때
실시간으로 호출한다 — RPM이 SIREN 쪽으로 push하는 경로는 없고, 상시 동기화
배치도 없다. SIREN이 이 엔드포인트를 부르는 시점은 (a) 사용자가 연동된 산출물의
상세 패널을 열었을 때, (b) 그 산출물이 걸린 SIREN workflow에서 누군가 "Release"를
눌렀을 때 딱 한 번, 동기적으로.

이번 연동을 실제로 담당하는 사람이 설명한 RPM의 실제 동작 방식:

- **권한 모델**: 모든 user는 RPM의 **모든** project에 **view** 권한을 무조건 갖는다 —
  view 단계의 제한이 아예 없다. **편집** 권한만 project별 member 목록으로 관리한다.
  RPM 내부에는 이 목록에 `master`와 `editor` 두 role이 있는데, `master`는 추가로
  project 설정 자체도 고칠 수 있지만 산출물(Readout Pattern) 읽기/쓰기 관점에서는
  둘이 **동등**하다. 두 role 모두 편집 권한으로 취급한다.
- **버전 모델**: RPM의 쓰기 동작은 정확히 두 가지다.
  - **snapshot** — 전체 데이터를 그대로 캡처한다. RPM에서 release에 해당하는
    동작이며, 모든 snapshot을 `isReleased: true`로 취급한다. RPM에서 주소를
    붙일 수 있는(=버전으로 취급되는) 상태는 snapshot뿐이다.
  - **save** — 단순 **overwrite**다. minor 버전 이력을 전혀 남기지 않고,
    **save 시점에는 어떠한 comment/note도 남기지 않는다.** save로는 주소를 붙일
    수 있는 상태가 전혀 남지 않으므로, Observer 계약 관점에서는 **버전 레코드
    자체가 생성되지 않는다** — 이 계약이 보는 건 오직 snapshot뿐이다.
- **RPM 자체에는 action 로그가 없다.** 누가 언제 뭘 바꿨는지 RPM 스스로는 기록하지
  않는다. 다만 조직 내 모든 서비스가 공유하는 **공용 공통 백엔드**가 있고, 거기서
  RPM을 포함한 모든 서비스의 save/release성 action을 자체 DB에 로그로 남긴다 —
  단, 필드가 **매우 제한적**이다: 수정한 user, 날짜, project명 정도만 있다. 이
  로그는 snapshot 레코드의 `giverKnoxId` / `observedAt`를 채우는 **best-effort**
  용도로만 쓴다 — 매칭되는 로그가 없으면 추측하지 말고 그냥 `null`로 둔다.

---

## Part 1 — RPM에 엔드포인트 4개 구현하기

넷 다 **GET**이고, SIREN에 `baseUrl`로 등록할 하나의 base URL 아래에 둔다.
SIREN은 5초 타임아웃으로 호출하며, 2xx가 아닌 응답·타임아웃·형식이 깨진 응답을
전부 "데이터 없음"(fail-closed)으로 취급한다 — 그러니 빠르게 응답하고, `403`
대신 실제로 계산한 값과 함께 `200`을 돌려줘라. RPM 자체의 view 모델에는 애초에
"금지"라는 개념이 없다(view는 무조건 허용이므로).

`knoxId` 쿼리 파라미터는 요청자의 신원이다 — SIREN과 조직 내 다른 서비스들이
이미 공유하고 있는 것과 같은 KnoxID라고 가정한다. `knoxId`가 없거나 인식할 수
없으면 fail-closed로 처리한다: `canView: false, canEdit: false`, 그리고 나머지
세 엔드포인트에서도 그 호출자는 아무것도 못 보는 것으로 취급한다.

### 1. `GET /artifacts/{artifactId}/access?knoxId={requester}`

Readout Pattern 산출물 하나에 대한 요청자의 접근 권한을 돌려준다.

```json
{ "canView": true, "canEdit": false }
```

- `canView`: `knoxId`가 인식되는 user이기만 하면 항상 `true` — RPM에는 view
  제한이 없다.
- `canEdit`: `knoxId`가 해당 project의 member 목록에 `master` 또는 `editor`로
  올라 있으면 `true`, 아니면 `false`.

### 2. `GET /artifacts/{artifactId}/current-version?knoxId={requester}`

그 산출물의 **가장 최근 snapshot**을 돌려준다. 아직 하나도 없으면(=snapshot은
한 번도 안 찍고 save만 한 산출물) 주소를 붙일 수 있는 버전이 존재하지 않는다는
뜻이므로 `404` 또는 `null`을 돌려준다 — save로 남은 상태를 억지로 지어내서
반환하지 않는다.

```json
{
  "versionLabel": "2024-06-03T09:14:00Z",
  "isReleased": true,
  "giverKnoxId": "jdoe",
  "giverDept": null,
  "viewUrl": "https://rpm.internal.example.com/patterns/PAT-4471",
  "sourceRefs": [],
  "editors": ["jdoe", "asmith"],
  "observedAt": "2024-06-03T09:14:00Z"
}
```

필드별 설명:
- `versionLabel`: 그 snapshot을 가리키는 안정적이고 사람이 읽을 수 있는 라벨 —
  RPM에는 버전 번호 개념이 없으므로 타임스탬프도 괜찮다. 무엇을 쓰든 그
  snapshot에 대해 항상 같은 값이어야 한다(나중에 SIREN이 release에 이 값을
  그대로 얼려서 저장한다).
- `isReleased`: 항상 `true` — 이 엔드포인트와 `versions`가 돌려주는 모든 값은
  snapshot이고, snapshot은 정의상 release와 동등하다.
- `giverKnoxId` / `observedAt`: 그 project의 가장 최근 snapshot action에 대한
  공용 공통 백엔드 로그 항목이 있으면 거기서 가져오고, 없으면 `null`. "지금 이
  순간 snapshot을 호출한 사람"으로 대체하지 말고, 로그에 실제로 기록된 값만 쓴다.
- `giverDept`: RPM은 부서를 추적하지 않으므로 항상 `null`.
- `viewUrl`: 그 산출물로 바로 들어가는 실제 동작하는 링크.
- `sourceRefs`: `[]` — Readout Pattern은 다른 Hub 연동 산출물로부터 만들어지는
  것이 아니다. 앞으로 바뀌지 않는 한 항상 비워둔다.
- `editors`: **이 `knoxId`에 대해 `canEdit`가 `true`가 될 때만 채운다** — 즉
  요청자 본인이 해당 project의 `master` 또는 `editor`일 때만. view 권한만 있는
  경우엔 빈 배열이 아니라 `null`을 돌려준다(SIREN UI가 editor 목록을 보여줄지
  말지 이 값으로 판단한다). 채울 때는 그 project의 `master`·`editor` KnoxID를
  전부 나열한다(둘을 구분할 필요는 없다).

### 3. `GET /artifacts/{artifactId}/versions?knoxId={requester}`

`current-version`과 같은 모양을 최신순 JSON 배열로 — 모든 항목이 snapshot이다
(전부 `isReleased: true`; RPM에는 작업중/미배포 상태 자체가 없다). 한 번도
snapshot을 찍은 적이 없으면 `[]`.

```json
[
  { "versionLabel": "2024-06-03T09:14:00Z", "isReleased": true, "...": "..." },
  { "versionLabel": "2024-05-18T14:02:11Z", "isReleased": true, "...": "..." }
]
```

`access`/`current-version`과 같은 기준으로 `knoxId` 필터링을 적용한다 — SIREN은
이 목록을 그대로 신뢰하고 **다시 필터링/마스킹하지 않는다**. 호출자가 view
권한조차 없는 경우(RPM 모델상 원래는 안 생기지만, 방어적으로) `[]`를 돌려준다.

### 4. `GET /projects/search?code={code}&revision={revision}`

**프로젝트 연결용** 엔드포인트다 — 왜 필요한지, 왜 결과를 하나로 뭉개면 안 되는지는
아래 매핑 요구사항을 참고.

```json
[
  { "externalProjectId": "proj_8f2a1c", "displayName": "PLL_MAIN rev.B (foundry run 2)", "code": "PLL_MAIN", "revision": "B" },
  { "externalProjectId": "proj_c91e07", "displayName": "PLL_MAIN rev.B (internal test)", "code": "PLL_MAIN", "revision": "B" }
]
```

- 자체 `code`(그리고 `revision`이 주어졌으면 그것까지)가 쿼리 파라미터와 일치하는
  RPM project를 찾는다 — RPM이 내부적으로 project code/revision 필드를 매칭하는
  방식을 그대로 쓰면 된다.
- **`externalProjectId`는 반드시 RPM 내부의 실제 key 또는 UUID여야 한다 — 화면에
  보이는 이름이면 안 된다.** RPM에서는 같은 `code` + `revision`을 공유하는
  서로 다른 project가 여러 개 있을 수 있다(예: 양산 run 하나와 내부 테스트용
  하나가 둘 다 `PLL_MAIN` rev `B`로 불리는 경우) — 그래서 표시 이름만으로는
  안전하게 식별할 수 없다. `code`/`revision`이 같아서 겉보기엔 똑같아 보이는
  후보들이라도, 매칭되는 project는 전부 각자의 실제 고유 `externalProjectId`를
  가진 별개의 배열 항목으로 돌려준다.
- `displayName`은 `code`/`revision`만으로는 구분이 안 되는 후보들 사이에서
  사람이 실제로 구별할 수 있도록 충분한 맥락(project 제목, 짧은 구분 메모 등
  RPM이 가진 것)을 담아야 한다.
- 매칭되는 게 없으면 `[]`. "그나마 제일 그럴듯한 것"으로 추측하거나 자동으로
  하나로 합치지 않는다 — 후보가 단 하나뿐이어도 SIREN은 항상 이 목록을 사람에게
  보여주고 명시적으로 고르게 한다.

---

## Part 2 — 실행 중인 SIREN 앱에 RPM 등록하기

위 4개 엔드포인트가 어떤 `<RPM_BASE_URL>`에서 실제로 떠 있다면, 아래를 실제로
동작 중인 SIREN 인스턴스에 대고(목업이 아니라) 실행한다 — 전부 실제 쓰기 동작이다.

### 2.1 RPM을 Hub 서비스로 등록

```
POST /hub/services
Headers: X-Knox-Id: <Admin user의 KnoxID>, X-User-Group: Admin
Body:
{
  "name": "RPM",
  "description": "Readout pattern management",
  "defaultTier": "A",
  "transport": "http",
  "baseUrl": "<RPM_BASE_URL>",
  "viewUrlTemplate": "<RPM_BASE_URL_OR_UI_URL>/patterns/{artifactId}",
  "artifactTypes": [
    { "key": "readout-pattern", "name": "Readout Pattern" }
  ]
}
```

- `defaultTier: "A"`와 `transport: "http"`는 반드시 같이 간다 — SIREN은 이 tier가
  아니면 `transport`를 강제로 `"none"`으로 잠그므로, 정확히 `"A"`/`"http"`여야 한다.
- `artifactTypes` 항목은 선택이다(RPM은 지금 산출물 종류가 하나뿐이라 빈 배열로
  둬도 SIREN은 단일 종류 서비스로 취급한다) — 다만 다른 다종 서비스들과 일관성을
  맞추고, 나중에 RPM이 산출물 종류를 늘려도 호환성이 깨지지 않도록 지금 등록해
  두는 걸 권장한다.
- 응답에 서버가 만들어낸 불변 `key`가 들어 있다 — 기록해 둔다(예:
  `"a1b2c3d4_rpm"`). 아래 모든 단계에서 이 값을 `<RPM_SERVICE_KEY>`로 부른다.

### 2.2 SIREN project를 정확한 RPM project에 연결

RPM에서 Readout Pattern 데이터를 가져와야 하는 각 SIREN `Project`(`code` +
`revision`으로 식별)에 대해:

```
GET /hub/services/<RPM_SERVICE_KEY>/projects/search?code=<project.code>&revision=<project.revision>
```

돌아온 후보를 확인한다. **사람이 직접 `externalProjectId`로 정확한 것을 골라야
한다** — 후보가 딱 하나뿐이어도 자동 선택하지 않는다. 위 엔드포인트가 존재하는
이유 자체가 code+revision이 항상 유일하지 않기 때문이고, SIREN이 사람의 확인
단계를 강제하는 것도 정확히 이 때문이다.

그 다음 실제로 링크를 만든다:

```
POST /projects/<siren_project_id>/service-links
Headers: X-Knox-Id: <Admin user의 KnoxID>, X-User-Group: Admin
Body:
{
  "serviceKey": "<RPM_SERVICE_KEY>",
  "externalProjectId": "<확인한 후보의 externalProjectId>",
  "displayName": "<선택 — 검색 결과에서 본 사람이 알아볼 수 있는 라벨 등>"
}
```

(`GET /projects/<siren_project_id>/service-links`로 이미 있는 링크 목록을 확인할
수 있고, `DELETE .../service-links/<linkId>`로 하나를 제거할 수 있다.)

### 2.3 실제 deliverable을 실제 RPM 산출물에 연결

SIREN workflow 캔버스에서(또는 `PATCH /deliverables/:id`로) 다음을 설정한다:

- `serviceKey`: `<RPM_SERVICE_KEY>`
- `externalArtifactId`: 그 Readout Pattern의 실제 RPM 산출물 id/uuid
  (**project id가 아니다** — 위 Part 1의 4개 엔드포인트가 `{artifactId}`로
  받는 것이 바로 이 값이다)
- `artifactTypeKey`: 2.1에서 `artifactTypes` 항목을 등록했다면 `"readout-pattern"`,
  아니면 생략하거나 `null`로 둔다.

**`externalArtifactId`는 반드시 2.2에서 그 SIREN project에 연결한 RPM project에
속한 값만 골라야 한다.** SIREN 자체는 어떤 artifact id가 링크된 project에
속하는지를 강제로 검증하지 않는다(RPM의 `access`/`current-version`/`versions`
엔드포인트가 실질적인 강제 지점이다 — SIREN은 거기서 필터링된 결과를 전적으로
신뢰하기 때문이다) — 그러니 테스트 데이터를 연결할 때 "어차피 동작하니까"라고
넘기지 말고 이 부분은 직접 신경 써서 맞춰야 한다.

---

## Part 3 — 끝까지 검증하기

연결이 끝나면 다음을 확인한다:

- `master`/`editor`가 아닌 project member로 연동된 deliverable의 상세 패널을
  열면 **열람 전용**으로 보여야 한다: release(snapshot)된 버전만 보이고, 편집
  UI도 editors 목록도 없어야 한다.
- `master` 또는 `editor`로 열면 전체 snapshot 이력과 editors 목록이 보여야 한다.
- **save**만 하고 **snapshot**은 한 번도 안 찍은 산출물은 SIREN에서 버전이
  아예 안 보여야 한다(빈 "작업중 버전"이 아니라 정말 아무것도 없어야 한다 —
  save로는 주소를 붙일 수 있는 상태가 안 남기 때문).
- RPM에서 snapshot을 찍으면 `current-version`을 통해 새 버전이 바로 반영돼야
  한다(SIREN이 실시간으로 부르지, 지연이 있는 방식이 아니다) — 다만 SIREN
  workflow에서 실제로 Release를 누르기 전까지는 SIREN 내부의 "release"로
  자동 반영되지는 않는다는 점에 유의(그 순간에만 SIREN이 RPM을 불러 그 버전을
  자신의 release 스냅샷에 얼려 넣는다).
- 두 개 이상의 서로 다른 RPM project와 매칭되는 `code`/`revision` 조합으로
  `GET /projects/search`를 호출하면 각각 별개의 `externalProjectId`를 가진
  개별 항목으로 돌아와야 한다 — SIREN admin 화면에서도 이게 하나로 합쳐지지
  않고 서로 다른, 고를 수 있는 옵션으로 보이는지 확인한다.
