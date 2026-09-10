# 06. UI · 모션 · 마이그레이션

## 1. 모션 시스템

### 1.1 목표

시스템의 **모든 이벤트 동작** — 버튼 클릭, 화면 전환, 팝업 등장/퇴장, 패널 열림, 탭 전환,
토스트, 리스트 정렬 변화 — 에 부드러운 전환을 일관되게 적용한다.
기준 감성은 **접히고 펼쳐지는 기기의 화면 전환** 같은, 관성이 살아 있는 spring 움직임이다.

### 1.2 구현

`framer-motion` 을 도입한다. 이유:
- spring 물리 기반 전환을 값으로 다룰 수 있다(감속 곡선을 손으로 흉내내지 않아도 된다).
- `layout` 프로퍼티로 위치·크기 변화를 자동 보간한다 — 캔버스 블록 재배치, 리스트 정렬 변화,
  패널 크기 변화에 그대로 쓸 수 있다.
- `AnimatePresence` 로 언마운트 애니메이션(다이얼로그 닫힘)을 처리한다. CSS만으로는 어렵다.

### 1.3 토큰 단일화

**컴포넌트마다 duration·easing을 직접 쓰지 않는다.** 전부 토큰을 참조한다.

```ts
// web/src/theme/motion.ts
export const MOTION = {
  // spring — 위치·크기가 움직이는 것
  panel:   { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 },  // 다이얼로그·슬라이드 패널
  block:   { type: 'spring', stiffness: 520, damping: 42, mass: 0.8 },  // 캔버스 블록 layout 변화
  press:   { type: 'spring', stiffness: 700, damping: 30 },             // 버튼 눌림
  // tween — 색·투명도처럼 물리감이 필요 없는 것
  fade:    { duration: 0.18, ease: [0.22, 0.61, 0.36, 1] },
  surface: { duration: 0.32, ease: [0.22, 0.61, 0.36, 1] },             // 캔버스 배경 전환 등
} as const;

export const REDUCED = { duration: 0 };   // prefers-reduced-motion 대체값
```

### 1.4 적용 규칙

| 대상 | 전환 |
|---|---|
| 다이얼로그 · 슬라이드 패널 | `MOTION.panel` — scale 0.96 → 1 + opacity, 배경 dim은 `fade` |
| 탭 전환 | 내용은 `fade`, 활성 인디케이터는 `layoutId` 로 미끄러지게 |
| 버튼 | hover는 `fade`, press는 `MOTION.press` 로 scale 0.97 |
| 캔버스 블록 이동 | 드래그 중에는 애니메이션 없음(직접 추종), 놓은 뒤 스냅만 `MOTION.block` |
| 캔버스 배경(편집 모드 전환) | `MOTION.surface` |
| 토스트 | 아래에서 올라오며 `MOTION.panel`, 사라질 때 `fade` |
| 리스트 정렬·필터 변화 | `layout` 프로퍼티로 자동 보간 |
| 페이지 전환(routing) | **방향성 전환.** 단순 fade가 아니라 §1.4.1 규칙을 따른다 |

### 1.4.1 페이지 전환 — 그냥 나타나지 않는다

라우팅이 바뀔 때 새 화면이 갑자기 뜨는 게 아니라, **어느 화면에서 어느 화면으로 가는지에 따라
방향이 있는 전환**을 쓴다. 책장을 넘기듯 "더 안으로 들어가는지" "더 밖으로 나오는지"가 느껴지게
하는 것이 목표다.

- 라우트마다 **깊이(depth)**를 매긴다 — 예: Home(0) → Project(1) → Workflow(2) →
  Artifact 상세(3). 정확한 트리는 실제 라우트 구조가 정해질 때 `web/src/router/routeDepth.ts`
  한 곳에 정의한다.
- 이동 직전/직후 경로의 depth를 비교해 **방향을 계산**한다.
  - **더 깊은 곳으로(forward)**: 새 화면이 오른쪽에서 들어오며 이전 화면은 왼쪽으로 살짝
    밀려나며 사라진다.
  - **더 얕은 곳으로(back)**: 정반대 방향 — 새 화면이 왼쪽에서 들어오고 이전 화면은
    오른쪽으로 밀려난다.
  - **같은 깊이(형제 전환, 예: 탭처럼 workflow A → workflow B)**: 방향 없이 `fade`만.
- 브라우저 뒤로가기/앞으로가기도 History API의 이동 방향을 읽어 같은 규칙을 적용한다 —
  사용자가 실제로 "뒤로 갔는지"와 화면이 밀리는 방향이 항상 일치해야 한다.
- 구현은 `framer-motion` 의 `AnimatePresence` + 방향을 실은 `custom` variant로 처리한다.
  ```ts
  // web/src/app/PageTransition.tsx (개념 스케치)
  const direction = depthOf(to) > depthOf(from) ? 1 : depthOf(to) < depthOf(from) ? -1 : 0;
  const variants = {
    enter: (d: number) => ({ x: d === 0 ? 0 : d * 24, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d === 0 ? 0 : d * -24, opacity: 0 }),
  };
  ```
- 실제 3D 종이 넘김 효과까지는 만들지 않는다 — **방향이 있는 슬라이드 + fade** 정도로 "책장을
  넘기는 감성"을 충분히 낼 수 있다. 과한 효과는 오히려 반응성을 해친다(전환은 200ms 내외).
- 이 규칙 하나로 시스템 전체 라우팅 전환에 일관되게 적용한다 — 화면마다 다른 전환을 만들지 않는다.

### 1.5 지켜야 할 선

- **`prefers-reduced-motion: reduce` 를 반드시 존중한다.** 훅 하나로 전역 처리한다.
  ```ts
  const t = usePrefersReducedMotion() ? REDUCED : MOTION.panel;
  ```
- **캔버스 드래그 중에는 애니메이션을 걸지 않는다.** 포인터를 그대로 따라가야 한다.
  놓는 순간의 스냅에만 spring을 쓴다.
- 블록이 수십~수백 개인 캔버스에서 `layout` 을 전부 켜면 느려진다. **뷰포트 안의 블록만** 애니메이션한다.
- 데이터 로딩 중 스켈레톤이 깜빡이지 않게, 200ms 미만 로딩에는 스켈레톤을 띄우지 않는다.

---

## 2. i18n

- 지원 언어: **한국어 · 영어.**
- **시스템 언어가 영어면 모든 안내·경고·확인 문구가 영어로 표기된다.** 한국어 문구를 하드코딩하지 않는다.
- 이번 개정에서 새로 추가되는 문구:

| 키 | ko | en |
|---|---|---|
| `workflow.departmentHint` | 이 workflow가 소속된 부서입니다. | The department this workflow belongs to. |
| `workflow.departmentChangeWarning` | 부서를 변경하면 이 workflow의 접근 권한이 달라질 수 있습니다. | Changing the department may change who can access this workflow. |
| `workflow.saveConfirm` | 변경한 내용을 저장하시겠습니까? | Save your changes? |
| `permissions.hint` | Workflow에 대한 편집 및 보기 권한 | Edit and view access for this workflow |
| `canvas.discardConfirm` | 변경한 내용을 모두 취소하시겠습니까? 되돌릴 수 없습니다. | Discard all changes? This cannot be undone. |
| `canvas.deleteFlowConfirm` | 이 연결을 삭제하시겠습니까? | Delete this connection? |
| `canvas.lockedBy` | {{name}}님이 편집 중 ({{remain}}) | {{name}} is editing ({{remain}}) |
| `project.codeImmutable` | 과제 코드와 Revision은 생성 후 변경할 수 없습니다. | Project code and revision cannot be changed after creation. |
| `project.noAccess` | 이 과제에 대한 접근 권한이 없습니다. | You do not have access to this project. |
| `artifact.published` | 발행됨 | Published |
| `artifact.notPublished` | 미발행 | Not published |
| `artifact.noAccess` | 이 산출물에 대한 접근 권한이 없습니다. | You do not have access to this artifact. |
| `artifact.noPublishedVersion` | 아직 publish된 버전이 없습니다. | No published version yet. |
| `release.confirm` | 이 내용으로 release하시겠습니까? release는 취소하거나 되돌릴 수 없습니다. | Release with these contents? A release cannot be revoked or undone. |
| `release.sourceNone` | 없음 | None |
| `release.notDelivered` | 아직 전달되지 않음 | Not delivered yet |

### 2.1 "UI 시스템 설명 문구 금지" 원칙의 조정

기존 README에는 **"UI에 시스템이 무엇인지·어떻게 동작하는지 설명하는 문구를 쓰지 않는다"** 는
원칙이 있었다. 이번 요구사항은 Department dropdown 아래와 Permissions 상단에 **안내 문구를
명시적으로 요구**한다. 따라서 원칙을 아래처럼 좁힌다.

> **조정된 원칙** — 시스템의 구조·아키텍처를 소개하는 문구는 여전히 금지한다.
> 다만 **컨트롤 하나가 무엇을 의미하는지 알려주는 짧은 라벨성 문구**는 허용한다
> (dropdown 아래 한 줄, 패널 상단 한 줄 수준). 문단 단위 설명은 여전히 `docs/` 와 `/guide` 에 둔다.

---

## 3. HLD 제거

**`hld` 라는 이름이 코드 어디에도 남지 않게 한다.** 현재 178곳에서 참조 중이다.

### 3.1 삭제할 파일

```
api/src/hld/                             모듈 전체 (controller/service/module/dto/schema)
web/src/api/hooks/useHld.ts
web/src/components/dialogs/HldReleaseDialog.tsx
```

### 3.2 참조를 끊어야 할 파일

```
api/src/app.module.ts                    HldModule 등록 해제
api/src/audit/schemas/audit-log.schema.ts   HLD_* 액션 상수 제거
api/src/common/common-access.module.ts
api/src/config/configuration.ts
api/src/database/database.module.ts / model-registration.ts
api/src/database/seed-data.ts / seed-runner.service.ts
api/src/hub/calypso-client.service.ts
web/src/api/queryKeys.ts
web/src/components/workflow/WorkflowHeader.tsx
web/src/lib/canvasModel.ts
web/src/pages/BoardPage.tsx / GuidePage.tsx
web/src/store/canvasStore.ts
web/src/theme/tokens.ts
web/src/types/domain.ts
```

### 3.3 확인 방법

```bash
# 아래가 0건이어야 작업이 끝난 것이다 (observer 계약 yaml 은 예외)
grep -rin "hld" --include=*.ts --include=*.tsx --include=*.json api/src web/src
```

i18n 리소스의 `hld.*` 키도 함께 제거한다.

---

## 4. 마이그레이션

개발 단계 데이터이므로 무겁게 가지 않는다.

### 4.1 폐기

| 컬렉션 | 처리 |
|---|---|
| `hldReleases` | **drop.** 새 release 모델로 옮기지 않는다 |
| `hubSyncCheckpoints` | drop |

### 4.2 변환

| 대상 | 방법 |
|---|---|
| `workflows.domain` → `department` | 값 복사. 빈 값이면 생성자 부서 → 그것도 없으면 project의 첫 부서 |
| `workflows.owners` → `ownerKnoxId` + `editAccess.users` | `owners[0]` 을 owner로, 나머지는 editAccess.users로 |
| `workflows.viewGrants` → `viewAccess.users` | `knoxId` 만. `department` 는 버린다 |
| `workflows.editAccess.departments` | `[department]` 로 초기화 |
| `deliverables` → `blocks` + `artifacts` | 문서 하나를 둘로 쪼갠다. 아래 §4.3 |
| `deliverables.versions[].isReleased` | → `artifacts.versions[].isPublished` |
| `projects.revision` | 형식에 안 맞는 값은 `EVT0` 으로 정규화하고 로그를 남긴다 |

### 4.3 `deliverables` 분해 규칙

```
같은 (serviceKey, externalArtifactId) 를 가진 deliverable 문서들
   → artifacts 1건으로 합친다 (versions는 최신순 병합, 중복 versionRef 제거)
serviceKey 가 null 인 문서
   → artifactId = null 인 blocks 로만 남긴다 (artifact를 만들지 않는다)
serviceKey 는 없고 sourceDept/sourceContact 만 있는 문서 (구 D 티어)
   → artifacts 1건을 tier 'D' 로 생성하고 이름을 그대로 쓴다
권한 초기값
   → artifacts.viewAccess.departments = 구 recvDept 가 있으면 [recvDept], 없으면 []
   → artifacts.editAccess.departments = 그 블록이 있던 workflow 의 department
```

### 4.4 실행

`MONGODB_URI` 가 비어 있으면 지금처럼 인메모리로 동작하며 시드가 새 스키마로 다시 만들어진다.
실제 DB를 쓰는 환경에서는 일회성 CLI 스크립트로 위 변환을 수행하고, 실행 결과(건수·실패 목록)를
표준출력에 남긴다. 스크립트는 **멱등**해야 한다(두 번 돌려도 같은 결과).

---

## 5. 개명 목록

혼동을 줄이기 위해 이름을 함께 정리한다.

| 기존 | 변경 | 이유 |
|---|---|---|
| `deliverables` (컬렉션·모듈) | `blocks` + `artifacts` | 자리와 실체의 분리 |
| `Deliverable` (타입) | `Block` / `Artifact` | 위와 동일 |
| `workflow.domain` | `workflow.department` | "설계 도메인" 개념은 이미 폐기됨 |
| `workflow.owners[]` | `workflow.ownerKnoxId` | Owner는 1명 |
| `workflow.viewGrants[]` | `workflow.viewAccess` | edit/view 대칭 구조로 |
| `isReleased` | `isPublished` | release/publish 용어 분리 |
| `hldReleases` | `releases` | HLD 폐기 |
| `HLD Release` (UI) | `Release` | 위와 동일 |

---

## 6. 구현 순서 제안

리뷰가 끝나면 이 순서로 착수하는 것을 권한다. 각 단계가 끝날 때마다 앱이 동작하는 상태를 유지한다.

| 단계 | 내용 |
|---|---|
| 1 | HLD 제거 + 개명(§3, §5). 기능 변경 없이 이름만 정리해 이후 diff를 읽기 쉽게 만든다 |
| 2 | 데이터 모델 개편 — `artifacts` 신설, `deliverables` 분해, 마이그레이션 스크립트 |
| 3 | 권한 모델 — 3계층 판정, app bar 필터, Information page disabled 렌더 |
| 4 | Workflow settings — 단일 PATCH, department 변경 + confirm/warning |
| 5 | Permissions 패널 — 부서 다중 + 사용자 다중, 고정 항목, SDPCommonAPI 이름 표시 |
| 6 | 캔버스 — lock, 편집 모드 배경/비활성화, flow 삭제 confirm, publish 배지, 수신 부서 필터 |
| 7 | Artifact — tier별 권한/recipient, 상세 slide 열람 판정, Recipient 탭 |
| 8 | Release — preview/실행/저장, 3개 history 뷰, 알림 인터페이스(stub) |
| 9 | 모션 — 토큰 정의 후 전 화면에 일괄 적용 |
