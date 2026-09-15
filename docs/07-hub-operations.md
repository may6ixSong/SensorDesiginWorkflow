# 07. Hub 운영 — Service Manage · 토큰 · Version 이벤트

> SIREN을 산출물의 **허브**로 만드는 장이다. 04장이 "누가 뭘 볼 수 있는가"를 다룬다면, 이 장은
> "그 데이터가 SIREN 안으로 어떻게 들어오는가"를 다룬다.

## 1. 원칙 두 가지

1. **SIREN FE는 각 서비스의 backend를 직접 호출하지 않는다.** 무조건 SIREN BE를 거친다 —
   File Artifacts(Calypso)도 예외가 아니다. 지금은 `web/src/api/calypsoClient.ts`가 브라우저에서
   Calypso를 직접 호출하는데, 이건 전부 SIREN BE의 프록시 엔드포인트로 옮긴다(§2).
2. **버전 메타데이터는 push event + 야간 재동기화로 SIREN이 직접 보관한다.** 열람 시점에
   그때그때 서비스에 묻는 건 **canView/canEdit·html-view뿐**이다(04장 §4.1, §7). 이 원칙은
   OA Service/File Artifacts/HPC Service(A/B/C) 공통이다.

---

## 2. FE → BE 단일 경로

| 지금(바꿔야 함) | 앞으로 |
|---|---|
| 브라우저가 `calypsoApi`(axios)로 Calypso를 직접 호출 (목록·업로드·릴리스·다운로드·editor/view grant) | SIREN BE가 같은 기능을 프록시하는 엔드포인트를 제공하고, FE는 그것만 호출 |
| FE가 knoxId/departments/actingAs 헤더를 직접 계산해서 실음 | SIREN BE가 이미 갖고 있는 actor/project 컨텍스트로 대신 계산해서 Calypso에 싣는다 — FE가 임의로 보낸 값을 신뢰하지 않는다 |
| 업로드/다운로드가 브라우저 ↔ Calypso 직결 | SIREN BE를 경유하는 스트리밍 프록시로 바꾼다 — 파일 전체를 메모리에 버퍼링하지 않는다 |

OA Service/HPC Service는 원래도 SIREN BE(`ObserverClientService`)를 통해서만 불렸으므로 이
변경의 영향이 없다.

---

## 3. Service Manage — OA Service / HPC Service 등록

App Bar → Admin 사용자 배지 → Service Manage. 화면을 **OA Service / HPC Service 두 공간으로
나눈다.** File Artifacts(Calypso)는 여기 등록하지 않는다 — SIREN 내장 기능이라 목록에 없다
(04장 §3.1).

### 3.1 등록 폼

| 필드 | 비고 |
|---|---|
| Service명 | 표시용 |
| Artifact명 | 이 baseURL(서비스)이 낼 수 있는 산출물의 **종류** — 한 서비스가 여러 종류를 낼 수 있으므로, **종류별로 따로 등록**한다(구 "Add artifact type" 방식 폐지) |
| Description | 표시용 |
| BaseURL | 이 서비스의 API 베이스 주소 |

**Tier 선택 필드는 없앤다** — 어느 공간(OA Service/HPC Service)에서 등록했는지로 이미
결정된다(OA Service → 내부값 A, HPC Service → 내부값 C). File Artifacts(B)는 이 화면 대상이
아니므로 여기서 고를 일이 없다.

### 3.2 토큰 + `artifactTypeKey` 발급 — 발급 주체가 다른 두 값

| 값 | 무엇을 가리키나 | 발급 주체 | 스코프 |
|---|---|---|---|
| **Bearer token** | 이 서비스(baseURL) 전체 | **SIREN이 등록 시점에 발급** | **baseURL당 1개.** 한 서비스가 artifact를 여러 개 등록해도 같은 토큰을 재사용한다 |
| **`artifactTypeKey`** | 등록한 그 "산출물 종류" 하나 | **SIREN이 등록 시점에 발급** — `serviceKey`를 `{8자리}_{슬러그}`로 자동 생성하는 것과 같은 방식 | Artifact 등록 하나당 1개. 한 baseURL에 여러 종류를 등록했으면, event를 보낼 때 이 값으로 "어느 종류인지" 밝혀야 한다 |
| **`externalArtifactId`** | 그 종류 안의 개별 산출물 **인스턴스** | **그 서비스가 발급** (SIREN은 모른다 — 그 서비스가 자기 데이터를 자기가 만든다) | 서비스 전체에서(project를 넘나들어) **유일해야 한다** — §4.3 참고 |

등록을 마치면 화면에 **토큰과 `artifactTypeKey`를 함께 보여준다** — 그 서비스 개발자가 자기
코드에 하드코딩해서 이벤트에 실어 보내면 된다.

### 3.3 baseURL 중복 처리

등록 시 백엔드가 baseURL을 정규화(scheme+host, 끝 슬래시 제거)해서 기존 서비스와 대조한다.

- **이미 등록된 baseURL이면** — 새로 입력한 Service명은 무시하고 **기존 Service명 + 기존
  토큰을 그대로 재사용**, 이번에 입력한 Artifact명만 새 `artifactTypeKey`로 그 서비스 밑에
  추가한다. 화면에는 "이 주소는 이미 `{기존 Service명}`으로 등록돼 있습니다. 같은 서비스가
  맞으면 계속 진행하세요"라고 확인만 시킨다(입력값이 달라도 막지는 않되, 반드시 인지시킨다).
- **처음 보는 baseURL이면** — 새 서비스 + 새 토큰을 발급한다.

이렇게 하지 않으면, 관리자가 실수로 이미 등록된 baseURL을 다른 Service명으로 다시 등록했을 때
토큰이 서로 다른 서비스인 것처럼 섞여 발급되는 사고가 날 수 있다.

### 3.4 토큰 인증과 폐기

- 서비스가 event를 보낼 때 `Authorization: Bearer {token}` 헤더로 자신을 증명한다. SIREN은
  토큰만 검증한다.
- **주소(요청 source) 매칭 같은 추가 장치는 두지 않는다** — HPC Service도 VM이라 어느
  네트워크에서 온 요청인지 SIREN이 구분할 수 없고, 그 외 방안(1회 노출, rate limit, audit
  log 등)도 지금 UX 상 도입하지 않기로 했다. **토큰 자체가 유일한 인증 수단**이다.
- 서비스를 Service Manage에서 **비활성화하면 그 토큰은 즉시 폐기**한다 — 비활성화된 서비스가
  계속 event를 보낼 수 있는 구멍을 남기지 않는다.

---

## 4. Version 발행 이벤트

### 4.1 인터페이스

모든 서비스가 **동일한 모양**으로 SIREN에 이벤트를 보낸다. 이 모양을 조금이라도 벗어나면
(필수 필드 누락·타입 불일치·정의 안 된 필드 포함) **그 요청 전체를 거부**한다 — 일부만
기록하는 부분 반영은 하지 않는다.

```ts
interface VersionPublishedEvent {
  /** Service Manage에서 SIREN이 발급한 값 — 어떤 종류의 산출물인지(§3.2) */
  artifactTypeKey: string;

  /** 그 서비스 안에서 이 산출물 인스턴스를 가리키는 값 — 서비스 전체에서 유일해야 한다(§4.3) */
  externalArtifactId: string;

  /** 화면 표시용 이름. 올 때마다 SIREN의 캐시된 이름을 이 값으로 갱신한다 */
  artifactName: string;

  /** 이 버전 엔트리를 마지막으로 갱신한 사람의 knox id */
  updatedUserId: string;

  /** 이 버전 엔트리가 그 서비스에서 마지막으로 갱신된 시각 (ISO 8601) */
  updatedAt: string;

  /** 표시용이자 사실상의 불변 참조 — 같은 artifact에서 절대 재사용하면 안 된다 */
  versionLabel: string;

  /** artifact를 받는 user가(view 권한) 볼 수 있는 버전인지 */
  isPublished: boolean;

  /** OA Service 전용. 없으면 null */
  viewUrl: string | null;

  /** HPC Service 전용 (vwp path). 없으면 null */
  path: string | null;
}
```

```ts
import { IsBoolean, IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

export class VersionPublishedEventDto {
  @IsString() @MinLength(1)
  artifactTypeKey: string;

  @IsString() @MinLength(1)
  externalArtifactId: string;

  @IsString() @MinLength(1)
  artifactName: string;

  @IsString() @MinLength(1)
  updatedUserId: string;

  @IsISO8601()
  updatedAt: string;

  @IsString() @MinLength(1)
  versionLabel: string;

  @IsBoolean()
  isPublished: boolean;

  @IsOptional() @IsString()
  viewUrl: string | null;

  @IsOptional() @IsString()
  path: string | null;
}
```

`whitelist: true` + `forbidNonWhitelisted: true`로 걸어서, 정의 안 된 필드가 섞여 와도
400으로 거부한다.

★ 필드 설계에서 뺀 것들과 그 이유:
- **`versionRef`(불변 참조)** — 안 둔다. 한번 찍힌 `versionLabel`은 그 artifact 안에서 절대
  재사용되지 않는다는 전제라, `versionLabel` 자체가 불변 참조를 겸한다.
- **`sourceRefs`(lineage 자기신고)** — 정책상 뺐다. 매번 source version을 서비스가 자기신고
  하게 하는 건 비현실적이라, **release 시점에 release를 실행하는 사람이 직접 입력**하는
  방식으로 대신한다(05장 §4.2).
- **`hasHtmlView`** — 이벤트에 실으면 발행 시점에 박제된다. 나중에 그 서비스가 html-view를
  뒤늦게 지원하게 되면 과거 버전들이 영영 `false`로 남는 문제가 있어 뺐다. 대신 버전 카드를
  전부 동일하게 클릭 가능하게 두고, 클릭 시점에 `html-view`를 라이브로 호출해 404면 그냥
  아무것도 그리지 않는다(observer 계약의 기존 동작 그대로, §5).
- **`code`/`revision`/`externalProjectId`** — 안 둔다. `externalArtifactId`가 서비스
  전체에서 유일하므로 project 식별을 따로 실을 필요가 없다(§4.3).

### 4.2 매칭·저장 규칙

```
event 수신 (Bearer token으로 serviceKey 확인)
  → (serviceKey, externalArtifactId)로 기존 Artifact 문서를 찾는다
      있다 → 버전 upsert (versionLabel 기준)
      없다 → 그냥 버린다. 기록하지 않는다.
```

- **아직 아무 workflow도 매핑한 적 없는 artifact의 event는 버린다.** 그 artifact를 나중에
  실제로 매핑하는 순간 전체 버전 이력을 한 번에 pull해 오므로(§4.4·04장 §6.3), 미리 쌓아둘
  이유가 없다. project가 아직 안 이어져 있는 상태에서 오는 event를 pending 큐에 보류하는 것보다
  훨씬 단순하다.
- **`externalArtifactId`는 그 서비스 전체에서(project를 넘나들어) 유일해야 한다.** 이게
  깨지면(예: project마다 1번부터 다시 매기는 id 체계) 서로 다른 project의 산출물이 같은 키로
  충돌한다 — 연동하는 모든 서비스가 지켜야 할 요구사항으로 명문화한다.

### 4.3 매핑 시 즉시 전체 버전 pull

workflow에서 artifact를 새로 매핑하거나 source를 바꾸는 그 순간, SIREN BE가 그 서비스의
observer 계약 `GET /artifacts/:id/versions`(기존 엔드포인트 — 새로 만들 필요 없음)를 한 번
호출해서 **결과를 통째로 그 Artifact의 버전 목록에 upsert**한다. 계약을 늘릴 필요는 없고,
SIREN 내부에 이 오케스트레이션만 새로 필요하다. A/B/C(OA Service/File Artifacts/HPC Service)
전부 동일하게 적용한다(04장 §6.3).

---

## 5. 열람 시점의 라이브 호출 — 엔드포인트 통일

details 열람·"새 Artifact 추가" 후보 목록에서 canView/canEdit·html-view는 캐시하지 않고
**그때그때 SIREN BE가 그 서비스에 라이브로 요청**한다(04장 §4.1, §7).

- 엔드포인트 모양은 서비스마다 **통일**하고 **baseURL만 바뀐다** — observer 계약
  (`observer-contract-v1.yaml`)의 `/artifacts/:artifactId/access`,
  `/artifacts/:artifactId/current-version`, `/artifacts/:artifactId/html-view` 그대로다.
- `artifactId`(path param)만으로 project까지 식별되므로(§4.3), 별도 project 파라미터를
  계약에 추가할 필요는 없다.
- "새 Artifact 추가" 다이얼로그의 후보 목록(`GET /artifacts?code=&revision=`)만 예외적으로
  project 필터(code+revision)를 쓴다 — 04장 §6.3 참고.

---

## 6. 야간 재동기화

event 유실에 대비해, 작업이 없는 야간 시간대에 하루 한 번 전체 artifact를 대상으로 `/versions`를
다시 pull해 SIREN 캐시와 맞춘다. 정확한 실행 시각·윈도우·재시도 정책은 아직 미정이다
(README §4 T9).

---

## 7. 이번에 함께 정리(제거)한 것

- **`ProjectServiceLink` 스키마·`GET /hub/services/:key/projects/search`·그 확정 UI** — project를
  미리 링크해 두는 단계를 없애고, 후보 조회마다 code+revision을 실시간으로 필터로 쓰는 방식으로
  바꿨다(04장 §6.3).
- **HPC Service의 "항상 잠김"/mock(`HpcPathMock`) 전용 처리** — HPC망 양방향 API 연동이
  확정되면서 OA Service와 동일한 라이브 게이트·event 대상이 됐다(04장 §2, §6.2, §6.3).
- **`Artifact.editAccess`/`viewAccess`(SIREN이 A/B/C 권한을 직접 보관하던 옛 모델)** —
  04장 §3 참고.

## 8. 명칭

내부 tier 값(A/B/C/D)은 DB에 그대로 남지만, 사람이 보는 이름은 **OA Service(A) / File
Artifacts(B) / HPC Service(C) / External·Attested(D)**로 통일한다. 이 문서와 앞으로 쓰는
모든 문서는 이 이름을 쓴다. 기존 코드 주석의 일괄 치환은 별도 작업이다(README §4 T11).
