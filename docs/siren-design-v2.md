# SIREN — 아날로그 산출물 릴리스 플랫폼 · 설계서 v2

> **문서 목적** — 목업(`analog-dashboard-v15.html`)에서 확정된 UI·정책을 기준으로, FE/BE를 분리한 독립 세션에서 실제 구현에 착수할 수 있도록 데이터 모델·정책·API 계약을 다시 정리한다.
> **v1 대비 주요 변경** — Phase는 프로젝트 공통 고정(수정 불가), 산출물 단위 위임 모델 폐지 → IP 레벨 권한(Edit/View) + 산출물 단위 전달 부서로 단순화, 산출물 다중 Release 일정(series), 캔버스 자유 배치(자동 밀어내기 제거) 등.
> **최종 수정** — 2026-08-12

---

## 1. 시스템 개요

### 1.1 정의
CIS(CMOS Image Sensor) 제품 개발 과정에서 **Analog 영역**이 프로젝트 공통 개발 단계(Phase)마다 생산·전달해야 하는 산출물을, IP 단위 캔버스 위에서 흐름(flow)으로 관리하고 버전·권한을 통제하는 시스템. 시스템명 **SIREN**.

### 1.2 범위
| 구분 | 포함 | 제외(향후) |
|---|---|---|
| 영역 | Analog | Digital, Pixel 등 |
| 파일 | Word/Excel 업로드, HPC 경로 등록 | 문서 본문 온라인 편집 |
| Phase | 프로젝트 공통 고정(현재 앱에서 수정 불가) | 프로젝트 설정 페이지에서 관리(별도 앱) |
| 부서 | 전사 공통 6개 고정 | 프로젝트별 담당자 매핑(향후 별도 프레임워크) |
| 테마 | Light | Dark(사용자 설정 기반) |

### 1.3 기술 스택 및 책임 분담

**핵심 원칙 — "대부분의 로직은 FE, BE는 저장과 접근 통제만"**

| 레이어 | 선택 | 책임 |
|---|---|---|
| FE | Vite + React 18 + TypeScript | 캔버스 렌더링·배치·줌/팬, Phase 계산, 위상정렬 기반 Auto Fit, HLD 버전 diff 계산, flow 하이라이트 탐색(BFS), 유효성 검사(1차) |
| BE | NestJS (TypeScript) + Mongoose | CRUD 영속화, **권한 재검증(필수)**, S3 presigned URL 발급, 버전 히스토리 append, 감사 로그 |
| DB | MongoDB | 문서형 구조(캔버스 좌표·버전 배열이 배열/서브다큐먼트로 자연스럽게 들어감) |
| Object Storage | S3 호환 | presigned URL, BE는 파일 바이트를 경유하지 않음 |
| 인증 | 사내 SSO 연동 전제 | 목업 단계는 사용자 스위처로 대체 |

> **중요한 보안 원칙** — "로직 대부분이 FE"라는 것은 **렌더링·배치·계산**의 이야기이지, **권한 판정**의 이야기가 아니다. 예를 들어 "IP 담당자만 minor 버전을 본다"는 규칙을 FE가 화면에서 숨기는 것과 별개로, BE API가 실제로 그 필드를 응답에서 제외해야 한다. FE의 `canEdit()`, `hasAccess()` 같은 판정 함수는 **UX용 게이트**일 뿐이며, 모든 쓰기 API와 민감 필드 응답은 BE Guard에서 **다시 검증**한다. 이 원칙은 절대 타협하지 않는다.

---

## 2. 용어

| 용어 | 정의 |
|---|---|
| **과제(Project)** | CIS 제품 개발 건. 예: `CIS-A7` |
| **IP** | Analog 영역의 설계 블록. 예: `PLL_MAIN` |
| **Phase** | 프로젝트 공통 개발 단계. **모든 IP에 동일하게 적용되며 IP별 커스터마이징 없음** (v1 대비 변경) |
| **산출물(Deliverable)** | 버전 관리 대상 문서/경로. 캔버스의 노드 |
| **메모(Memo)** | 버전 관리 대상이 아닌 설명용 블록 |
| **블록(Block)** | 산출물 ∪ 메모의 상위 개념 |
| **연결(Edge/Flow)** | 블록 간 흐름 선. 단방향 또는 양방향 |
| **Release 일정(Series)** | 한 산출물이 여러 Phase에서 반복 릴리스될 때의 인스턴스 묶음 (v1에 없던 개념) |
| **부서(Department)** | 전사 공통 6종 고정값: `Analog, Digital, APS, PI/PD, Solution, PTE` |
| **Edit 권한자(Owner)** | IP workflow 전체를 수정할 수 있는 사람. **반드시 Analog 부서** 소속만 가능. 최초 등록자가 대표 담당자 |
| **View 권한자** | IP workflow를 열람만 할 수 있는 사람. 모든 부서 가능하며, 부여 시 **포지션(부서)**을 함께 지정 |
| **전달 부서/담당자** | 산출물 단위로 지정하는, 그 산출물을 받는 부서와 개별 담당자 (Analog 제외 5개 부서 중 선택) |
| **HLD Release** | IP의 특정 시점 산출물 스냅샷(현재 설정된 산출물 전체 기준, 미릴리스분은 공란) |

---

## 3. 도메인 규칙

### 3.1 부서 체계 (전사 고정)
```
Analog · Digital · APS · PI/PD · Solution · PTE
```
- 이 6개는 코드 레벨 상수로 고정한다. 프로젝트별로 각 부서 담당자를 매핑하는 기능은 **범위 밖**(향후 별도 "프로젝트 설정" 프레임워크에서 처리, 이번 개발 범위 아님).
- `Analog`는 IP를 실제로 설계하는 부서이며, 산출물의 "전달 대상" 목록에서는 **항상 제외**된다(자기 자신에게 전달할 수 없으므로).

### 3.2 Phase 규칙 (v1 대비 대폭 단순화)
1. Phase는 **프로젝트 공통으로 전사/시스템 관리자가 정의**하며, 모든 IP에 동일하게 적용된다.
2. **이번 개발 범위에서는 Phase 추가/수정/삭제 기능을 제공하지 않는다.** IP 워크플로우 화면에는 Phase 편집 UI가 없다. (v1에 있었던 "IP 전용 Phase" 개념은 폐지)
3. Phase 관리는 향후 별도의 "프로젝트 설정" 화면/서비스에서 이뤄질 예정이며, 이번 시스템은 Phase를 **읽기 전용**으로 참조한다.
4. Phase 표준 세트(참고용, 실제 값은 프로젝트 설정에서 공급):
   ```
   KO → ML1 → AR → ML2 → ML3 → MDR → ML4 → FDR → MTO → Fab out
   ```
5. Phase는 `start`, `end` 날짜를 가지며, **캔버스 레인의 기본 폭**을 결정하는 기준이 되지만, 사용자가 편집 모드에서 레인 폭을 자유롭게 드래그 조절할 수 있다(레인 폭 조절은 순수 표시 옵션이며 Phase의 날짜 자체를 바꾸지 않는다).
6. 오늘 날짜가 포함된 Phase는 캔버스·스테퍼 양쪽에서 시각적으로 강조된다(배경색 + 외곽선).
7. `end`가 지나도 산출물 등록·수정은 차단되지 않는다.

### 3.3 IP 권한 모델 (v1 대비 재설계)

**2단 계층 — 개별 산출물 위임 없음**

| 권한 | 부여 대상 | 할 수 있는 일 |
|---|---|---|
| **Edit (owners)** | **Analog 부서 소속자만** | IP의 모든 산출물 생성/삭제/버전 업로드/Release, 캔버스 배치 편집, Flow 연결 편집, 전달 부서 지정 |
| **View (viewGrants)** | **전 부서 가능** (부여 시 포지션 지정) | IP의 모든 Released 버전과 캔버스를 조회. 작업중 minor 버전은 볼 수 없음 |

- `owners[0]`이 **대표 담당자**(이 IP workflow를 최초 구성한 사람)이며, 목록에서 항상 최상단에 표기된다.
- `viewGrants`에 사용자를 추가할 때 반드시 **포지션(부서)**을 함께 지정한다. 이 포지션이 산출물의 "전달 받을 부서" 후보 목록과 매핑되는 기준이 된다(정확한 자동 연동 로직은 8.2 참조).
- **IP에 Edit도 View도 없는 사용자에게는 그 IP가 목록에 노출되지 않는다.** 같은 Analog 조직 소속이어도 마찬가지.
- v1에 있던 "산출물 개별 edit/view 위임", "위임 depth 제한(재위임 규칙)" 개념은 전부 폐지되었다.

### 3.4 산출물의 전달 부서/담당자 (신규)
- 산출물(Deliverable) 개별로 `recvDept`(전달 받을 부서, Analog 제외 5개 중 하나 또는 미지정), `recvContact`(개별 담당자, 선택)를 지정한다.
- `recvContact` 후보는 **`recvDept`로 지정한 부서에 소속된 사용자** 중에서 고른다.
- Edit 권한자만 이 값을 수정할 수 있다.
- 향후 이 필드는 알림 발송(Release 시 전달 부서에 통보) 대상 결정에 사용될 예정.

### 3.5 버전 규칙 (v1과 동일, 변경 없음)
1. `major.minor` 두 자리. 업로드 = minor +1(최초는 `v0.1`), Release = major +1·minor 0.
2. 모든 버전 history 보존. Release는 산출물 개별 단위, **Edit 권한자만** 가능.
3. 가시성: Edit 권한자는 모든 버전을 본다. View 권한자를 포함한 그 외 전원은 **Released(major)만** 본다.

### 3.6 산출물 Release 일정 (Series) — 신규 개념
- 한 산출물이 **하나의 Phase에서 한 번만** 릴리스된다는 가정을 깨고, **여러 Phase에 걸쳐 반복 릴리스**될 수 있도록 한다.
- Edit 권한자가 산출물 상세에서 "Release 일정"으로 여러 Phase를 다중 선택하면, 각 Phase에 해당 산출물의 **인스턴스**가 하나씩 생성된다(`series` = 원본 id, `seriesIdx/seriesTotal` = 회차 표기).
- 인스턴스 생성 시 **최초 1회에 한해** 회차 순서대로 flow가 자동 연결된다(`auto:true` 플래그). 사용자가 이후 flow를 수동으로 바꾸면 그 상태를 그대로 유지하며, 자동 재정렬은 다시 일어나지 않는다.
- 일정을 줄이면(Phase 선택 해제) 해당 인스턴스와 관련 auto edge만 정리된다.

### 3.7 캔버스 배치 정책 (v1 대비 대전환)
- **자유 배치**: 블록을 드래그하면 그 블록만 이동한다. 다른 블록을 밀어내는 자동 충돌 회피는 **없다**(v1에서 있었던 "밀어내기" 정책은 폐지). 겹침이 허용된다.
- **Phase 소속 자동 갱신**: 드래그를 끝낸 위치의 x 좌표가 속한 Phase 레인으로, 그 블록의 `phase` 필드가 자동 갱신된다.
- **Phase 벽 저항**: 드래그 중 Phase 경계를 넘으려 하면 일정 이상(누적 50px)의 모멘텀이 필요하다 — 살짝 걸치면 튕겨 돌아오고, 강하게 밀면 경계를 넘어간다(경계선이 짧게 하이라이트).
- **Auto Fit(정리 기능)**: 사용자가 명시적으로 누를 때만 동작하는 별도 기능. 이때는 겹침을 허용하지 않고 위상정렬 기반 지그재그 배치를 수행한다(3.8 참조). 일반 드래그와는 알고리즘이 분리되어 있다.
- **Phase 레인 폭 조절**: 편집 모드에서 각 Phase 레인의 우측 경계를 드래그해 폭을 조절할 수 있다. 최소 폭은 "그 레인에서 가장 넓은 블록 + 좌우 여백" 이하로 줄일 수 없다.

### 3.8 Auto Fit 알고리즘
1. 해당 IP의 모든 산출물에 대해 flow 그래프를 **위상 정렬**한다(BFS, 순환은 뒤로 밀림).
2. 각 노드에 **flow-depth**(선행 산출물 depth의 최댓값 + 1)를 부여한다.
3. 같은 Phase 레인 안에서, depth가 짝수면 레인 왼쪽 정렬, 홀수면 `블록폭 × 0.55`만큼 오른쪽으로 오프셋 — **지그재그 배치**로 flow 화살표가 블록에 가려지지 않게 한다.
4. 레인 폭은 Phase 기간에 비례해 재계산한다(56일 이상 → 최대 3열, 28일 이상 → 2열, 미만 → 1열).
5. Auto Fit 결과 안에서만 같은 Phase 블록끼리 겹침을 8회 반복 패스로 해소한다(다른 Phase끼리는 검사하지 않음).

### 3.9 Flow(연결선) 규칙
- 라우팅은 **직교(수직/수평)만** 사용, 곡선 없음.
- **단방향**: 선행→후행 의존 표시. 화살표 하나.
- **양방향**: 두 산출물이 서로를 참조(예: 시뮬레이션 결과 ↔ 재추출 파일)할 때 지정. 렌더링 시 **양쪽 화살촉 + 선 중앙에 순환(refresh) 아이콘**을 배치한다. 아이콘은 배경·테두리 없이 주황색 선 자체로만 표현하며, **편집 모드에서는 숨김**.
- **조회 모드에서 블록 클릭 → flow 하이라이트**: 클릭한 블록 기준으로 **prev 방향은 prev만, next 방향은 next만** 계속 타고 가며 하이라이트한다(양방향을 섞어 훑지 않음). 예: A→B→C에서 B 클릭 시 A 이전은 prev만 추적, C 이후는 next만 추적. 하이라이트된 flow 선은 점선이 흐르는 애니메이션으로 표시하고(원래 실선은 옅게), 배경 클릭 시 해제된다.
- 하이라이트 상태에서 블록 위에 **"상세" 플로팅 버튼**이 나타나며, 이 버튼을 눌러야 상세 dialog가 열린다(단순 클릭으로는 dialog가 열리지 않음).

### 3.10 HLD Release
- 행 구성 기준은 **"현재 IP에 설정된 산출물 전체"** — 스냅샷에 있던 것만 보여주는 게 아니라, 지금 workflow에 있는 모든 산출물이 항상 행으로 나오고, 그 시점에 릴리스되지 않았던 산출물은 해당 셀들이 공란으로 표시된다.
- 컬럼: `Artifact`(망 배지 포함) / `Files/Path` / `Version` / `Released` / `Comment`. Phase·망 별도 컬럼은 없음(망은 Artifact 컬럼에 배지로 통합).
- 이전 HLD 대비 버전이 달라진 행만 **단일 하이라이트 색상**(변경 여부만 구분, 신규/제외 구분 없음)으로 표시.
- 행 클릭 시 캔버스에서 여는 것과 동일한 산출물 상세 dialog가 열리고, 닫으면 HLD로 복귀한다. 권한에 따른 major-only 뷰는 유지.
- HLD 자체도 버전(major)을 가지며, 상단에 릴리스 날짜·릴리스한 사람·Release Note를 표기한다.

### 3.11 망(Network) 구분 (v1과 동일)
| 값 | 저장 방식 | 다운로드 |
|---|---|---|
| `OA` | S3 실제 파일 | 가능 |
| `HPC` | `/vwp/...` 절대 경로 문자열만 | 불가, 경로 복사만 |

---

## 4. 데이터 모델 (MongoDB)

### 4.1 컬렉션 개요
```
users            사용자 (부서 고정값 참조)
projects         과제 (Phase는 참조만, 이 시스템에서 편집 안 함)
ips              IP (+ 권한: owners, viewGrants)
deliverables     산출물 (+ 버전, series, 전달 부서/담당자, 캔버스 좌표)
memos            메모 블록
edges            연결선 (양방향 플래그 포함)
hldReleases      HLD 스냅샷
auditLogs        감사 로그
```

### 4.2 departments (코드 상수, 컬렉션 아님)
```ts
const DEPARTMENTS = [
  { id: "analog",   name: "Analog" },
  { id: "digital",  name: "Digital" },
  { id: "aps",      name: "APS" },
  { id: "pipd",     name: "PI/PD" },
  { id: "solution", name: "Solution" },
  { id: "pte",      name: "PTE" },
] as const;
```
FE/BE 양쪽에 동일한 상수 파일을 공유(모노레포 `packages/shared` 또는 코드 중복 관리).

### 4.3 users
```json
{
  "_id": "ObjectId",
  "empNo": "12345678",
  "name": "김선우",
  "email": "sw.kim@example.com",
  "department": "analog",
  "isActive": true,
  "createdAt": "ISODate"
}
```

### 4.4 projects
```json
{
  "_id": "ObjectId",
  "code": "CIS-A7",
  "name": "50MP 모바일 CIS",
  "domain": "ANALOG",
  "phases": [
    { "key": "KO", "label": "Kick-off", "start": "2026-01-05", "end": "2026-02-16", "order": 0 }
  ],
  "status": "ACTIVE"
}
```
> `phases`는 **읽기 전용 참조**. 이번 시스템에는 이 필드를 쓰는 API가 없다(향후 별도 서비스가 채워 넣는다고 가정).

### 4.5 ips
```json
{
  "_id": "ObjectId",
  "projectId": "ObjectId",
  "name": "PLL_MAIN",
  "description": "메인 클럭 생성 PLL",
  "owners": ["ObjectId"],
  "viewGrants": [
    { "userId": "ObjectId", "department": "digital", "grantedAt": "ISODate" }
  ],
  "color": "#0c9a83"
}
```
- `owners[0]` = 대표 담당자. `owners`에 담긴 모든 유저는 반드시 `user.department === "analog"`(생성/추가 시 BE가 검증).
- `viewGrants[].department`는 부여 시점에 **명시적으로 지정**하는 값이며 `user.department`와 다를 수 있다(예: 실제 소속은 Digital이지만 이 프로젝트에서는 Solution 포지션으로 참여하는 경우 등). 검증 로직 없이 자유 입력.

### 4.6 deliverables
```json
{
  "_id": "ObjectId",
  "projectId": "ObjectId",
  "ipId": "ObjectId",
  "phaseKey": "ML3",
  "name": "Pre-layout 시뮬 결과",
  "docType": "excel",
  "network": "OA",
  "series": "ObjectId | null",
  "seriesIdx": 1,
  "seriesTotal": 3,
  "recvDept": "digital",
  "recvContact": "ObjectId | null",
  "layout": { "x": 640, "y": 44, "w": 160, "h": 82 },
  "versions": [
    {
      "major": 1, "minor": 2, "kind": "minor",
      "fileName": "PLL_prelay_sim_v1.2.xlsx",
      "storageKey": "cis-a7/pll_main/<id>/1.2/...",
      "hpcPath": null,
      "note": "SS/FF corner 재실행",
      "createdBy": "ObjectId",
      "createdAt": "ISODate"
    }
  ],
  "createdBy": "ObjectId",
  "createdAt": "ISODate",
  "updatedAt": "ISODate"
}
```
- `series`가 `null`이면 그 자신이 원본. 회차 인스턴스들은 `series`에 원본 `_id`를 담는다.
- `recvDept`는 `DEPARTMENTS`에서 `"analog"`를 제외한 값만 허용(BE 검증).
- `recvContact`는 지정 시 반드시 `user.department === recvDept`(BE 검증). *(운영 중 조직 이동 등으로 어긋날 수 있음 — 8.2 참조)*
- **더 이상 산출물 개별 `grants` 필드는 없다.** 접근 가능 여부는 전적으로 `ips.owners` / `ips.viewGrants`로 결정.

**인덱스**
```js
db.deliverables.createIndex({ ipId: 1, phaseKey: 1 })
db.deliverables.createIndex({ series: 1 })
```

### 4.7 memos
```json
{
  "_id": "ObjectId",
  "ipId": "ObjectId",
  "phaseKey": "ML2",
  "text": "디지털팀 CDC 검토 회신 후 착수",
  "layout": { "x": 640, "y": 344, "w": 160, "h": 68 },
  "createdBy": "ObjectId"
}
```
- Edit 권한자에게만 노출(View 권한자는 메모를 보지 않음).

### 4.8 edges
```json
{
  "_id": "ObjectId",
  "ipId": "ObjectId",
  "fromId": "ObjectId",
  "toId": "ObjectId",
  "bidirectional": false,
  "auto": false
}
```
- `bidirectional: true`이면 역방향 edge를 별도로 만들지 않고 이 한 문서로 양방향을 표현한다(FE가 렌더링 시 화살촉 2개 + 순환 아이콘으로 그림). *(구 목업은 역방향 edge를 별도 생성해 "존재하는 쌍"으로 양방향을 판정했다 — BE 스키마에서는 명시적 플래그로 단순화하는 편이 안전. 8.2 참조)*
- `auto: true` = series 자동 연결로 생성됨. 사용자가 수동으로 만들거나 수정하면 `auto`를 `false`로 내린다.

### 4.9 hldReleases
```json
{
  "_id": "ObjectId",
  "ipId": "ObjectId",
  "version": "2.0",
  "date": "2026-06-12",
  "releasedBy": "ObjectId",
  "note": "ML3 완료 · 회로/시뮬 결과 반영",
  "items": {
    "deliverableId1": { "version": "1.0", "file": "...", "at": "...", "comment": "..." }
  }
}
```
- `items`는 **그 시점에 Released 상태였던 산출물만** 담는다. 조회 시 FE가 "현재 산출물 전체 목록"과 `items`를 조인해 공란 행을 만든다(3.10 참조) — 이 조인은 FE에서 수행(BE는 원본 스냅샷만 저장).

### 4.10 auditLogs
```json
{ "_id":"ObjectId","actorId":"ObjectId","action":"VERSION_UPLOAD","targetType":"deliverable","targetId":"ObjectId","meta":{},"at":"ISODate" }
```
`action` 값: `DELIVERABLE_CREATE` `DELIVERABLE_DELETE` `VERSION_UPLOAD` `RELEASE` `IP_OWNER_ADD` `IP_OWNER_REMOVE` `IP_VIEW_GRANT_ADD` `IP_VIEW_GRANT_REMOVE` `RECV_UPDATE` `LAYOUT_UPDATE` `EDGE_ADD` `EDGE_DELETE` `HLD_RELEASE` `FILE_DOWNLOAD`

---

## 5. API 명세 (BE는 얇게, FE가 조립)

Base: `/api/v1` · 인증: `Authorization: Bearer <token>` · 응답: `{ data, meta? }`

### 5.1 조회
| Method | Path | 설명 |
|---|---|---|
| GET | `/projects` | 접근 가능한 과제 목록 |
| GET | `/projects/:id/phases` | 읽기 전용 Phase 목록 (다른 서비스가 관리) |
| GET | `/projects/:id/ips` | **Edit 또는 View 권한이 있는 IP만** 반환 |
| GET | `/ips/:ipId` | IP 상세 (owners, viewGrants 포함 — 권한별 필드 마스킹은 6.1 참조) |
| GET | `/ips/:ipId/deliverables` | 산출물 목록. **BE가 major/minor 가시성을 미리 필터링해서 응답** |
| GET | `/ips/:ipId/memos` | Edit 권한자만 200, 그 외 403 또는 빈 배열(정책 결정 필요 — 8.2) |
| GET | `/ips/:ipId/edges` | 연결선 목록 |
| GET | `/deliverables/:id/versions` | 가시성 규칙 적용된 버전 이력 |
| GET | `/ips/:ipId/hld-releases` | HLD 스냅샷 목록 |

### 5.2 IP 권한 관리 (Edit 권한자만)
| Method | Path | Body |
|---|---|---|
| POST | `/ips/:ipId/owners` | `{ userId }` — **BE가 user.department==="analog" 검증** |
| DELETE | `/ips/:ipId/owners/:userId` | 대표 담당자(`owners[0]`)는 삭제 불가 |
| POST | `/ips/:ipId/view-grants` | `{ userId, department }` |
| DELETE | `/ips/:ipId/view-grants/:userId` | |

### 5.3 산출물 CRUD (Edit 권한자만)
| Method | Path | Body |
|---|---|---|
| POST | `/ips/:ipId/deliverables` | `{ name, phaseKey, docType, network }` |
| PATCH | `/deliverables/:id` | `{ name?, docType?, network? }` |
| DELETE | `/deliverables/:id` | |
| PATCH | `/deliverables/:id/recv` | `{ recvDept, recvContact }` — **BE가 recvContact.department===recvDept 검증** |
| PATCH | `/deliverables/:id/schedule` | `{ phaseKeys: string[] }` — series 인스턴스 생성/삭제 + auto edge 재계산은 **FE가 계산해서 최종 상태를 통째로 PUT** (아래 5.5 참조) |

### 5.4 버전 / Release
| Method | Path | Body |
|---|---|---|
| POST | `/deliverables/:id/upload-url` | `{ fileName, contentType }` → presigned URL |
| POST | `/deliverables/:id/versions` | `{ storageKey \| hpcPath, fileName, note }` — minor +1 |
| POST | `/deliverables/:id/release` | `{ note? }` — Edit 권한자만, major +1 |

### 5.5 캔버스 (레이아웃/연결) — FE 계산 결과를 일괄 PUT
| Method | Path | Body |
|---|---|---|
| PUT | `/ips/:ipId/canvas` | `{ deliverables: [{id,layout,phaseKey}], memos: [...], edges: [...] }` |

> **설계 의도** — 드래그·Auto Fit·series 일정 변경은 모두 FE 메모리에서 완결된 계산이다. 매 픽셀 드래그마다 API를 부르지 않고, **편집 세션 종료 시(또는 몇 초 디바운스로) 최종 상태를 한 번에 PUT**한다. BE는 좌표 값의 최소 유효성(음수 아님, 문자열 길이 등)만 검사하고, 배치 로직 자체는 신뢰하고 저장한다. 단, `phaseKey`가 실제 프로젝트 Phase 목록에 존재하는지는 검증한다.

### 5.6 HLD
| Method | Path | Body |
|---|---|---|
| POST | `/ips/:ipId/hld-releases` | `{ note }` — BE가 현재 시점 Released 산출물을 스냅샷으로 저장 |

---

## 6. 권한 재검증 상세 (BE Guard)

### 6.1 응답 필드 마스킹
```ts
function toDeliverableDto(d: Deliverable, ip: Ip, me: User) {
  const isEdit = ip.owners.includes(me.id);
  const latest = d.versions[0];
  const released = d.versions.find(v => v.kind === 'major');
  return {
    ...pick(d, ['id','name','docType','network','phaseKey','layout','recvDept','recvContact']),
    releasedVersion: released ? pick(released, VERSION_FIELDS) : null,
    workingVersion: isEdit && latest?.kind === 'minor' ? pick(latest, VERSION_FIELDS) : null,
  };
}
```
- 이 변환 함수를 **모든 산출물 응답의 단일 통로**로 강제한다. 컨트롤러가 엔티티를 직접 반환하지 못하게 lint 규칙 또는 인터셉터로 막는다.

### 6.2 Guard 데코레이터
```ts
@IpAccess('edit')   // owners만
@IpAccess('view')   // owners 또는 viewGrants
```
- `deliverableId` 파라미터가 오는 라우트는 `deliverable.ipId → ip` 역추적 후 동일 Guard 적용.

### 6.3 memos 열람 정책 (결정 필요 — 8.2 참조)
- 목업은 "Edit 권한자만 메모를 본다"였다. View 권한자에게도 메모를 보여줄지는 실제 운영 요구에 따라 결정한다.

---

## 7. 구현 가이드

### 7.1 FE (Vite + React + TypeScript)

**상태 관리**
- 서버 상태: TanStack Query. 캔버스 편집 중에는 refetch 중단(`enabled: !isEditing`).
- 클라이언트 전용 상태(줌/팬, 편집모드, 선택/하이라이트, 드래그 중 좌표): Zustand 또는 `useReducer` 로컬 상태 — **서버에 보내지 않는 것과 보내는 것을 명확히 분리**.
- 편집 취소(Cancel) — 편집 진입 시 현재 상태를 JSON 스냅샷으로 메모리에 저장해두고, 취소 시 그대로 복원 후 재렌더. 서버에 아무것도 보내지 않았다면 이 취소는 API 호출 없이 끝난다.

**라우팅**
```
/                              → 접근 가능한 첫 과제/IP로 리다이렉트
/projects/:projectId/ips/:ipId → 보드 화면(메인)
/no-access                     → 권한 없음 안내
```

**컴포넌트 트리**
```
<AppShell>                  상단바: 과제/IP select, 사용자, 수신부서 시점 토글
  <IpHeader />               IP명, 담당자 chip(클릭→권한 dialog), HLD 버튼
  <PhaseStepper />           공통 Phase 읽기 전용 표시, Today 강조, 레인 폭 드래그 핸들
  <Canvas>
    <PhaseLanes />
    <EdgeLayer />            직교 라우팅, 양방향 순환 아이콘, 하이라이트 애니메이션
    <BlockLayer>
      <DeliverableNode />
      <MemoBlock />
    </BlockLayer>
    <FloatingToolbox />      편집모드 토글/취소/추가, 좌하단
    <TodayLine />
    <Legend />               우하단
  </Canvas>
  <DeliverableDialog />      개요 / 버전 이력 / 전달 3탭
  <IpPermissionDialog />
  <PhaseInfoDialog />
  <HldReleaseDialog />
</AppShell>
```

**핵심 클라이언트 로직 (BE로 보내지 않고 FE에서 완결)**
- Phase 레인 x좌표 계산(`laneG`), Today x좌표 보간(`todayX`)
- Auto Fit 위상정렬 + 지그재그 배치 (3.8)
- Flow 방향별 하이라이트 탐색 (3.9의 prev/next BFS)
- HLD 히스토리 diff(이전 버전 대비 변경 행 판정)
- 직교 경로(orth) 계산

**드래그 구현**
- `pointerdown/move/up` + `setPointerCapture`. HTML5 DnD API 사용 금지.
- 드래그 중 DOM `style.left/top` 직접 조작, `pointerup`에서 상태 커밋 1회.
- Phase 벽 저항은 누적 이동량(`accX`)을 드래그 세션 동안 추적해 판정.

**줌/팬**
- 캔버스는 `transform: translateX(panX) scaleX(zoom)` — **가로만** 스케일, 세로는 뷰포트 네이티브 스크롤에 위임.
- `minZoom = viewport.width / canvasContentWidth` 를 하한으로 clamp(캔버스가 뷰포트보다 좁아지지 않게).
- 휠 줌은 조회 모드에서만 활성화(편집 모드에서는 팬만 가능, 실수 방지).

### 7.2 BE (NestJS)

**모듈 구성**
```
src/
├── auth/            SSO 검증, JWT, CurrentUser
├── users/
├── projects/        Phase는 읽기 전용 프록시(다른 서비스 연동 시 교체)
├── ips/              owners/viewGrants 관리
├── deliverables/     CRUD, 버전, Release, recv 부서/담당자
├── canvas/           layout/memos/edges 일괄 PUT
├── hld/               HLD 스냅샷 생성/조회
├── storage/           S3 presigned URL
├── audit/
└── common/guards/     IpAccessGuard
```

**IpAccessGuard 핵심**
```ts
@Injectable()
export class IpAccessGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const level = this.reflector.get<'edit'|'view'>('ipAccess', ctx.getHandler());
    const ip = await this.resolveIp(req); // params.ipId 또는 deliverable→ip 역추적
    const me = req.user;
    if (level === 'edit') return ip.owners.includes(me.id);
    return ip.owners.includes(me.id) || ip.viewGrants.some(g => g.userId === me.id);
  }
}
```

**owners 추가 시 부서 검증**
```ts
async addOwner(ipId: string, userId: string) {
  const user = await this.users.findById(userId);
  if (user.department !== 'analog')
    throw new BadRequestException('Edit 권한은 Analog 부서 소속자만 가능합니다.');
  ...
}
```

---

## 8. 향후 확장 · 미결정 사항

### 8.1 로드맵
| 순번 | 항목 |
|---|---|
| 1 | 프로젝트 설정 페이지에서 Phase 정의/수정 (이번 시스템은 참조만) |
| 2 | 프로젝트별 부서-담당자 매핑 프레임워크 (별도 진행 예정, 이번 범위 아님) |
| 3 | 문서 온라인 수정 |
| 4 | 외부 시스템(PLM 등) 연동으로 산출물 자동 수집 |
| 5 | HPC 경로 유효성 검증(존재 여부, 최종 수정일) |
| 6 | Dark 모드 |
| 7 | Release 시 recvDept/recvContact 대상 알림 발송 |

### 8.2 결정 필요 (구현 착수 전)

1. **memos 열람 범위** — View 권한자에게도 메모를 보여줄지.
2. **recvContact와 실제 소속 어긋남** — 조직 이동 등으로 `recvContact.department !== recvDept`가 되는 경우, 주기적 정합성 체크를 할지 방치할지.
3. **양방향 edge 스키마** — 목업처럼 역방향 edge 두 개로 표현할지, 설계서 제안대로 `bidirectional` 플래그 하나로 단순화할지. 후자가 데이터 정합성상 안전하므로 **플래그 방식을 권장**.
4. **HLD와 series의 관계** — series 인스턴스 중 일부만 HLD에 포함되는 경우(예: series 3개 중 2개만 Release된 상태에서 HLD 생성) UI가 각 인스턴스를 별도 행으로 보여줄지, 하나로 합쳐 보여줄지.
5. **viewGrants의 department 자유 입력 검증** — 실제 `user.department`와 다르게 지정하는 것을 계속 허용할지, 아니면 실제 소속과 동일하게 강제할지.
6. **Phase 데이터 공급 방식** — "다른 서비스가 관리"라고 했는데, 이번 개발 단계에서 실제로는 어디서 가져오는지(하드코딩 seed / 다른 API 프록시 / 수동 DB 입력). 초기 개발 중에는 seed 스크립트로 고정값을 넣는 것을 권장.
7. **캔버스 PUT 디바운스 시간** — 몇 초 주기로 자동 저장할지, 아니면 편집 종료(저장 버튼) 시에만 보낼지.
8. **파일 크기 상한 / S3 보존 기간**.

---

## 9. 참조 파일

| 파일 | 설명 |
|---|---|
| `analog-dashboard-v15.html` | **UI 기준 목업(최신).** 색상 토큰, 레이아웃 상수, 상호작용의 정본 |

목업에서 직접 확인 가능한 것: 사용자 전환에 따른 IP 노출 차이, Edit/View 권한별 화면, Auto Fit 지그재그 결과, Phase 벽 저항, flow 방향별 하이라이트, HLD 다이얼로그의 diff 하이라이트, Today 인디케이터.
