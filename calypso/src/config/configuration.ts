import { decrypt } from '../utils';

/**
 * DB_CONNECTION은 AES 암호문이다(SFM_API와 동일한 방식). AES_KEY로 복호화한 결과를
 * mongodbUri로 노출한다. 둘 중 하나라도 비어 있으면 빈 문자열이 되고, 그때는
 * DatabaseModule이 실제 DB에 연결하지 않고 인메모리 목업 모드로 동작한다.
 */
function resolveMongodbUri(): string {
  const connection = process.env.DB_CONNECTION ?? '';
  const aesKey = process.env.AES_KEY ?? '';
  if (!connection || !aesKey) return '';
  return decrypt(connection, aesKey);
}

/**
 * IIS(iisnode) 아래에서는 PORT에 숫자가 아니라 명명된 파이프(`\\.\pipe\...`)가 주입된다.
 * parseInt하면 NaN이 되어 리스닝이 실패하므로, 숫자로 해석되지 않는 값은 문자열
 * 그대로 통과시킨다. main.ts가 타입을 보고 listen 호출을 나눈다.
 */
function resolvePort(): string | number {
  // SIREN api 기본값(3000)과 겹치지 않는 Calypso 전용 기본 포트. .env.example과 일치한다.
  const raw = process.env.PORT?.trim() || '3010';
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : raw;
}

export default () => ({
  port: resolvePort(),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  // 기본값에 SIREN web(5173)을 포함한다 - 산출물 등록/관리 화면이 당분간 Calypso 자체
  // web이 아니라 SIREN web 안에 있고(§11.5), 거기서 이 api를 브라우저에서 직접 호출한다.
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:5174',
  /** 사람이 여는 Calypso 화면의 베이스 URL - Observer 계약의 viewUrl이 이걸로 만들어진다. */
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:5174',
  mongodbUri: resolveMongodbUri(),
  /**
   * 목업 데이터 노출 여부. true면 부팅 시 목업이 없을 때 한 번 시드하고(isMock:true 표시),
   * false로 바꿔 재시작하면 isMock:true 문서만 일괄 삭제된다 - 사용자가 만든 실제
   * 데이터는 어느 쪽에서도 건드리지 않는다. (src/database/seed-runner.service.ts)
   */
  mockupEnabled: (process.env.MOCKUP_ENABLED ?? 'false') === 'true',
  /**
   * SIREN BE가 이 api를 호출할 때 실어 보내는 공유 비밀(`X-Siren-Token`) — actor.ts의
   * X-Knox-Id 등은 신원 주장일 뿐 검증되지 않으므로, 최소한 "이 호출이 SIREN BE에서 온
   * 게 맞는가"는 이 토큰으로 확인한다(SirenCallerGuard). SIREN 쪽 CALYPSO_API_TOKEN과
   * 같은 값이어야 한다. 비어 있으면(로컬 개발 기본값) 검증을 건너뛴다 — 운영 배포 시
   * 반드시 설정할 것.
   *
   * ★ Calypso가 나중에 자기 프론트엔드를 새로 갖게 되면, 사람이 직접 로그인해서 쓰는
   *   라우트와 "SIREN BE만 불러야 하는" 라우트를 갈라야 한다 — 지금은 당분간 Calypso
   *   자체 웹앱을 안 쓰기로 했으므로(§11.5) ArtifactsController 전체를 이 가드로 묶어도
   *   무방하지만, 그 전제가 깨지면 이 가드의 적용 범위를 다시 나눠야 한다.
   */
  sirenCallerToken: process.env.SIREN_CALLER_TOKEN || '',
  /**
   * Calypso -> SIREN 역방향 호출(부서/멤버 로스터 조회, `SirenCommonService`)의 베이스
   * URL — Calypso가 나중에 완전히 독립된 서비스로 분리돼도 그대로 쓸 수 있게, SIREN
   * FE가 project 데이터를 직접 읽지 않고 이 왕복을 거치기로 했다(사용자 결정).
   */
  sirenBaseUrl: process.env.SIREN_BASE_URL || 'http://localhost:3000/api/v1',
  /**
   * 위 호출에 실어 보내는 Bearer 토큰 — SIREN의 `HubTokenGuard`가 Calypso의 등록
   * 문서(`isBuiltIn:true`)의 token과 대조한다. 개발/목업 시드(api/src/database/seed-data.ts)는
   * 이 문서의 token을 `DEV_CALYPSO_EVENT_TOKEN`('mock-token-calypso')으로 고정해 두므로,
   * 여기서도 같은 값을 기본값으로 쓴다 — 그래야 env를 안 맞춰도 로컬/목업 환경에서 바로
   * 맞물린다(seed-data.ts에 이미 그렇게 문서화돼 있었다). 운영 배포에서는 반드시
   * CALYPSO_EVENT_TOKEN을 실제 발급받은 값으로 덮어써야 한다.
   */
  calypsoEventToken: process.env.CALYPSO_EVENT_TOKEN || 'mock-token-calypso',
  /** S3 호환 오브젝트 스토리지 (SFM_API files.service.ts와 동일한 키 구성). */
  storage: {
    uri: process.env.S3_URI ?? '',
    bucketName: process.env.S3_BUCKET_NAME ?? '',
    /** 버킷 내 Calypso 전용 prefix - SIREN 본체와 반드시 다른 값을 쓴다 (Hub 설계서 §3.7). */
    folder: process.env.S3_FOLDER ?? '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
});
