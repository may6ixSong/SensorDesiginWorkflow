# 프롬프트: SIREN에 RPM project 매핑 UI 추가 + Project revision(EVT) 노출

SIREN 코드베이스에서 작업하는 세션에 그대로 붙여넣기 위한 프롬프트다.
RPM 쪽 작업(`D:\DPI\RPM`)은 **이미 끝났으니 건드리지 않는다.** 이 문서의 모든 사실은
2026-09-08에 실행 중인 dev 인스턴스로 직접 호출해서 확인한 것이다.

---

## 배경 — RPM 쪽은 이미 완료됐다

RPM("Readout Pattern")은 SIREN 밖의 기존 서비스이고, Observer 계약 v2를 구현 완료했다.
SIREN Hub 레지스트리에 **이미 등록돼 있다**:

| 항목 | 값 |
|---|---|
| `key` (불변) | `b0933641_readout-pattern` |
| `name` | `RPM` |
| `defaultTier` / `transport` | `A` / `http` |
| `artifactTypes` | `[{ key: "readout-pattern", name: "Readout Pattern" }]` |

**새 서비스를 등록하지 마라.** 위 key를 그대로 쓴다.

### RPM이 제공하는 엔드포인트 4개

`baseUrl` 뒤에 SIREN이 그대로 이어 붙이는 경로다:

```
GET {baseUrl}/artifacts/{artifactId}/access?knoxId={requester}
GET {baseUrl}/artifacts/{artifactId}/current-version?knoxId={requester}
GET {baseUrl}/artifacts/{artifactId}/versions?knoxId={requester}
GET {baseUrl}/projects/search?code={code}&revision={revision}
```

### 이번 작업에서 쓸 엔드포인트

SIREN에 **이미 프록시가 있다** — `api/src/hub/project-links.controller.ts:19`:

```
GET /api/v1/hub/services/b0933641_readout-pattern/projects/search?code=<code>&revision=<revision>
```

**인증이 필요 없다** — `@CurrentActor`도 가드도 없어서 헤더 없이 200이 온다(확인함).
따라서 일반 사용자용 Add Deliverable 화면에서 그대로 호출할 수 있다. Admin 전용이 아니다.

실제 응답(dev 데이터, 검증됨):

```jsonc
// ?code=S5KJMBSP03&revision=EVT0  →  3건
[
  { "externalProjectId": "JMB",      "displayName": "JMB (EVT0) - Aqua",      "code": "S5KJMBSP03", "revision": "EVT0" },
  { "externalProjectId": "JMBslide", "displayName": "JMBslide (EVT0) - Aqua", "code": "S5KJMBSP03", "revision": "EVT0" },
  { "externalProjectId": "JMB_bk",   "displayName": "JMB_bk (EVT0) - Aqua",   "code": "S5KJMBSP03", "revision": "EVT0" }
]

// ?code=CIS-A7&revision=  →  1건
[ { "externalProjectId": "GN8", "displayName": "GN8 (EVT0) - GN8 readout", "code": "CIS-A7", "revision": "EVT0" } ]
```

### 알아야 할 RPM 데이터 모델

- **`externalProjectId`가 곧 `externalArtifactId`다.** RPM에서 산출물 1개 = 한 product의
  ATOP 전체다(개별 readout pattern에는 id가 없고 snapshot이 product 단위라서). 그래서
  후보를 고르면 그 값이 그대로 deliverable의 `externalArtifactId`가 된다.
- **`projectCode`는 1:N이다.** 한 프로젝트 코드에 여러 RPM product가 달릴 수 있다
  (위 `S5KJMBSP03` → 3건이 실제 dev 데이터다). 이게 사람이 골라야 하는 이유다.
- RPM의 `revision`은 RPM 내부의 **EVT**(`project.evt`, 예: `EVT0`)다.

---

## 작업 1 — Project revision(EVT)을 프론트엔드에 노출한다

**백엔드는 이미 완비돼 있다. 스키마를 바꿀 필요가 없다.**

- `api/src/projects/schemas/project.schema.ts:70` — `revision: string` 존재
- `:135` — `ProjectSchema.index({ code: 1, revision: 1 }, { unique: true })`
- `api/src/projects/dto/project.dto.ts:23,47` — 응답에 이미 포함
- `api/src/projects/dto/update-project.dto.ts:20` — `revision?: string` 수정 가능

**없는 것은 프론트엔드다.** `web/src` 전체에 `revision` 참조가 **0건**이다
(`contractVersion` 제외). 즉 프로젝트 생성/편집/표시 어디에도 EVT 입력란이 없다.

해야 할 일:

1. 프로젝트 생성·편집 화면에 `revision`(EVT) 입력란을 추가한다. 라벨은 RPM과 맞춰
   "Revision (EVT)" 정도로 하고, 힌트는 `EVT0`.
2. 프로젝트 목록·상세에 `code`와 함께 revision을 표시한다.
3. 기존 프로젝트의 revision은 **둘 다 빈 문자열이다**(`CIS-A7` → `""`, `S5KJMBSP03` → `""`).
   값을 채울 수단이 필요하다.

**주의 2가지:**

- **`(code, revision)`에 유니크 인덱스가 걸려 있다.** 빈 문자열도 하나의 값이므로,
  기존 프로젝트에 값을 넣는 것 자체는 안전하지만, 같은 code로 여러 revision을
  만들 때 충돌 규칙을 UI가 설명해야 한다. `code` 단독 유니크는 이미 해제돼 있다.
- 프로젝트 **생성** 경로가 `revision`을 받는지 확인해라 — `dto/` 폴더에
  `create-project.dto.ts`가 없어서 생성 경로가 어디인지 먼저 찾아야 한다.
  수정 DTO에는 있다.

---

## 작업 2 — External artifact ID를 자유 입력에서 "RPM project 선택"으로 바꾼다

### 지금 상태 (확인된 사실)

**생성** — `web/src/components/dialogs/AddDeliverableDialog.tsx`
- `:130-140` Source(`serviceKey`) 드롭다운. 목록은 `useArtifactServices()` →
  `GET /hub/services` (켜져 있는 서비스 전부)
- `:141-157` Artifact type 드롭다운 (조건: `artifactTypes.length > 0`)
- `:158-164` **External artifact ID — 자유 텍스트**
  ```jsx
  <Field label="External artifact ID — optional; fill in once it's registered there">
    <TextInput value={externalArtifactId} onChange={setExternalArtifactId}
      placeholder="e.g. the artifact's id in that system" />
  ```
  검증도, 조회도, autocomplete도 없다. 제출 시 `.trim() || null`만 한다.

**수정** — `web/src/components/dialogs/DeliverableDialog.tsx` `BasicInfoCard`(`:773`)
- Name / Source / Artifact type만 편집 가능
- `externalArtifactId`는 **의도적으로 빠져 있다** (`:768-771`, `:810-814` 주석:
  "External artifact ID도 이 화면에 노출하지 않는다(사용자 요청)"). 기존 값을 그대로
  들고 저장만 한다.

**전송 경로** — `web/src/pages/BoardPage.tsx:544-548` →
`web/src/api/hooks/useDeliverables.ts:94` → `POST /workflows/:workflowId/deliverables`.
`useUpdateDeliverable`(`useDeliverables.ts:101-115`)은 `externalArtifactId`를 받지만
**어떤 UI도 새 값을 넘기지 않는다.**

### 만들 것

Add Deliverable과 source 수정 양쪽에서, Source로 RPM(또는 `projects/search`를
지원하는 서비스)을 고르면:

1. 현재 프로젝트의 `code` + `revision`으로 위 프록시를 호출한다.
2. 돌아온 후보를 **`displayName`으로 보여주고 사람이 하나를 고르게** 한다.
3. 고른 항목의 `externalProjectId`를 `externalArtifactId`로 저장한다.

---

## 반드시 지켜야 할 제약 — 어기면 조용히 깨진다

1. **저장하는 값은 `externalProjectId` 원본 그대로다.** `code`도 `displayName`도 아니다.
   **대소문자까지 정확해야 한다** — RPM에는 `id=hm1`인데 `code=HM1`인 product가 실제로
   있고, RPM의 모든 조회는 `id` 기준이다.

2. **후보가 1건이어도 자동 선택하지 마라.** 사람이 명시적으로 고르게 한다. 코드+리비전이
   유일하지 않은 게 이 엔드포인트가 존재하는 이유다.

3. **후보 여러 건을 하나로 합치지 마라.** 위 `S5KJMBSP03` → 3건이 실제 데이터다.
   `code`/`revision`이 똑같아 보여도 각각 다른 product이므로 개별 선택지로 보여준다.

4. **`[]`는 "후보 없음"과 "호출 실패"를 구분하지 못한다.**
   `api/src/hub/observer-client.service.ts`는 5초 타임아웃 / 재시도 0회이고, 비2xx·
   타임아웃·형식 오류를 전부 `null` → `[]`로 만든다. 그러니 **"후보 없음"을 단정적으로
   표시하지 말고, 자유 입력 fallback을 남겨둬라.** 실패와 없음을 화면에서 구분하고 싶으면
   프록시 응답에 구분 정보를 실어야 하는데, 그건 백엔드 변경이 필요하다.

5. **`revision`이 빈 문자열이면 "지정 안 함"이다** — RPM이 `projectCode`만으로 매칭한다.
   작업 1이 끝나기 전에는 모든 프로젝트가 이 상태이므로, 빈 revision으로도 후보가
   나와야 정상이다.

6. **모든 서비스가 `projects/search`를 갖고 있지는 않다.** `transport !== 'http'`거나
   `baseUrl`이 없으면 SIREN은 아예 호출하지 않고 `[]`를 준다
   (`observer-client.service.ts` 게이트). 그런 서비스에는 이 UI를 띄우지 말고 자유 입력을
   유지해라. 현재 tier A + http인 서비스는 `RPM`, `OTP Map`, `ssm`이다.

7. **`ProjectServiceLink`와의 정합성은 SIREN이 검증하지 않는다.** 그래서 이 UI가
   실질적인 유일한 안전장치다.

---

## 같이 고쳐야 할 기존 문제 3개

### (1) `externalArtifactId`가 "생성 시점 1회 + 무검증 + 수정 불가"다 — 가장 위험

오타를 내면 RPM이 못 찾고 → fail-closed → 화면에는 **"권한 없음"처럼** 보이고 →
**UI로는 고칠 방법이 없다**(`PATCH /deliverables/:id`뿐).

이번 작업으로 오타 가능성 자체는 줄지만, **이미 잘못 저장된 값을 고칠 경로가 없는 건
그대로다.** `DeliverableDialog.tsx:768-771`의 "노출하지 않는다(사용자 요청)" 결정을
재검토해야 한다 — 최소한 후보 선택으로 **다시 고를 수 있게** 하는 건 자유 입력 노출과
다른 얘기이므로, 원래 요청의 취지(자유 텍스트를 보여주지 않는다)를 지키면서도 수정이
가능하다.

### (2) `artifactTypes.length > 0` 조건이 설계 문서와 어긋난다

`AddDeliverableDialog.tsx:141`이 `> 0`이라서, 종류가 **1개뿐인 서비스도** 사용자에게
고르라고 강제한다. `docs/siren-artifact-hub-design.md:898-899` §19.1은 명시적으로
*"artifactTypes가 1개뿐인 서비스는 사용자에게 종류를 고르라고 묻지 않고 그 1개를
자동으로 쓴다"* 고 정했다. **`> 1`로 고치고, 1개일 때는 자동 선택해라.**
(RPM에 `artifactTypes`를 등록하면서 이 마찰이 드러났다.)

### (3) 프로젝트↔서비스 링크 UI가 아예 없다

`web/src`에 `service-links`, `projects/search`, `externalProjectId` 참조가 **모두 0건**이다.
Source 드롭다운은 `GET /projects/:id/service-links`를 한 번도 호출하지 않아서, 이 프로젝트가
그 서비스에 연결돼 있는지 화면이 알지 못한다. 링크 생성·삭제도 API로만 가능하다
(`POST`/`DELETE /projects/:projectId/service-links`, Admin 필요).

이번 작업 범위에 포함할지는 판단이 필요하다. 최소한 Source 드롭다운에서 **링크된 서비스를
우선 노출하거나 표시**해주면 오연동이 줄어든다.

---

## 현재 실행 중인 dev 인스턴스 상태 — 작업 전에 반드시 확인

`GET /api/v1/hub/services` 로 지금 값을 확인하고 시작해라. 2026-09-08 기준:

- **`baseUrl`이 임시 프로세스를 가리키고 있을 수 있다** (`http://127.0.0.1:<임시포트>/api`).
  이건 검증용으로 띄운 것이라 이미 죽었을 수 있고, 그러면 모든 RPM 호출이 조용히
  fail-closed 된다. 정상 값은 로컬 dev면 `https://localhost:44351/api`,
  운영이면 `http://rpm.samsungds.net:44351/api`다.
  ⚠️ `https://localhost`로 부르려면 SIREN을 `NODE_OPTIONS=--use-system-ca`로 띄워야 한다
  (dev 인증서는 Windows 신뢰 저장소에 있음). `http://rpm.samsungds.net`처럼 **포트와
  `/api`가 빠진 값은 nginx SPA에 걸려 200 + HTML을 반환하고 조용히 실패한다.**
- 이미 만들어져 있는 연동 데이터(검증용):
  - project `S5KJMBSP03` → service-link 3건 (`JMB`, `JMBslide`, `JMB_bk`)
  - project `CIS-A7` → service-link 1건 (`GN8`)
  - deliverable `6a97d260066e717dfc34597f` (ATOP/ko) → `JMB` (snapshot 1건)
  - deliverable `6a97f678066e717dfc346245` (ATOP/ml3) → `JMBslide` (snapshot 0건)
  - deliverable `6a9fecf8aabfac047b65fbe8` (PLL_MAIN/ko) → `GN8` (snapshot 6건 + 작업분)
- RPM dev DB의 `projectCode`: `JMB`/`JMBslide`/`JMB_bk` → `S5KJMBSP03`, `GN8` → `CIS-A7`.
  그 외 87개 product는 아직 `null`이라 검색에 안 걸린다.

---

## 검증 방법

작업 1:
- 프로젝트에 revision을 입력·저장·재조회했을 때 값이 유지되는지
- `(code, revision)` 유니크 위반 시 사용자에게 이해되는 메시지가 나오는지

작업 2:
- `S5KJMBSP03` 프로젝트에서 Source=RPM을 고르면 **3개 후보가 각각 별개 선택지로** 뜨는지
  (하나로 합쳐지지 않는지)
- `CIS-A7`에서는 1개가 뜨고, 그래도 **자동 선택되지 않고 사람이 고르게** 되는지
- 고른 뒤 저장된 `externalArtifactId`가 `GN8`처럼 대소문자까지 정확한지
- 저장 직후 `GET /deliverables/:id/live-versions`가 버전을 돌려주는지
  (RPM 인스턴스가 떠 있어야 한다)
- `projects/search`가 `[]`를 줄 때 화면이 "권한 없음"이나 "오류"로 오해되게 표시하지 않는지

참고 curl:
```bash
# 후보 검색 (인증 불필요)
curl "http://localhost:3000/api/v1/hub/services/b0933641_readout-pattern/projects/search?code=S5KJMBSP03&revision=EVT0"

# 연동 확인 (권한별로 다르게 나와야 정상)
curl -H 'X-Knox-Id: yunjung1.kim' "http://localhost:3000/api/v1/deliverables/6a97d260066e717dfc34597f/live-versions"
curl -H 'X-Knox-Id: sdp.op'       "http://localhost:3000/api/v1/deliverables/6a97d260066e717dfc34597f/live-versions"
```
`yunjung1.kim`은 JMB의 Master, `sdp.op`는 **Viewer**다 — 후자는 `editors: null`이어야 한다.
