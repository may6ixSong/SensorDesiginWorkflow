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
| [04-artifact-and-publish.md](04-artifact-and-publish.md) | Tier A~D, publish, recipient, 상세 slide 열람 |
| [05-release.md](05-release.md) | Release 절차, 알림, Release history |
| [06-ui-motion-and-migration.md](06-ui-motion-and-migration.md) | 모션 시스템, i18n, HLD 제거, 마이그레이션, TODO |
| [prompts/a-tier-recipient-integration.md](prompts/a-tier-recipient-integration.md) | A Tier 연동 서비스에 전달할 변경 요청 프롬프트 |

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
| **Tier** | 산출물의 연동 신뢰도 A~D (04장) |
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
3. **Artifact가 1급 실체로 승격.** B/C/D 산출물의 Edit/View 권한은 **artifact 단위로 SIREN이
   보관**하고 여러 workflow가 공유한다. Block은 그 artifact를 가리키는 자리다.
4. **Recipient 개념 신설.** B/C/D는 artifact의 View 권한이 곧 recipient다. A Tier는 서비스가
   권한을 관리하므로, SIREN에 **알림 전용 recipient**를 따로 둔다.
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
| 새 Artifact 추가 | **버튼 1개**로 통합. 내가 주는 산출물 기준으로만 생성 (받는 산출물 UX는 TODO) |
| Flow 클릭 | 연결된 블록을 highlight → **confirm 후 삭제** |
| 편집 모드 표시 | 캔버스 배경색을 편집용으로 전환 (light/dark 각각) |
| 편집 중 잠금 | app bar를 제외한 **캔버스 밖 모든 액션 버튼 비활성** (앞으로 추가될 버튼 포함) |
| 저장 / 취소 | 둘 다 confirm 후 실행 |
| 필터 | **수신 부서 필터** 제공. tier 필터는 만들지 않는다 |

### 3.5 Artifact

| 항목 | 결정 |
|---|---|
| B/C/D 권한 | **SIREN이 artifact 단위로 보관**하고 여러 workflow가 공유한다 (Calypso/HPC처럼 중앙 관리되므로) |
| B/C/D recipient | **View 권한 목록이 곧 recipient.** artifact 하나에 붙어 모든 workflow에 동일하게 적용 |
| A Tier 권한 | 그 서비스가 관리한다. SIREN은 실제 데이터 접근에 관여하지 않는다 |
| A Tier recipient | SIREN이 **block(=그 workflow 안의 자리) 단위로 저장**. 같은 artifact도 workflow마다 recipient 구성이 다를 수 있고, edit/view 두 단계로 나뉜다 |
| Recipient 설정(편집) 권한 | workflow **Edit Access** (향후 A Tier 서비스의 edit 권한자로 좁힐 예정) |
| Recipient 탭 열람 | View 권한자에게 **읽기 전용**으로 노출 |
| 상세 slide 열람 (A) | **2단 게이트.** ① SIREN recipient(edit/view)에 속하는가 → ② 그 서비스에서 view 권한이 있는가(라이브 조회). 둘 다 통과해야 열린다. **workflow Edit Access만으로는 더 이상 열리지 않는다** |
| 상세 slide 열람 (B/C/D) | 그 artifact의 Edit/View 권한이 있어야 열린다. **workflow Edit Access만으로는 열리지 않는다** |
| Mapping 범위 | block을 artifact에 매핑할 때, **같은 project(code+revision)의 artifact만** 후보로 나온다 |
| A Tier 버전 보고 | 서비스는 **official한 버전만** SIREN에 전달. minor가 없는 snapshot형(RPM 등)은 release 버전 + `latest(+)` 하나만 |
| 미매핑 블록 | recipient UI를 감추고, release 대상에서 제외 |
| slide 내부 콘텐츠 | **TODO** — 이번 범위 밖. 대규모 개편 예정 |
| 받는 산출물의 선택 범위 | A = 그 서비스의 view 권한 보유 · B/C = 주는 쪽 편집 권한자가 view 권한을 준 것만 · D = 자유 (UI는 TODO T2) |

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
| T2 | "받는 산출물" 추가 UX | 지금은 버튼 1개(주는 산출물)로 통합. 데이터의 `intent` 필드는 살려둔다. **선택 가능 범위 정책은 이미 확정**되어 있다 — 04장 §6 |
| T3 | 알림 전송 인프라 | 실제 메일 발송 + SIREN 내 "My workspace"·알림 페이지 신설 |
| T4 | B/C/D release 알림의 세분화 | view·edit 권한자 모두에게 알림, workflow 소속 부서에는 별도 notice — 규칙 구체화 필요 |
| T5 | Owner 이양 | 현재 불가. 요청이 오면 열 수 있도록 코드에 TODO 주석 유지 |
| T6 | A Tier 연동 서비스의 slide 차단 규칙 반영 | `prompts/a-tier-recipient-integration.md` 참조 |
| T7 | Release Revoke | **열지 않기로 약속된 시나리오.** 요청이 와도 재논의 대상 |

## 5. 리뷰가 필요한 가정

설계 중 명시 지시가 없어 **합리적 기본값으로 채운** 항목이다. 다르면 이 절만 고쳐 알려주면 된다.

| # | 가정 |
|---|---|
| P1 | 과제 생성은 Admin만 할 수 있다 |
| P2 | "내가 속한 부서"는 **그 과제의 members 로스터** 기준으로 판정한다(전사 소속이 아니라) |
| P3 | Artifact는 **과제(project) 단위로 스코프**되며, 같은 과제 안의 여러 workflow가 공유한다 |
| P4 | Project Manager는 milestone 편집 권한만 가지며, workflow 가시성 특혜는 없다 |
| P5 | 과제 생성 시의 "표시 전용 부가 필드"는 자유형 `meta` 한 칸으로 열어두고 실제 항목은 나중에 정한다 |
