# sheet-host (dev)

SIREN이 iframe으로 띄우는 SpreadJS 편집기의 **로컬 개발용 대역**이자 **참고 구현**이다
(설계서 11장 §6). 운영에서는 SpreadJS 라이선스가 묶인 SDP_SPA의 `/sheet-host` 라우트가 이 역할을 한다 —
옮기는 방법은 `docs/prompts/sdp-spa-sheet-host.md`.

```bash
cd sheet-host
npm install
npm run dev        # http://localhost:3000/sheet-host
```

SDP_SPA 개발 서버와 **같은 주소**(`http://localhost:3000/sheet-host`)에서 뜬다. 그래서 SIREN web의
`SHEET_HOST_URL`(web/.env.development)을 바꾸지 않고 SDP_SPA 대신 이 서버를 띄우면 된다. 같은 포트라
둘 중 하나만 띄운다. 라이선스 키가 없어 평가판으로 돈다 — 시트에 워터마크가 뜨는 것이 정상이다.

**운영 규칙.** 이 폴더는 SDP_SPA `src/pages/sheetHost/`에 반영할 원본이다. 편집기를 고칠 일이 있으면 여기서
고치고 SIREN과 함께 검증한 뒤, 사람이 SDP_SPA에 옮긴다. 사내 repo에 SIREN을 올릴 때는 이 폴더를 뺀다.

| 경로 | 내용 |
|---|---|
| `src/sheetHost/` | SDP_SPA로 옮기는 부분 — 메시지 규약·origin 검사·load/save/import/export·seed·격자 추출 |
| `src/dev/` | 개발용 최소 툴바와 빈 라이선스 키. SDP_SPA에서는 기존 customRibbon과 실제 키 파일을 쓴다 |
| `src/main.jsx` | 개발 서버 진입점 |
