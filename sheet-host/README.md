# sheet-host (dev)

SIREN이 iframe으로 띄우는 SpreadJS 편집기의 **로컬 개발용 대역**이자 **참고 구현**이다
(설계서 11장 §6). 운영에서는 SpreadJS 라이선스가 묶인 SDP_SPA의 `/sheet-host` 라우트가 이 역할을 한다 —
옮기는 방법은 `docs/prompts/sdp-spa-sheet-host.md`.

```bash
cd sheet-host
npm install
npm run dev        # http://localhost:5175/
```

SIREN web의 `SHEET_HOST_URL`(web/.env.development)은 기본으로 SDP_SPA 개발 서버
(`http://localhost:3000/sheet-host`)를 가리킨다. SDP_SPA 없이 돌릴 때만 `web/.env.development.local`에
`SHEET_HOST_URL='http://localhost:5175/'`를 넣어 이 서버로 돌린다. 라이선스 키가 없어 평가판으로 돈다 —
시트에 워터마크가 뜨는 것이 정상이다.

| 경로 | 내용 |
|---|---|
| `src/sheetHost/` | SDP_SPA로 옮기는 부분 — 메시지 규약·origin 검사·load/save/import/export·seed·격자 추출 |
| `src/dev/` | 개발용 최소 툴바와 빈 라이선스 키. SDP_SPA에서는 기존 customRibbon과 실제 키 파일을 쓴다 |
| `src/main.jsx` | 개발 서버 진입점 |
