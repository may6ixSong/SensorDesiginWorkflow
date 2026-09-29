# 10. Auto Run — node trigger로 산출물 자동 생성 요청

> workflow의 node에 trigger를 걸어 두면, 그 node로 흘러 들어오는 source 산출물이 새로 publish됐을 때
> SIREN이 그 node의 artifact 서비스에 **"이 source들로 만들어 달라"**는 trigger를 보낸다. 서비스가
> 무언가를 만들어 새 버전을 발행하면 그 버전이 다시 SIREN에 들어오고, 그게 또 다른 node의 source라면
> 다음 trigger가 이어진다.
>
> 서비스 쪽에서 구현할 API(trigger 수신·상태 콜백)는 [08장 §1.6, §2.3](08-service-integration.md)에 있다.
> 이 장은 **SIREN 안에서 무엇을 언제 어떻게 판정하는가**를 다룬다.

## 1. 역할 분담 — SIREN이 하는 일은 여기까지다

| SIREN | 그 artifact 서비스 |
|---|---|
| trigger 조건을 평가한다 | trigger를 받아 무엇을 만들지 정한다 |
| trigger에 source 목록·버전·위치(baseUrl, HPC path, Calypso 다운로드 토큰)를 실어 보낸다 | 필요한 데이터를 source 서비스에서 **직접** 가져온다 |
| 진행/성공/실패 콜백을 받아 기록하고 캔버스에 보여준다 | 진행 상태를 콜백한다 |
| 성공/실패를 workflow owner에게 알린다 | 버전을 바로 발행할지, temporary로 두고 사용자 확인을 받을지는 **서비스가 정한다** |
| — | 발행하면 평소처럼 `version-published` 이벤트를 보낸다(`triggerRunId` 포함) |

- **release는 언제나 사람이 한다.** Auto Run은 publish(서비스 안의 버전 확정)까지의 이야기이고,
  release(부서 전달)와는 무관하다.
- SIREN은 source 데이터를 대신 옮기지 않는다 — 어디 있는지와 받아갈 권한(Calypso 토큰)만 준다.

---

## 2. 누가 Auto Run을 지원하는가 — Service Manage

- Service Manage에서 **artifact 종류(`artifactTypeKey`) 단위**로 `Supports Auto Run`을 켠다. 등록할 때
  체크하거나, 카드의 종류 행에 있는 `Auto Run on/off` 칩으로 언제든 바꾼다(Admin).
- 켠다는 건 **그 서비스가 `POST {baseUrl}/auto-run/triggers`를 이미 구현했다**는 약속이다. 구현 전에
  켜면 trigger가 404로 실패한다.
- **Calypso(File Artifacts)는 지원하지 않는다.** 개발 검증용 probe만 예외다(§9).
- 외부(사내 운영 서비스가 아닌) 서비스는 Auto Run을 지원하지 않는다.
- 종류 판정 근거: node 매핑 시 고른 후보의 종류가 `Artifact.artifactTypeKey`에 저장된다(이번 작업에서
  매핑 경로에 추가). 종류 없이 매핑된 예전 artifact는 첫 `version-published` 이벤트의
  `artifactTypeKey`로 채워지고, 종류가 하나뿐인 서비스는 그 하나로 본다.

---

## 3. node에 등록하기

### 3.1 등록 조건 — 전부 만족해야 켤 수 있다

| # | 조건 | 안 되면 |
|---|---|---|
| 1 | node에 artifact가 매핑돼 있다 | 미매핑 node는 등록 불가 |
| 2 | 주는 node(`intent: own`)다 | 받는(received) node는 등록 불가 |
| 3 | 그 artifact 종류가 Auto Run을 지원한다(§2), 서비스가 켜져 있고 baseURL·토큰이 있다 | 등록 불가 |
| 4 | flow 직전 1홉에 **매핑된 source node가 1개 이상** 있다 | 등록 불가 |
| 5 | 이 node가 **flow 순환 위에 있지 않다**(양방향 flow 포함) | 등록 불가 |
| 6 | 서버 전역 스위치(`AUTO_RUN_ENABLED`)가 켜져 있다 | 전부 멈춤 |

- 권한: workflow **Edit Access** 전원(설정·지금 실행·이력 조회 모두).
- 설정 위치: node 슬라이드의 **Auto Run** 탭. 캔버스 편집 lock과 무관하다(recipient 편집과 같은 방식).
- 조건은 등록할 때만이 아니라 **지금 실행할 때와 자동 발화 직전에 매번 다시** 본다 — 그 사이에
  서비스 설정이나 flow가 바뀌었을 수 있다. 자동 발화 직전에 조건이 깨져 있으면 조용히 건너뛴다(로그만).

### 3.2 순환 방지

- 판정 단위는 **node**, 범위는 **그 workflow 안의 flow**다.
- 순환 위에 있는 node는 등록할 수 없고, **등록된 node를 순환 위에 올리는 캔버스 저장은 거부**한다
  (`PUT /workflows/:id/canvas` → 400, 아무것도 쓰지 않는다).
- workflow를 넘나드는 순환(WF1에서 X→Y, WF2에서 Y→X, 둘 다 Auto Run node)은 이 판정이 잡지 못한다.
  그런 구성은 생기지 않는다는 판단으로 지금은 막지 않는다 — 필요해지면 payload에 연쇄 깊이(depth)를
  싣고 `version-published`의 `triggerRunId`로 이어받아 5 hop에서 끊으면 된다
  (`api/src/auto-run/auto-run-policy.ts#isOnCycle` 주석).

### 3.3 등록이 자동으로 풀리는 경우

- node를 **다른 artifact로 재매핑**하면 Auto Run이 꺼진다. 다시 켤 때 조건을 새로 확인한다.
- 서비스 비활성화·`Supports Auto Run` 해제는 등록을 끄지 않는다 — 대신 평가 시점에 조건 3이 깨져
  발화하지 않고, Auto Run 탭에 이유가 뜬다.

---

## 4. 언제 발화하는가

### 4.1 자동 발화 — 평가 시점

- **push 이벤트(`POST /hub/events/version-published`)로 들어온 버전이 published일 때, 그 버전으로
  처음 평가하는 순간 한 번만** 평가한다. 버전 엔트리에 `autoRunEvaluatedAt`을 찍어 같은 버전의
  재전송(note 수정 등)에는 다시 평가하지 않는다.
- pull 경로 — node 매핑 시 전체 이력 pull, Calypso 프록시의 캐시 갱신, 야간 재동기화 — 는 **평가하지
  않는다.** 그렇게 들어온 버전으로 돌려야 하면 **지금 실행**을 누른다.
  - Calypso 업로드는 프록시 pull이 push 이벤트보다 먼저 캐시를 채울 수 있다. 그래도 `autoRunEvaluatedAt`이
    비어 있으므로 push가 도착하는 순간 정상적으로 평가된다.
- 작업 중(`isPublished:false`) 버전 이벤트는 평가하지 않는다.

### 4.2 누구를 평가하는가

그 artifact를 매핑한 **모든 workflow의 모든 node**를 찾고, 각 node의 flow **직후 1홉** downstream 중
Auto Run이 켜진 node를 평가한다(한 번의 이벤트에서 같은 node는 한 번만).

### 4.3 발화 조건

대상 node N에 대해:

1. N의 flow 직전 1홉 source(매핑된 node) 가 **1개 이상**이고,
2. **모든** source가 published 버전을 갖고 있으며,
3. **모든** source의 최신 published 시각이 **N의 artifact 최신 버전(published 여부 무관) 시각보다 뒤**다.
   N에 버전이 아직 없으면 2만 만족하면 된다.

- 시각은 각 서비스가 이벤트에 실은 `updatedAt`(SIREN 캐시의 `publishedAt`/`observedAt`)이다. 서비스마다
  시계가 조금 다를 수 있다.
- 서비스가 결과를 temporary(미발행) 버전으로 이벤트를 보내도 "최신 버전"에 포함된다 — 그래서 한 번
  돌고 나면, **모든** source가 그 뒤로 다시 publish돼야 다음 자동 발화가 된다. source 일부만 바뀐
  경우처럼 조건 밖의 경우는 **지금 실행**으로 돌린다.
- fan-in 디바운스는 두지 않는다 — 조건 2·3이 사실상 "마지막 source가 publish되는 순간 1번"으로 만든다.

### 4.4 지금 실행(수동)

- 자동 발화는 항상 켜져 있는 것이고, **지금 실행**은 그와 별개로 SIREN에서 바로 한 번 돌리는 버튼이다.
- §3.1 등록 조건만 보고, §4.3의 시각 비교는 보지 않는다. 켜짐/꺼짐과도 무관하다.
- source가 하나라도 published 버전이 없으면 거부한다 — 보낼 버전이 없다.
- 보내는 버전은 누른 시점의 각 source 최신 published 버전이다.

---

## 5. 실행 기록과 상태

컬렉션 `autoRuns` — 한 문서가 한 번의 trigger다. 문서 `_id`가 서비스에 넘기는 `triggerRunId`다.

```
queued ──전송(202)──▶ dispatched ──running 콜백──▶ running ──▶ succeeded / failed
   │                       │                                      ▲
   └──전송 실패(재시도 소진)─┴──────── 60분 안에 끝 콜백 없음 ─────────┘
```

| 상태 | 뜻 |
|---|---|
| `queued` | SIREN in-process 큐에 들어갔다 |
| `dispatched` | 서비스가 trigger를 받아들였다(2xx) |
| `running` | 서비스가 작업 시작을 알렸다 |
| `succeeded` / `failed` | 끝났다. 이후 어떤 콜백도 바꾸지 않는다 |

- 기록하는 것: trigger 종류(auto/manual), 누른 사람, 발화시킨 source 버전, **보낸 source 버전 전부
  (발화 시점 고정)**, 서비스 메시지·작업 id, 결과 버전 라벨, 시도 횟수, 시각들.
- 결과 버전은 status 콜백의 `versionLabel` 또는 `version-published` 이벤트의 `triggerRunId`로 채운다.
  **끝났다는 신호는 status 콜백뿐이다** — 버전을 발행하지 않고 끝나는 서비스도 있기 때문이다.
- 감사 로그(audit)는 남기지 않는다 — 실패는 owner 알림으로 충분하다.

---

## 6. 전송

### 6.1 큐 · 재시도 · 시간 초과

- **in-process 큐**(동시 4건). 재시작하면 큐가 비지만, 부팅 시 `queued` 상태 run을 다시 넣는다.
- 전송: `POST {baseUrl}/auto-run/triggers`, `Authorization: Bearer {그 서비스의 Service Manage 토큰}`,
  10초 타임아웃.
- 재시도: 네트워크 오류·타임아웃·5xx·429만, **3번 재시도(2s/4s/8s)** 후 실패. 그 외 4xx는 즉시 실패.
- 시간 초과: 전송 뒤 **60분**(`AUTO_RUN_TIMEOUT_MINUTES`) 안에 succeeded/failed 콜백이 없으면 실패로
  닫는다. 1분마다 점검한다.

### 6.2 payload와 source 접근

payload 전체 모양은 [08장 §1.6](08-service-integration.md). 요점만:

- `runAs`는 시스템 계정 **`sdp.op`**(`AUTO_RUN_SYSTEM_ACCOUNT`)다. 서비스가 자동으로 버전을 발행하면 이
  계정으로 발행하고, 자동 발행하지 않고 사용자 승인을 거치면 **승인한 사람**으로 발행한다 — 그 판단은
  서비스 몫이다.
- source마다 버전 라벨·versionRef·viewUrl·HPC path·서비스 baseUrl을 싣는다. 서비스는 이 정보로 그
  source 서비스에 **직접** 요청한다.
- **Calypso source**에는 `calypso.contentsUrl`·`downloadUrl`과 **run별 읽기 전용 토큰**을 싣는다.
  - 토큰 범위: Calypso artifact 하나 · 버전(versionRef) 하나 · 읽기 전용 · 24시간 만료
    (`AUTO_RUN_SOURCE_TOKEN_TTL_HOURS`). HMAC-SHA256 서명(`AUTO_RUN_SOURCE_TOKEN_SECRET`, SIREN과
    Calypso가 같은 값).
  - 서비스별 이벤트 토큰을 그대로 넘기지 않는 이유: 그 토큰은 "이 서비스가 SIREN에 이벤트를 보낸다"는
    증명이라, 받은 쪽이 그 서비스인 척 `version-published`를 보낼 수 있게 된다. `SirenCallerGuard`를
    풀면 Calypso 쓰기 API 전체와 `X-Knox-Id` 사칭까지 열린다.
  - Calypso 쪽 라우트: `GET /auto-run/artifacts/:id/versions/:versionRef/contents`(파일 이름·OA 링크·
    HPC 경로), `.../download`(파일 하나면 그대로, 여러 개면 zip). `SirenCallerGuard` 대신 이 토큰만 본다.

### 6.3 서비스 콜백

- `POST /hub/events/auto-run-status` — 같은 Bearer 토큰, 그 run을 받은 서비스만 갱신할 수 있다(아니면 403).
- 엄격 검증(정의 안 된 필드 400)은 `version-published`와 같다.
- 끝난 run에 온 콜백은 `{recorded:false}`로 무시한다.

### 6.4 결과 버전 연결

서비스가 결과를 발행(또는 temporary로 등록)할 때 `version-published` 이벤트에 `triggerRunId`를 실으면,
SIREN이 그 run의 결과 버전으로 기록한다. 그 버전이 published이고 다른 Auto Run node의 source라면
§4의 평가가 그대로 이어진다 — 이것이 연쇄다.

### 6.5 source 때문에 실패했을 때

서비스가 trigger를 받았지만 **source 데이터의 문제로 돌지 못했으면**(예: liberty generator가 Port
List를 검사해 보니 Bits가 정수가 아님) 상태 콜백을 `failed`로 보내면서 `sourceErrors`에 어느 source의
무엇이 문제인지 담는다(08장 §2.3). SIREN 쪽 검사는 없다 — 판정은 그 서비스가 한다.

- SIREN은 서비스가 짚은 source를 이 run이 실제로 보낸 source와 맞춘다(sirenArtifactId →
  externalArtifactId → nodeId 순). 못 맞춘 항목도 버리지 않고 서비스가 준 값 그대로 남긴다.
- run에 `failureKind`('source' | 'service')와 `sourceErrors`가 기록되고, Auto Run 탭이 문제 source를
  빨갛게 표시하고 사유를 보여준다.
- 알림(§7): owner + **문제가 된 source 버전의 발행자(giver)**. 같은 사람은 한 통만.

---

## 7. 알림

- **workflow owner에게, 성공/실패일 때만** 보낸다. 시작·진행 중은 알리지 않는다(캔버스 표시로 충분).
- source 때문에 실패했으면(§6.5) **문제가 된 source 버전을 발행한 사람**에게도 실패 알림을 보낸다 —
  고칠 사람이 바로 알아야 한다. owner와 같은 사람이면 한 통만 간다.
- 지금은 `NotificationService.notifyAutoRun`이 로그만 남기는 stub이다 — 메일 어댑터(T3)가 붙으면 release
  알림과 같은 경로로 나간다.

---

## 8. 화면

### 8.1 캔버스

- Auto Run이 켜진 node: 카드 윗줄에 **번개 표식**.
- 실행 중(queued/dispatched/running): 번개 표식이 **Running/Queued 칩**으로 바뀌고, 카드 테두리가 숨 쉬듯
  번지며(pulse) 아래 가장자리에 흐르는 띠가 생긴다. `prefers-reduced-motion`이면 애니메이션 없이 정적
  강조만 한다.
- 캔버스 목록 응답(`GET /workflows/:id/nodes`)의 `autoRun: { enabled, activeStatus }`로 그린다.
  자동 발화는 서버에서 일어나므로 FE는 **Auto Run node가 있으면 10초, 실행 중이면 4초** 간격으로
  다시 묻는다(없으면 폴링하지 않는다).

### 8.2 Auto Run 탭(node 슬라이드)

workflow Edit Access에게만 보인다(Recipients/Comments와 같은 게이트).

- 켜기/끄기, **지금 실행**, trigger를 받을 서비스 이름·종류.
- 등록 조건이 안 맞으면 그 이유 목록.
- Sources: flow로 들어오는 source와 최신 published 버전, 대상 최신 버전 시각 대비 **Newer / Not newer**.
- Runs: 최근 20건 — 상태, auto/manual, 보낸 source 버전, 서비스 메시지, 결과 버전. 진행 중이면 4초마다 갱신.

---

## 9. 개발 검증 — Calypso probe

실제 HPC Service를 붙이기 전에 "SIREN이 보낸 trigger가 계약대로 도착하는가"를 끝까지 확인하는 장치다.
**운영에서는 끈다.**

| 어디 | 설정 |
|---|---|
| SIREN api | `AUTO_RUN_CALYPSO_PROBE=true` — Calypso node에도 Auto Run을 걸 수 있고, trigger가 Calypso로 간다 |
| Calypso | `AUTO_RUN_PROBE_ENABLED=true`, `AUTO_RUN_PROBE_DELAY_MS`(기본 5000) |

probe(`calypso POST /auto-run/triggers`)는 실제 서비스가 할 일을 흉내 낸다: 토큰 확인 → payload 필수 필드
확인 → 202 → `running` 콜백 → Calypso source마다 `contentsUrl`을 accessToken으로 **실제 HTTP 호출** →
잠시 뒤 `succeeded`/`failed` 콜백(버전은 만들지 않는다). 받은 payload와 검사 결과는
`GET /auto-run/triggers`(Bearer = Calypso 이벤트 토큰)로 본다.

---

## 10. 설정값

| 변수(SIREN api) | 기본 | 뜻 |
|---|---|---|
| `AUTO_RUN_ENABLED` | `true` | 전역 kill switch |
| `AUTO_RUN_SYSTEM_ACCOUNT` | `sdp.op` | payload `runAs` |
| `AUTO_RUN_TIMEOUT_MINUTES` | `60` | 끝 콜백 대기 시간 |
| `SIREN_PUBLIC_API_URL` | `http://localhost:3000/api/v1` | payload `callback`의 주소 — 서비스 쪽에서 닿아야 한다 |
| `CALYPSO_EXTERNAL_API_URL` | `CALYPSO_API` | 서비스가 Calypso source를 받아갈 주소 |
| `AUTO_RUN_SOURCE_TOKEN_SECRET` | `CALYPSO_API_TOKEN` | Calypso source 토큰 서명 비밀(Calypso와 같은 값) |
| `AUTO_RUN_SOURCE_TOKEN_TTL_HOURS` | `24` | Calypso source 토큰 만료 |
| `AUTO_RUN_CALYPSO_PROBE` | `false` | 개발 검증용 probe(§9) |

Calypso: `AUTO_RUN_SOURCE_TOKEN_SECRET`(기본 `SIREN_CALLER_TOKEN`), `AUTO_RUN_PROBE_ENABLED`,
`AUTO_RUN_PROBE_DELAY_MS`.

---

## 11. 코드 위치

| 무엇 | 어디 |
|---|---|
| 판정 순수 함수(upstream/downstream/순환/발화 조건) | `api/src/auto-run/auto-run-policy.ts` (+ `.spec.ts`) |
| 등록·평가·payload·콜백·시간 초과 | `api/src/auto-run/auto-run.service.ts` |
| 큐·HTTP 전송·재시도 | `api/src/auto-run/auto-run.dispatcher.ts` |
| Auto Run 탭 API | `api/src/auto-run/auto-run.controller.ts` — `GET/PUT /workflows/:wid/nodes/:nid/auto-run`, `POST .../auto-run/runs` |
| 이벤트 수신·상태 콜백 | `api/src/hub/hub-events.controller.ts` |
| 실행 기록 스키마 | `api/src/auto-run/schemas/auto-run.schema.ts` |
| Calypso source 토큰 | `api/src/auto-run/source-token.ts` ↔ `calypso/src/auto-run/source-token.ts` |
| Calypso source 라우트·probe | `calypso/src/auto-run/` |
| 캔버스 표식 | `web/src/components/canvas/NodeCard.tsx` |
| Auto Run 탭 | `web/src/components/artifact/AutoRunTab.tsx` |
| Service Manage 스위치 | `web/src/pages/ServiceManagePage.tsx` |
