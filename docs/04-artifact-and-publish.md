# 04. Artifact · Publish · Recipient

> **용어 확인** — 산출물이 자기 서비스 안에서 공식 버전을 확정하는 것이 **publish**다.
> workflow가 부서에게 전달하는 **release**(05장)와 혼동하지 않는다.

## 1. Artifact는 1급 실체다

예전에는 캔버스의 노드(`deliverables`)가 버전과 권한을 직접 들고 있었다. 이제 분리한다.

```
Block (캔버스 위의 자리)  ──artifactId──▶  Artifact (실체)
  · workflowId, phaseId                     · tier, 권한, recipient
  · layout                                  · publish 이력(versions)
  · intent                                  · 과제 단위로 공유
```

같은 artifact가 여러 workflow의 캔버스에 놓일 수 있고, 그때도 **권한과 버전 이력은 하나**다.
**(가정 P3 — artifact는 과제 단위로 스코프된다)**

---

## 2. Tier 정의

| Tier | 이름 | SIREN이 아는 것 | 전형적 대상 |
|---|---|---|---|
| **A** | Live | 버전·giver를 동기 조회. 서비스가 권한까지 판정 | Calypso, 계약을 맞춘 SimHub |
| **B** | Synced | 버전이 자동 갱신되나 이벤트 시점 기준 | HPC 생성 → 공용 DB 경유 |
| **C** | Linked | 자동 갱신 없음. 링크만 있고 버전은 사람이 입력 | 시스템은 있으나 미연동 |
| **D** | Attested | 시스템 자체가 없음. 출처를 자유 텍스트로 기록 | 팀·회사 밖에서 생성 |

- **망(`network: OA | HPC`)은 tier와 직교하는 별개 축이다.** HPC면 실물 파일 대신 경로 문자열만
  갖는다는 규칙이 A~D 어디에나 겹쳐 적용된다.
- **tier는 산출물이 아니라 버전 엔트리의 속성이다.** 나중에 실연동이 붙어도 과거 수동 기록을
  고치거나 옮기지 않는다 — 다음 엔트리가 다른 tier로 찍힐 뿐이다. 따라서 tier 승격에
  마이그레이션 로직이 필요 없다.
- 버전 개념이 없는 HPC 경로형 산출물은 `versionLabel = 경로(또는 basename)`,
  `versionRef = "{path}@{registeredAt}"` 을 대체값으로 쓴다.

---

## 3. 권한과 Recipient — Tier에 따라 소유자가 다르다

이번 개정의 핵심 정책이다.

| | **A Tier** | **B / C / D Tier** |
|---|---|---|
| Edit / View 권한 | **그 서비스**가 관리 | **SIREN**이 artifact 단위로 보관 |
| SIREN에서 권한 편집 | 불가 | 가능 (B는 Artifact page에서 하는 것이 정석) |
| Recipient | **SIREN에 별도 저장** | **View 권한 목록이 곧 recipient** |
| Recipient와 접근 권한의 관계 | **완전히 무관.** 순수 알림 대상 | 동일한 목록 |

### 3.1 왜 A Tier만 다른가

A Tier는 그 서비스가 자기 권한 체계로 versioning·열람을 통제한다. SIREN이 그 체계에 개입하면
서비스와 강한 의존이 생긴다. 그래서 **SIREN은 A Tier의 권한에 손대지 않고**, 대신 release 시
알림을 받을 대상만 따로 들고 있는다.

> **A Tier의 recipient는 어떤 접근 권한도 부여하지 않는다.** "release 알림을 받을 부서/사용자"
> 그 이상도 이하도 아니다. 실제 열람 가부는 그 서비스가 판정한다.

### 3.2 B/C/D는 View = Recipient

별도 recipient 필드를 두지 않는다. `viewAccess` 가 단일 진실이고, 화면에는 recipient로 보여준다.

- 응답 DTO는 `recipients = viewAccess` 로 채워 내려준다(FE가 tier별 분기를 하지 않도록).
- 단 **편집은 `viewAccess` 를 통해서만** 가능하다. `PUT /artifacts/:id/recipients` 는 A만 받는다.

### 3.3 Recipient 설정 권한

- 현재: **workflow의 Edit Access 전원**.
- 향후: A Tier 산출물을 실제로 연동할 때는 **그 A Tier 서비스의 edit 권한자만** 설정할 수 있게
  좁힌다. 지금은 그 판정을 물어볼 곳이 없으므로 workflow Edit Access로 둔다.
  ```ts
  // TODO: A Tier 서비스 연동이 붙으면, observer 의 access 응답에서 canEdit 를 받아
  //       recipient 편집 권한을 그 값으로 대체한다.
  ```

### 3.4 다중 선택

**부서는 어디서든 여러 개 넣을 수 있다.** recipient도, artifact의 edit/view도, workflow의
edit/view도 전부 `departments: string[]` 이다. 개별 사용자도 마찬가지로 다중이다.

---

## 4. 상세 slide 열람 규칙

판정 로직은 [01-permissions.md §4.2](01-permissions.md)에 있다. 화면 관점에서 다시 정리한다.

### 4.1 A Tier

```
열린다  ← workflow Edit Access 보유자
열린다  ← 그 artifact의 recipient(부서 또는 개인)에 속한 사람
막힌다  ← 그 외 전원
```

**서비스에 view 권한이 있어도 SIREN의 recipient가 아니면 slide 자체가 열리지 않는다.**
이건 기존 설계에서 바뀐 부분이다. 연동 서비스 측 대응이 필요할 수 있어
[prompts/a-tier-recipient-integration.md](prompts/a-tier-recipient-integration.md)로 전달한다.

### 4.2 B / C / D Tier

```
열린다  ← 그 artifact의 editAccess 또는 viewAccess에 해당하는 사람
막힌다  ← 그 외 전원 (workflow Edit Access가 있어도 막힌다)
```

실무적으로는 artifact 권한도 부서 단위로 넣기 때문에, workflow Edit Access가 있으면 대개
artifact 권한도 같이 갖게 된다. 그래도 판정의 근거는 artifact 권한이다.

### 4.3 "권한 없음" 과 "아직 publish 없음" 은 다른 화면이다

| 상황 | 화면 |
|---|---|
| 열람 권한 없음 | slide를 열지 않는다. 캔버스에 머무르며 "접근 권한이 없습니다" 토스트 |
| 열람 권한 있음 · published 버전 0개 | slide는 열리고, 버전 목록에 **"아직 publish된 버전이 없습니다"** |

이 둘을 절대 같은 문구로 처리하지 않는다.

### 4.4 slide 내부 콘텐츠

**이번 범위 밖이다(TODO T1).** 대규모 개편이 예정되어 있다. 이번에는 아래만 반영한다.

- Recipient 탭의 신설/개편 (§5)
- 권한에 따른 열람 차단 (§4.1, §4.2)
- 버전 목록의 `published` / `not published` 표기 (용어 통일)

---

## 5. Recipient 탭

artifact 상세 slide 안의 탭 하나로 둔다.

| 열람자 | 표시 |
|---|---|
| workflow Edit Access (A Tier) | 편집 가능 — 부서/사용자 추가·삭제 |
| B/C/D artifact Edit Access | 편집 가능 — 실제로는 `viewAccess` 를 편집하는 것 |
| View 권한자 | **읽기 전용으로 노출.** 누가 받는지는 볼 수 있고, 추가/삭제 버튼이 없다 |
| 미매핑 블록 | **탭 자체를 감춘다** |

- View 권한자에게 열어주는 이유: 그건 workflow 설정이 아니라 산출물 정보이고, 별도의 view 권한
  근거가 있기 때문이다. **A Tier여도 읽기 전용 열람은 허용한다** — 서비스 권한은 그 서비스가
  차단하므로 SIREN이 이중으로 막을 이유가 없다.
- 부서 후보는 `Project.departments`, 개별 사용자는 전사 검색(KnoxID 또는 이름).
- 사용자 표시는 KnoxID 저장 + SDPCommonAPI 이름 조회(한/영).

---

## 6. 받는 산출물의 선택 가능 범위 ★정책 확정, UI는 TODO★

캔버스의 "새 Artifact 추가"는 지금 **주는 산출물만** 만든다(03장 §5.2). 하지만 받는 산출물을
만들 때의 **선택 가능 범위 규칙은 이미 확정되어 있으므로** 여기에 남긴다. TODO T2에서 UI를 붙일 때
이 규칙을 그대로 구현한다.

받는 산출물은 사용자가 **artifact를 직접 고르거나, 서비스에서 골라온다.** 그때 후보로 나올 수 있는
범위는 tier마다 다르다.

| Tier | 후보에 나오는 조건 |
|---|---|
| **A** | 내가 **그 서비스의 view 권한**을 갖고 있는 artifact만 |
| **B** | 주는 쪽 artifact의 **편집 권한자가 나에게 view 권한을 준 것**만 |
| **C** | 주는 쪽 artifact의 **편집 권한자가 나에게 view 권한을 준 것**만 |
| **D** | **자유롭게 추가 가능** (시스템 밖 출처이므로 검증할 대상이 없다) |

### 6.1 해설

- **A** — SIREN은 그 서비스의 권한을 모른다. 후보 목록을 만들 때 observer의 `access` 엔드포인트로
  `canView` 를 물어보고, true인 것만 노출한다.
- **B/C** — SIREN이 권한을 들고 있으므로 `artifact.viewAccess` 에 내가 포함되는지로 판정한다.
  즉 **주는 쪽이 먼저 나에게 view 권한을 열어줘야** 내 캔버스에 그 산출물을 놓을 수 있다.
  받는 쪽이 임의로 남의 산출물을 끌어다 놓을 수 없다는 뜻이다.
- **D** — 실체가 SIREN 밖에 있고 검증할 시스템이 없으므로 제한하지 않는다.

### 6.2 API

```
GET /artifacts/pickable?projectId=&tier=
→ 위 규칙으로 필터된 목록.  A Tier는 observer access 조회 결과가 포함되므로
  응답이 느릴 수 있다 — 서비스별로 병렬 조회하고, 실패한 서비스는 목록에서 빼되
  "일부 서비스를 조회하지 못했습니다" 를 함께 내려준다.
```

---

## 7. 버전 가시성

| 열람자 | 볼 수 있는 버전 |
|---|---|
| 그 산출물의 **giver**(= artifact Edit 권한자, A는 서비스 판정) | 전체 (미발행 working 포함) |
| 그 외 **전원** (recipient 포함) | `isPublished: true` 인 버전만 |

- 이 판정은 **산출물 하나하나마다** 이뤄진다. 같은 캔버스 안에서 노드 A는 전체가 보이고 노드 B는
  published만 보이는 상태가 동시에 존재한다.
- BE는 응답 조립 시 **단일 통로 함수**(`toArtifactDto()`)에서 마스킹한다. FE가 숨기는 것으로는 부족하다.
- A Tier의 상세 slide는 열 때마다 그 서비스에 라이브 조회한다(캔버스 렌더링은 조회하지 않는다).

---

## 8. `isReleased` → `isPublished` 개명

용어 통일(README §1)에 따라 데이터·코드·화면 문구를 전부 바꾼다.

| 위치 | 변경 |
|---|---|
| 스키마 필드 | `isReleased` → `isPublished` |
| observer 계약 | `observer-contract-v1.yaml` 의 필드명은 **그대로 둔다**(외부 계약이라 함부로 못 바꾼다). SIREN 쪽 어댑터에서 매핑한다 |
| i18n 키 | `artifact.released` → `artifact.published` |
| 화면 문구(ko) | "릴리즈됨" → "발행됨", "미릴리즈" → "미발행" |
| 화면 문구(en) | "Released" → "Published", "Not released" → "Not published" |

> 어댑터 매핑 지점 — `api/src/hub/observer-client.service.ts` 에서 외부 응답의 `isReleased` 를
> 내부 모델의 `isPublished` 로 옮기고, 그 한 줄에 이유를 주석으로 남긴다.
