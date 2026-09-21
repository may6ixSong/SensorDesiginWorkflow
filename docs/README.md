# SIREN 설계서 v3

CIS(CMOS Image Sensor) 설계 산출물을 workflow 캔버스 위에서 흐름으로 관리하고,
부서 단위로 **release**(전달)하는 시스템.

> **이 문서 묶음이 정본이다.** v2 설계서(`siren-design-v2.md`)와 Hub 설계서
> (`siren-artifact-hub-design.md`), 킥오프 프롬프트는 이 개정으로 **폐기**되었다.
> 두 문서에만 있던 규칙은 이 묶음이 다시 정의하지 않는 한 효력이 없다.
>
> 살아남은 문서는 셋뿐이다 — 외부 서비스 연동 계약 `observer-contract-v1.yaml`,
> 그리고 작업 지시서 성격의 `rpm-integration-prompt.md`, `siren-rpm-mapping-ui-prompt.md`.

## 문서 지도

| 문서 | 내용 |
|---|---|
| **README.md** (이 문서) | 개요 · 용어 · 확정 결정 요약 · 미결 사항 |
| [01-permissions.md](01-permissions.md) | 3계층 권한 모델(Project → Workflow → Artifact), 가시성 판정 |
| [02-data-model.md](02-data-model.md) | MongoDB 스키마, API 계약 |
| [03-canvas.md](03-canvas.md) | 캔버스, 편집 세션 lock, flow, 필터 |
| [04-artifact-and-publish.md](04-artifact-and-publish.md) | Tier(OA Service/File Artifacts/HPC Service), publish, recipient, 상세 slide 열람 |
| [05-release.md](05-release.md) | Release 절차, 알림, Release history |
| [06-ui-motion-and-migration.md](06-ui-motion-and-migration.md) | 모션 시스템, i18n, HLD 제거, 마이그레이션, TODO |
| [07-hub-operations.md](07-hub-operations.md) | 허브 운영 — Service Manage(OA/HPC 등록·토큰), FE→BE 단일 경로, version 이벤트 수신·동기화 |
| [08-service-integration.md](08-service-integration.md) | **새 서비스 연동 API 레퍼런스** — SIREN↔서비스 양방향 호출과 DTO를 한 파일에. 새 OA/HPC Service를 연동할 땐 이것부터 |
| [09-my-assignment.md](09-my-assignment.md) | **My Assignment** — 과제를 가로질러 내 release·산출물·달력을 모아 보는 화면. scope 판정과 조회 범위 |
| [prompts/a-tier-recipient-integration.md](prompts/a-tier-recipient-integration.md) | A Tier 연동 서비스에 전달할 **정책** 변경 요청 프롬프트 |
| [prompts/rpm-access-endpoint.md](prompts/rpm-access-endpoint.md) | 위 요청 ①을 **구현 수준**으로 구체화한 것 — RPM 등 A Tier 서비스 세션에 그대로 전달 |
| [prompts/db-migration-v3.md](prompts/db-migration-v3.md) | 실제 MongoDB의 데이터를 v3 스키마 모양으로 바꾸는 **실행 전용** 프롬프트 |
| [prompts/rpm-and-mockdb-hub-v4-prompt.md](prompts/rpm-and-mockdb-hub-v4-prompt.md) | 허브 재설계(07장)에 맞춰 RPM 코드 갱신 + mock/dev DB 정리 — **실행 전용** 프롬프트 |
| [prompts/db-my-assignment-backfill.md](prompts/db-my-assignment-backfill.md) | My Assignment(09장)가 실 DB에서 제대로 보이도록 인덱스·필드를 보정하는 **실행 전용** 프롬프트 |

> `prompts/` 아래 문서는 **SIREN·Calypso 저장소 밖에서 수행해야 하는 작업**을 다른 세션에
> 그대로 붙여넣기 위한 것이다. 이 저장소의 코드로는 끝낼 수 없는 일(실 DB 변경, 외부 서비스
> API 추가)만 여기 모아 둔다.
>
> **한 가지 원칙이 세 문서 모두에 걸린다 — 이 프롬프트를 받은 세션은 SIREN 저장소를 고치지
> 않는다.** 파일 수정도, `git add`/`commit`도 하지 않는다. `db-migration-v3.md`는 DB만 바꾸고
> 스크립트는 저장소 바깥에 두며, 나머지 둘은 각자 그 외부 서비스의 저장소만 고친다.
> SIREN 쪽 코드는 이미 v3로 끝나 있고, 뒤처져 있는 것은 **데이터와 외부 서비스**뿐이다.

---

## 1. 용어 — 먼저 이것부터

이번 개정에서 가장 자주 헷갈리는 두 단어를 아래처럼 **고정한다.** 코드·UI·i18n 키·DB 필드명
어디에서도 이 구분을 어기지 않는다.

| 용어 | 주체 | 뜻 |
|---|---|---|
| **release** | **Workflow** | 이 workflow의 산출물들을 **각 수신 부서에게 전달하는 행위**. 한 번의 release가 여러 산출물을 한꺼번에 실어 보낸다 |
| **publish** | **Artifact(산출물)** | 산출물 하나가 자기 서비스 안에서 **공식 버전으로 확정되는 행위**. SIREN은 이걸 관측만 한다 |

- Release history 화면에서 각 산출물의 상태를 쓸 때는 반드시 `published` / `Not published`를 쓴다.
  `released`는 workflow 단위 행위에만 쓴다.
- 기존 코드의 `isReleased`(버전 엔트리 플래그)는 **`isPublished`로 개명**한다(06장).

### 그 밖의 용어

| 용어 | 정의 |
|---|---|
| **과제(Project)** | 제품 개발 건. `code` + `revision` 조합이 하나의 과제다 |
| **Revision** | `EVT` + 0 이상 정수. 예: `EVT0`, `EVT1`. 같은 code라도 revision이 다르면 완전히 다른 과제 |
| **Milestone** | 과제 공통 일정. workflow 생성 시 phase의 초기값으로 복사된다 |
| **Phase** | workflow 자기 일정. 복사된 뒤로는 milestone과 독립 |
| **Workflow** | 설계 흐름 하나. 캔버스 하나에 대응하며 **반드시 부서 하나에 소속**된다 |
| **Block** | 캔버스 위의 노드. 산출물 블록 ∪ 메모 블록 |
| **Artifact(산출물)** | 버전 관리 대상 실체. Block은 artifact를 가리키는 **자리(placement)**일 뿐이다 |
| **Flow(Edge)** | 블록 간 흐름 선 |
| **Tier** | 산출물의 연동 신뢰도 A~C (04장). **사람이 보는 이름은 A=OA Service, B=File Artifacts, C=HPC Service다** — 글자(A/B/C)는 DB에 저장되는 내부 값으로만 남고, UI·문서·주석은 전부 이 이름을 쓴다. (★ Tier D/External·Attested는 폐기했다 — File Artifacts(B)가 OA-link/HPC-path 참조형 콘텐츠까지 갖도록 넓어지면서 그 역할을 대체했다, 04장 §2) |
| **Recipient** | release 시 그 산출물을 **전달받는** 부서/사용자 |
| **Owner** | workflow의 대표 담당자. **정확히 1명**, 현재 이양 불가 |
| **Edit / View Access** | workflow 또는 artifact에 대한 편집/열람 권한. **부서 다중 + 개별 사용자 다중** |

---

## 2. 이번 개정의 핵심 변경 8가지

1. **HLD 개념 완전 폐기.** `hld*` 라는 이름의 파일·컬렉션·변수·주석·i18n 키를 전부 제거한다.
   그 자리를 workflow **release**가 대신하되, 의미가 다르다 — HLD는 "workflow 전체 스냅샷"이었고
   release는 "**각 부서에게 각자 받을 산출물을 전달**"하는 행위다.
2. **캔버스에서 version 개념 제거.** 캔버스 편집은 항상 overwrite이고, 스냅샷을 찍지 않는다.
   Edit 권한자와 View 권한자가 **완전히 동일한 실시간 캔버스**를 본다.
3. **Artifact가 1급 실체로 승격.** 산출물의 버전 이력은 artifact 단위로 SIREN이 보관하고 여러
   workflow가 공유한다. Block은 그 artifact를 가리키는 자리다. (Edit/View **권한**은 SIREN이
   보관하지 않는다 — 아래 4 참고. 이건 v3 설계 도중 두 번 바뀐 결정이다 — 처음엔 B/C/D 권한을
   SIREN이 보관하기로 했었다가 A와 같은 방식으로 통일했고, 그다음엔 D 자체를 폐기했다.)
4. **Recipient 개념 신설, 전 tier에 통일 적용.** SIREN은 Edit/View **권한**을 전혀 들고 있지
   않는다 — OA Service·File Artifacts·HPC Service 모두 그 서비스(Calypso 포함)가 매번 라이브로
   canView/canEdit를 판정한다. SIREN에는 **block(=그 workflow 안의 자리) 단위 recipient**만
   따로 둔다 — release 알림 대상이자 상세 slide 열람의 첫 번째 게이트다(04장 §3, §4). A/B/C
   전부 예외 없이 이 모델을 쓴다 — 한때 있었던 External/Attested(D)는 폐기했다(04장 §2, §6).
5. **Release는 산출물 단위 배송.** 부서마다 자기가 받을 산출물만 전달받는다. 이전 release 대비
   major 버전이 바뀐 것만 highlight하되, **안 바뀐 것도 알림은 같이 간다.**
6. **권한 필터가 전 시스템에 적용.** app bar의 Project/Workflow 목록은 권한 있는 것만 노출한다.
   Admin은 언제나 모든 권한을 갖는다.
7. **캔버스 편집은 단독 점유(lock).** TTL 10분, 편집 중이면 자동 갱신.
8. **전 화면 모션 도입.** iOS 계열의 spring 기반 전환을 시스템 전체에 일관되게 적용한다.

---

## 3. 확정 결정 요약

리뷰 시 이 표만 훑어도 무엇이 정해졌는지 알 수 있게 한 곳에 모았다. 상세는 각 장 참조.

### 3.1 과제(Project)

| 항목 | 결정 |
|---|---|
| 생성 시 입력 | 과제명, 과제 코드, Revision, Milestone (+ 표시 전용 부가 필드) |
| 과제 코드 · Revision | **생성 후 수정 절대 불가.** Edit Project Info에서 두 필드는 `disabled`. Admin에게도 동일 |
| Revision 형식 | `EVT` 고정 접두어 + 0 이상 정수 (`EVT0`, `EVT1`, …) |
| 코드 변경이 필요할 때 | Admin이 DB를 직접 수정한다. UI 경로는 만들지 않는다 |
| 과제 생성 권한 | Admin만 |
| Members 정책 | 기존 유지. 부서 세분화(IP 단위)는 데이터 값의 변화일 뿐 기능 변경 없음 |

### 3.2 Workflow

| 항목 | 결정 |
|---|---|
| 생성 자격 | 그 과제의 부서 중 **한 곳 이상에 속한 사용자** |
| 생성 시 부서 선택 | dropdown **항상 노출**. 후보는 **내가 속한 부서만**(Admin은 전체). 소속이 1개여도 dropdown 유지 |
| `unassigned` | **폐지.** 부서 없는 workflow는 존재할 수 없다 |
| Owner | 생성자 1명 고정. **위임·이양 불가** (요청이 올 수 있으므로 코드에 TODO 주석을 남긴다) |
| 생성 직후 권한 | 그 workflow의 부서가 **Edit Access에 자동 등록** |
| Settings 배치 | Name → Description → Department → **Save** (세로 1열) |
| Settings 저장 | 세 필드를 **단일 PATCH**로 저장 |
| Save 시 확인 | **항상 confirm.** Department가 바뀐 경우 주황색 warning 블록을 추가 표시 |
| Department 변경 권한 | **Edit Access 전원** |
| Department 변경 결과 | 기존 부서를 Edit Access에서 제거 → 새 부서를 Edit Access에 추가. **다른 부서·사용자·View Access는 그대로 둔다** |
| My Workflow · Edit Milestones · Design workflow · Schedule dashboard | 기존과 동일 (권한 필터만 새로 적용) |

### 3.3 권한 · 가시성

| 항목 | 결정 |
|---|---|
| Admin | 시스템 전체 super 권한. 별도 언급이 없어도 항상 모든 것을 보고 할 수 있다 |
| Project 노출 | `Project.members`에 등록된 사람만. **비멤버는 workflow URL 직접 접근도 차단** |
| Workflow 노출(app bar) | Owner ∪ Edit Access ∪ View Access |
| Information page | 권한 없는 workflow도 **목록에는 보이되 disabled**로 "권한 없음"을 표기. app bar option에서는 제외 |
| 부서 단위 권한 판정 | 조회 시점의 members 로스터를 **실시간 조회** (나중에 그 부서에 합류해도 자동 획득) |
| Edit·View 동시 등록 | **허용.** 실효 권한은 **항상 더 높은 Edit**으로 계산 (부서가 겹칠 수 있으므로) |
| workflow 부서의 Edit Access 항목 | **삭제 불가.** Admin도 불가. 부서 변경으로만 교체된다 |
| 개별 사용자 추가 | **전사 검색**(project member 여부 무관). KnoxID만 저장하고, 이름은 SDPCommonAPI로 조회해 한/영으로 표시 |
| 부서 다중 선택 | Edit/View Access, artifact recipient **모든 곳에서 여러 부서 등록 가능** |
| Owner의 부서 제약 | 기존 "Analog 부서만 Owner 가능" 규칙 **완전 폐지** |
| Workflow Settings 진입 | View 권한자는 진입 버튼 자체가 안 보인다(차단). 단 artifact 상세의 Recipient는 읽기 전용으로 볼 수 있다 |

### 3.4 캔버스

| 항목 | 결정 |
|---|---|
| 버전 개념 | **없음.** 모든 편집은 overwrite. 스냅샷도 찍지 않는다 |
| Edit / View가 보는 화면 | **완전히 동일**. 블록에 버전 숫자를 쓰지 않고, publish 상태 배지만 표시 |
| 동시 편집 | **lock으로 단독 점유.** TTL 10분, 편집 중 자동 갱신, 만료 후 자유 점유, Admin 강제 해제 |
| Lock의 범위 | **캔버스(blocks/edges/memos/layout)에만.** `Workflow` 문서의 `canvasLock` 필드만 원자적으로 갱신 |
| Schedule · Edit Information | **lock 대상 아님.** A가 캔버스를 편집 중이어도 B는 Name/Description/Phase를 동시에 바꿀 수 있다. 항상 latest overwrite |
| 새 Artifact 추가 | **버튼 1개**로 통합. 다이얼로그 첫 질문이 주는/받는(intent)이고, 이어서 Name/Phase/출처(OA Service·File Artifacts·HPC Service — 이제 give/receive 양쪽 다 이 3개뿐이다)를 고른다 — 04장 §6 |
| Flow 클릭 | 연결된 블록을 highlight → **confirm 후 삭제** |
| 편집 모드 표시 | 캔버스 배경색을 편집용으로 전환 (light/dark 각각) |
| 편집 중 잠금 | app bar를 제외한 **캔버스 밖 모든 액션 버튼 비활성** (앞으로 추가될 버튼 포함) |
| 저장 / 취소 | 둘 다 confirm 후 실행 |
| 필터 | **수신 부서 필터** 제공. tier 필터는 만들지 않는다 |

### 3.5 Artifact

| 항목 | 결정 |
|---|---|
| OA Service/File Artifacts/HPC Service(A/B/C) 권한 | **SIREN이 보관하지 않는다.** 그 서비스(Calypso 포함)가 매번 라이브로 canView/canEdit를 판정한다 — 셋 다 같은 규칙. Tier D 폐기 후 예외가 완전히 없어졌다 |
| OA Service/File Artifacts/HPC Service(A/B/C) recipient | SIREN이 **block(=그 workflow 안의 자리) 단위로 저장**. 같은 artifact도 workflow마다 recipient 구성이 다를 수 있다 — 셋 다 같은 규칙(옛 결정은 B/C/D를 artifact 단위로 뒀었는데, 여러 workflow가 동시에 고치면 꼬이는 문제가 있어 폐기했다) |
| File Artifacts(B)의 콘텐츠 종류 | **File(실물, 여러 개 가능) / OA-link(웹 링크 하나) / HPC-path(HPC망 경로 하나)** 중 등록 시 하나로 고정된다(04장 §2). 예전 Tier D(External/Attested — 실물도 판정할 서비스도 없던 tier)가 하던 역할을, 이제는 이 OA-link/HPC-path 콘텐츠가 대신한다 |
| Recipient 설정(편집) 권한 | workflow **Edit Access** (전 tier 동일 — 이제 A만의 예외가 아니다) |
| Recipients/Comments 탭 열람 | **workflow Edit Access가 있는 사람에게만** 노출된다(정책 변경) — View 권한자에게는 탭 자체가 없다. artifact 자체의 편집 권한이 있거나 block의 recipient로 등록돼 있어도 마찬가지다 |
| 상세 slide 열람 (A/B/C) | **그 서비스의 canView/canEdit 하나로만 정해진다, 3 tier 공통, 예외 없음**(정책 변경 — 예전엔 SIREN recipient를 먼저 통과해야 하는 2단 게이트였다). block.recipients는 이제 slide 열람에 관여하지 않는다 — release 알림 대상과 Recipients/Comments 탭 표시 대상일 뿐이다 |
| Mapping 범위 | block을 artifact에 매핑할 때, **같은 project(code+revision)의 artifact만** 후보로 나온다 |
| 버전 정보의 출처 | A/B/C 전부 **push event + 야간 전체 재동기화**로 SIREN이 직접 보관한다(07장). details·release 열람은 이 SIREN 캐시를 읽는다 — **canView/canEdit·html-view만 그때그때 라이브로** 그 서비스에 묻는다 |
| A/B/C 버전 보고 | 서비스는 **official한 버전만** SIREN에 전달. minor가 없는 snapshot형(RPM 등)은 release 버전 + `latest(+)` 하나만 |
| 미매핑 블록 | recipient UI를 감추고, release 대상에서 제외 |
| slide 내부 콘텐츠 | **TODO** — 이번 범위 밖. 대규모 개편 예정 |
| 주는/받는 산출물의 선택 범위 | **대칭 규칙** — 주는 쪽은 그 서비스의 edit 게이트, 받는 쪽은 view 게이트. OA Service/File Artifacts/HPC Service **셋 다 라이브 조회**하며, 이제 give/receive 양쪽 다 이 3개뿐이다(04장 §6) |
| 한 workflow 안 artifact 중복 매핑 | **금지.** 주는/받는 모두 — 같은 workflow의 두 block이 같은 artifact를 가리킬 수 없다(04장 §6.5) |

### 3.6 Release

| 항목 | 결정 |
|---|---|
| 대상 | tier 매핑이 끝난 산출물 **전체 자동 포함** (미매핑 블록·메모 제외) |
| Highlight | 이전 release 대비 **major(=publish) 버전이 달라진 것**만. minor는 비교하지 않는다 |
| Source 버전 선택 | **이전 release 대비 변경된(`changed:true`) 산출물만** 고른다. 변경 없는 산출물은 직전 release의 선택을 그대로 이어받아 다시 묻지 않는다. 선택 대상은 flow로 연결된 **직전 1홉** upstream. 기본값은 그 산출물의 **최신 published** |
| Source가 미발행일 때 | **release는 그대로 진행.** 해당 칸을 `없음(None)`으로 남기고, 받는 쪽에는 "아직 전달되지 않음"으로 표시 |
| 산출물 자체가 미발행일 때 | 동일하게 포함하고 `Not published`로 표기 |
| Release note | **release 전체에 1개.** 산출물별 publish note는 각 산출물이 관리하며 release에 복제하지 않는다 |
| 권한 | **Edit Access 전원** |
| 철회 / Revoke | **절대 불가.** 삭제도 불가 |
| 버전 표기 | **단일 정수 시퀀스** `v1, v2, v3 …` + 날짜 (major.minor 아님) |
| artifact별 타임라인 | 별도 목록이 아니라 **버전 트리 위에 `v{n}` 마커**로 표기 |
| 저장 범위 | 그 시점의 산출물 버전·경로·링크, 수신 부서, source 버전·경로·링크, 날짜, note, 실행자 등 **최대한 많이** |
| 캔버스 스냅샷 | **저장하지 않는다.** 재현도 하지 않고, 표(table) 형식 산출물 목록만 남긴다 |
| 알림 | 각 부서는 **자기가 받을 산출물만** 전달받는다. 변경이 없어도 알림은 간다 |
| History | ① workflow별 release 목록·상세 ② 부서별 필터 뷰 ③ artifact별 타임라인 — **3개 모두** |

### 3.7 UI

| 항목 | 결정 |
|---|---|
| 모션 | 전 화면(버튼·전환·팝업)에 iOS 계열 spring 전환을 일관 적용 |
| 구현 | `framer-motion` + `theme/motion.ts` 토큰 단일화 + `prefers-reduced-motion` 대응 |
| i18n | 시스템 언어가 영어면 모든 안내·경고 문구가 영어로 표기된다 |

---

## 4. 미결 · TODO

이번 설계 범위 **밖**이며, 이 개발이 끝난 뒤에 착수한다.

| # | 항목 | 메모 |
|---|---|---|
| T1 | Artifact 상세 slide 내부 콘텐츠 개편 | 대규모 수정 예정. 이번엔 권한·recipient 정책만 반영 |
| ~~T2~~ | ~~"받는 산출물" 추가 UX~~ | **완료.** "새 Artifact 추가" 다이얼로그가 intent(주는/받는) 선택 → 출처별 후보 pickability까지 반영한다 — 04장 §6. Tier D 자체를 폐기해 "D의 주는 쪽 인터페이스" 문제는 소멸했다 |
| T3 | 알림 전송 인프라 | 실제 메일 발송 + SIREN 내 "My workspace"·알림 페이지 신설 |
| T4 | B/C release 알림의 세분화 | view·edit 권한자 모두에게 알림, workflow 소속 부서에는 별도 notice — 규칙 구체화 필요 |
| ~~T13~~ | ~~"새 Artifact 추가" 다이얼로그 단일 목록 재구성~~ | **완료.** `ArtifactSourcePicker.tsx`가 admin이 등록한 OA/HPC Service와 Calypso(File Artifacts) 산출물을 하나의 목록으로 보여준다 — Service 항목은 펼치면 그 서비스의 실시간 후보가 안에 뜨고(§6.3 2단계 그대로), Calypso 항목은 바로 고를 수 있다. 리스트에 없으면 목록 맨 아래에서 이름만 입력해 새 File Artifact를 등록한다(무조건 Calypso로 할당, §6.4) |
| ~~T14~~ | ~~File Artifacts(Calypso) 받는 쪽 placeholder의 편집권~~ | **재확인 후 확정.** 받는 쪽이 매핑용으로 새로 등록한 artifact도 등록자가 그대로 편집 가능하다 — Calypso `computeAccess()`의 기존 규칙("등록자·Admin은 항상 edit")을 그대로 둔다(사용자 결정). 편집을 막는 별도 로직은 만들지 않기로 확정했다 |
| ~~T15~~ | ~~File Artifacts(Calypso) 다중 파일 다운로드/업로드 UI~~ | **완료.** 업로드는 `<input multiple>`로 여러 파일을 한 번에 보내고, 다운로드는 `GET .../download/:versionRef` 하나로 통일 — Calypso가 파일이 하나면 그대로, 여러 개면 zip(`archiver`)으로 묶어서 내려준다. FE는 파일 개수를 몰라도 된다 |
| ~~T16~~ | ~~File Artifacts(Calypso) OA-link/HPC-path 등록 UI~~ | **완료, 단 다이얼로그가 아니라 contents 화면에.** "새 Artifact 추가"는 이름만 받는 빈 artifact를 만들고, 그 artifact에 버전이 하나도 없을 때 `ArtifactVersionContents.tsx`(SIREN 슬라이드의 `CalypsoInlinePanel`과 Calypso 독립 페이지 `ArtifactDetailPage`가 공유하는 화면)가 File/Link(OA)/Path(HPC) 중 하나를 고르게 한다. 그 첫 버전 추가가 `Artifact.network`를 그 자리에서 확정하고, 이후로는 바뀌지 않는다(`calypso/src/artifacts/artifacts.service.ts#lockNetworkOnFirstVersion`) |
| T5 | Owner 이양 | 현재 불가. 요청이 오면 열 수 있도록 코드에 TODO 주석 유지 |
| T6 | OA Service/HPC Service 연동 서비스의 slide 차단 규칙 반영 | SIREN 쪽은 완료(그 서비스의 access 응답 하나로 판정, A/C 공통). 남은 것은 **각 서비스 쪽 `access` 구현**이다 — `prompts/rpm-access-endpoint.md` 를 그 서비스 세션에 전달 (HPC Service는 이제 A와 같은 라이브 게이트 대상이라, HPC 쪽에도 같은 요청이 추가로 필요하다) |
| T8 | 실 DB 마이그레이션 | 인메모리 모드는 시드가 새 스키마로 다시 만들어져 해당 없음. 실 DB 환경에서만 `prompts/db-migration-v3.md` 를 desktop 세션에 전달. **코드 변경 없이 데이터만 바꾸는 작업**이다 |
| T7 | Release Revoke | **열지 않기로 약속된 시나리오.** 요청이 와도 재논의 대상 |
| T9 | Hub sync 주기 구체화 | A/B/C 모두 **version 발행 이벤트를 즉시 SIREN에 전송**하고, 유실 대비로 작업 없는 야간 시간대에 **1일 1회 전체 재동기화**를 하기로 잠정 합의. 정확한 실행 시각·윈도우·재시도 정책은 추후 확정 |
| ~~T10~~ | ~~Tier B 자동 view 권한 부여 실패 시 재시도~~ | **폐기.** Calypso의 view가 기본적으로 project member 전원에게 열리도록 바뀌면서(`restrictView`, 04장 §3.1) release 시 자동 view 부여 규칙 자체를 없앴다(05장 §4.6) |
| ~~T11~~ | ~~기존 코드 주석의 Tier 명칭 일괄 치환~~ | Tier D 폐기 작업(04장 §2, §6) 때 `api/src/**`·`web/src/**`의 D 관련 주석·타입·분기를 전부 함께 정리했다. 내부 enum 값은 `'A'│'B'│'C'`로 줄었다. 나머지(§3.x cross-reference 번호 등) 잔여 정리는 필요해지면 별도로 |
| ~~T12~~ | ~~RPM 연동 prompt 문서 재발급~~ | **완료.** `prompts/rpm-and-mockdb-hub-v4-prompt.md`가 새 계약(code+revision 후보 조회, `externalArtifactId` 전역 유일성, version push 이벤트)과 mock/dev DB 정리를 함께 담아 대체한다. 구 `prompts/rpm-integration-prompt.md`·`prompts/siren-rpm-mapping-ui-prompt.md`는 폐기한 `ProjectServiceLink` 흐름 전제라 더 이상 안 맞으니 새 프롬프트를 쓴다 |

## 5. 리뷰가 필요한 가정

설계 중 명시 지시가 없어 **합리적 기본값으로 채운** 항목이다. 다르면 이 절만 고쳐 알려주면 된다.

| # | 가정 |
|---|---|
| P1 | 과제 생성은 Admin만 할 수 있다 |
| P2 | "내가 속한 부서"는 **그 과제의 members 로스터** 기준으로 판정한다(전사 소속이 아니라) |
| P3 | Artifact는 **과제(project) 단위로 스코프**되며, 같은 과제 안의 여러 workflow가 공유한다 |
| P4 | Project Manager는 milestone 편집 권한만 가지며, workflow 가시성 특혜는 없다 |
| P5 | 과제 생성 시의 "표시 전용 부가 필드"는 자유형 `meta` 한 칸으로 열어두고 실제 항목은 나중에 정한다 |
