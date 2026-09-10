# 프롬프트 — RPM(및 A Tier 서비스)에 `access` 엔드포인트 구현 요청

> **이 파일은 그대로 복사해서 해당 서비스(RPM 등) 저장소의 Claude Code 세션에 붙여넣는 용도다.**
>
> 정책 배경과 "왜 이걸 하는가"는 `docs/prompts/a-tier-recipient-integration.md` 에 있다.
> 이 문서는 그 요청 ①을 **구현 수준으로 구체화한 것**이다 — SIREN이 실제로 어떤 URL을 어떤
> 조건으로 부르고, 무엇을 기대하는지만 적혀 있다.

---

## 요약

SIREN이 A Tier 산출물의 열람 여부를 판정할 때 **그 산출물을 소유한 서비스에 직접 물어본다.**
그 질문을 받을 엔드포인트 하나를 만들어 달라.

```
GET {baseUrl}/artifacts/{externalArtifactId}/access?knoxId={knoxId}[&isAdmin=true]

200 OK
{ "canView": true, "canEdit": false }
```

`{baseUrl}` 은 SIREN의 서비스 레지스트리(`artifactServices.baseUrl`)에 등록된 값이다.
이 서비스가 이미 `current-version` / `versions` 를 제공하고 있다면 **그 둘과 같은 base 아래**
같은 인증 방식으로 두면 된다.

---

## SIREN이 실제로 보내는 요청

SIREN 쪽 호출 코드는 `api/src/hub/observer-client.service.ts` 다. 정확히 이렇게 부른다.

```
GET  ${baseUrl}/artifacts/${encodeURIComponent(externalArtifactId)}/access
     ?knoxId=${encodeURIComponent(knoxId)}
     &isAdmin=true            ← SIREN Admin 이 보는 경우에만 붙는다. 아니면 아예 안 붙는다
```

| 항목 | 값 |
|---|---|
| 메서드 | `GET` |
| 타임아웃 | **5초** (`AbortController`) |
| 재시도 | 없음 |
| 본문 | 없음 |
| `knoxId` | SIREN에 로그인한 **최종 사용자**의 KnoxID. 서비스 계정이 아니다 |
| `isAdmin` | 선택 확장. 이 서비스가 모르면 그냥 무시해도 되는 여분 파라미터다 |

---

## 응답 규칙

### 정상

```json
{ "canView": true, "canEdit": false }
```

- `canView` — 이 사용자가 이 산출물을 **볼 수 있는가**. SIREN은 이 값이 false면 상세 화면을
  잠근 상태로 그린다.
- `canEdit` — 이 사용자가 이 산출물의 **작업중(미확정) 버전까지 볼 자격이 있는가**.
  SIREN은 이 값으로 "giver 시야"인지를 가른다.

SIREN은 이 두 값만 읽는다. 다른 필드가 더 있어도 무시하므로 자유롭게 넣어도 된다.
**`editors` 같은 사용자 목록은 요청하지 않는다** — 넣지 말아 달라.

### 권한이 없을 때

```json
{ "canView": false, "canEdit": false }     ← 200 OK 로
```

**403을 쓰지 말 것.** SIREN에서 403은 "SIREN이 이 API를 호출할 자격 자체가 없다"는 뜻으로만
해석한다. "이 사용자에게 권한이 없다"는 정상 응답이다.

### 산출물이 없을 때

`{ "canView": false, "canEdit": false }` 를 200으로 준다. 404도 SIREN 입장에서는 아래의
"실패"와 같게 처리되므로 결과는 같지만, 200 쪽이 로그를 덜 어지럽힌다.

### 실패했을 때 SIREN이 하는 일 — **fail-closed**

SIREN은 응답이 없거나(타임아웃), `2xx`가 아니거나, JSON이 아니면
**`{canView:false, canEdit:false}` 로 간주한다.**

> 즉 **이 엔드포인트가 죽어 있으면 SIREN에서 그 서비스의 A Tier 산출물이 아무에게도 보이지
> 않는다.** 가용성이 곧 가시성이다. 무거운 권한 계산이 필요하면 캐시해서라도 **수백 ms 안에**
> 응답해 달라.

---

## 구현할 때 유의할 점

1. **`externalArtifactId` 는 그 서비스가 SIREN에 알려 준 자기 id 다.** SIREN의 내부 `_id` 가
   아니다. `current-version` / `versions` 가 받는 것과 정확히 같은 식별자를 받는다.
2. **판정 주체는 이 서비스다.** SIREN은 응답을 그대로 믿고 다시 마스킹하지 않는다.
   반대로 SIREN 쪽에도 별도의 게이트가 하나 더 있어서(아래 §부록), SIREN 화면에서 보이는 범위는
   이 응답보다 **좁아질 수는 있어도 넓어지지는 않는다.**
3. **`isAdmin=true` 를 신뢰할지는 이 서비스가 정한다.** SIREN이 "이 사용자는 SIREN Admin이다"라고
   알려 주는 힌트일 뿐이다. 이 값에 따라 편집자 시야를 열어 줄지는 서비스 정책이다.
   모르면 무시하면 된다 — 무시해도 아무것도 깨지지 않는다.
4. **SIREN에서 누굴 recipient로 등록해도 이 서비스의 권한은 바뀌지 않는다.** SIREN은 recipient
   등록 시 이 서비스에 어떤 API도 호출하지 않는다. recipient는 "알림 대상"일 뿐이다.
5. **권한 없는 사용자가 SIREN의 링크를 타고 들어오는 일이 늘어난다.** 그 경우 500이나 빈 화면
   대신 "접근 권한이 없습니다 + 권한 요청 경로" 안내를 보여 달라.

---

## 참고 구현 — SIREN이 개발 환경에서 쓰는 목업

SIREN 저장소의 `api/src/hub/mock/mock-observer.controller.ts` 가 이 계약을 그대로 구현한
가짜 서비스다. 응답 모양을 맞출 때 참고하면 된다. 핵심만 옮기면 이렇다.

```ts
@Get('artifacts/:id/access')
async access(@Param('id') id: string, @Query('knoxId') knoxId: string) {
  const artifact = await this.find(id);
  if (!artifact) return { canView: false, canEdit: false };
  // 권한이 없어도 403이 아니라 200 + false
  if ((knoxId ?? '').startsWith('noaccess.')) return { canView: false, canEdit: false };
  return { canView: true, canEdit: artifact.createdBy === knoxId };
}
```

---

## 함께 확인해 줄 것 — 버전 목록은 "official"만

`versions` / `current-version` 이 SIREN에 넘기는 항목은 **official하게 확정된 값만**이어야 한다.

- minor까지 명확히 태깅되어 있으면 그대로 넘긴다.
- **RPM처럼 minor 개념이 없고 snapshot만 찍는 서비스는** 확정된 release 버전들 +
  **`latest(+)` 항목 하나**를 보낸다. `latest(+)` 는 `isReleased: false` 로 보낸다 —
  그래야 SIREN에서 작업중 자리표시자로 취급되어 `canEdit` 인 사람에게만 보인다.
  **이 방식은 이미 반영되어 있어 추가 대응이 필요 없다.** 바뀌지 않았는지만 확인해 달라.
- 내부 빌드 번호·해시처럼 사람이 못 알아보는 값은 넘기지 않는다.

> 필드명은 계약 그대로 **`isReleased`** 를 유지한다. SIREN 내부에서 `isPublished` 로 부르지만
> 그건 SIREN 어댑터 한 곳에서만 매핑하며, 외부 계약은 건드리지 않는다.

---

## 체크리스트

- [ ] `GET /artifacts/{id}/access?knoxId=` 구현 (`canView`, `canEdit` 두 값만)
- [ ] 권한 없는 사용자 → `200 { canView:false, canEdit:false }` (403 아님)
- [ ] 없는 산출물 → `200 { canView:false, canEdit:false }`
- [ ] p95 응답 시간이 수백 ms 이내 (필요하면 캐시)
- [ ] `isAdmin=true` 여분 파라미터가 와도 500이 나지 않는다
- [ ] `versions` / `current-version` 이 official 값 + `latest(+)` 만 넘긴다
- [ ] 권한 없는 사용자가 링크로 진입했을 때의 안내 화면 확인

---

## 부록 — SIREN 쪽 2단 게이트 (이 서비스가 구현할 것은 없음)

혼동을 막기 위해 적어 둔다. SIREN 화면에서 A Tier 산출물 상세를 열려면 둘 다 통과해야 한다.

```
1단계 (SIREN)    이 workflow의 block에 등록된 recipient(부서 또는 개인)에 속하는가?
                   아니다 → 여기서 막힌다. 이 서비스에 물어보지도 않는다.
                   (workflow의 Edit 권한자여도, 산출물을 준 본인이어도 recipient가 아니면 막힌다.)

2단계 (이 서비스) 위 access 응답의 canView 가 true 인가?
                   아니다 → 막힌다 (실패·타임아웃도 여기 포함 — fail-closed)
                   맞다  → 열린다. canEdit 여부로 작업중 버전까지 보이는지가 갈린다.
```

recipient는 **workflow마다 독립**이다 — 같은 산출물이라도 workflow X에서는 AA 부서가,
workflow Y에서는 BB 부서가 recipient일 수 있다. 그래서 SIREN은 이 목록을 산출물이 아니라
캔버스 블록에 붙여 둔다. 이 서비스가 알아야 할 것은 아니지만, "SIREN에서는 왜 안 보이지"라는
문의가 들어왔을 때의 1차 원인이 대개 여기다.
