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
  const raw = process.env.PORT?.trim() || '3001';
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : raw;
}

export default () => ({
  port: resolvePort(),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  // 기본값에 Calypso web(5174)을 포함한다 - Calypso가 이제 SIREN의 Project List를
  // 브라우저에서 직접 읽어오므로(Hub 설계서 §11.4), 별도 CORS_ORIGIN 설정 없이도
  // 로컬 개발 환경에서 바로 동작해야 한다.
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:5174',
  mongodbUri: resolveMongodbUri(),
  /**
   * 목업 데이터 노출 여부. true면 부팅 시 목업이 없을 때 한 번 시드하고(isMock:true 표시),
   * false로 바꿔 재시작하면 isMock:true 문서만 일괄 삭제된다 - 사용자가 만든 실제
   * 데이터는 어느 쪽에서도 건드리지 않는다. (src/database/seed-runner.service.ts)
   */
  mockupEnabled: (process.env.MOCKUP_ENABLED ?? 'false') === 'true',
  /**
   * Calypso api 베이스 URL — release를 만들 때 백엔드가 Calypso 산출물의 현재 버전을
   * 직접 물어봐야 해서 쓴다(브라우저가 매번 직접 부르는 평소 열람 경로와는 별개).
   * web/의 CALYPSO_API와 같은 기본값을 쓴다.
   */
  calypsoApiUrl: process.env.CALYPSO_API || 'http://localhost:3010/api/v1',
  /**
   * 반대 방향 — SIREN BE가 Calypso BE를 호출할 때(listArtifacts/access/upload/download/
   * release/editors/view-grants 등, 설계서 07장 §2) 실어 보내는 공유 비밀 토큰.
   * `X-Knox-Id` 등 actor 헤더는 신원 "주장"일 뿐 검증되지 않으므로(calypso/src/common/
   * actor.ts), 최소한 "이 호출이 SIREN BE에서 온 게 맞는가"는 이 토큰으로 증명한다.
   * Calypso 쪽 SIREN_CALLER_TOKEN과 같은 값을 심어야 한다. 비어 있으면(로컬 개발 기본값)
   * Calypso 쪽도 검증을 건너뛴다 — 운영 배포 시 반드시 설정할 것.
   */
  calypsoApiToken: process.env.CALYPSO_API_TOKEN || '',
  /**
   * Auto Run(설계서 10장) 설정 묶음.
   */
  autoRun: {
    /** 전역 kill switch — false면 자동 발화·Run now·dispatch가 전부 멈춘다(설정 화면도 그렇게 표시). */
    enabled: (process.env.AUTO_RUN_ENABLED ?? 'true') !== 'false',
    /** trigger payload의 runAs — 서비스가 자동 생성 버전을 이 계정으로 발행한다(사용자 결정 C9). */
    systemAccount: process.env.AUTO_RUN_SYSTEM_ACCOUNT || 'sdp.op',
    /** dispatch 이후 이 시간 안에 succeeded/failed 콜백이 없으면 실패로 닫는다(사용자: 길어야 1시간). */
    timeoutMinutes: Number(process.env.AUTO_RUN_TIMEOUT_MINUTES) > 0 ? Number(process.env.AUTO_RUN_TIMEOUT_MINUTES) : 60,
    /**
     * 그 서비스가 status 콜백·version 이벤트를 보낼 SIREN api 주소 — payload의 `callback`에
     * 그대로 실린다. 서비스 쪽(HPC망 등)에서 닿는 주소여야 한다.
     */
    publicApiUrl: (process.env.SIREN_PUBLIC_API_URL || 'http://localhost:3001/api/v1').replace(/\/+$/, ''),
    /**
     * 서비스가 Calypso source를 직접 받아갈 때 쓰는 Calypso api 주소 — CALYPSO_API는 SIREN BE
     * 기준 주소라 서비스 쪽에서 안 닿을 수 있어 따로 둔다. 비어 있으면 CALYPSO_API를 쓴다.
     */
    calypsoExternalApiUrl: (process.env.CALYPSO_EXTERNAL_API_URL || process.env.CALYPSO_API || 'http://localhost:3010/api/v1').replace(/\/+$/, ''),
    /**
     * Calypso source 읽기 전용 토큰(run마다 발급)의 서명 비밀. Calypso의 AUTO_RUN_SOURCE_TOKEN_SECRET과
     * 같은 값이어야 한다. 비어 있으면 CALYPSO_API_TOKEN(SIREN↔Calypso 공유 비밀)을 쓴다.
     */
    sourceTokenSecret: process.env.AUTO_RUN_SOURCE_TOKEN_SECRET || process.env.CALYPSO_API_TOKEN || 'siren-dev-auto-run',
    sourceTokenTtlHours: Number(process.env.AUTO_RUN_SOURCE_TOKEN_TTL_HOURS) > 0 ? Number(process.env.AUTO_RUN_SOURCE_TOKEN_TTL_HOURS) : 24,
    /**
     * ★ 개발/검증 전용 — true면 Calypso(File Artifacts) 산출물 node에도 Auto Run을 등록할 수
     *   있고, trigger는 Calypso의 probe 수신기(calypso `POST /auto-run/triggers`)로 간다. 실제
     *   생성은 하지 않고 "수신한 payload가 올바른가"만 확인해 콜백한다. 운영에서는 끈다 —
     *   Calypso는 Auto Run을 지원하지 않는다(사용자 결정 C5).
     */
    calypsoProbe: (process.env.AUTO_RUN_CALYPSO_PROBE ?? 'false') === 'true',
  },
  /** S3 호환 오브젝트 스토리지 (SFM_API files.service.ts와 동일한 키 구성). */
  storage: {
    uri: process.env.S3_URI ?? '',
    bucketName: process.env.S3_BUCKET_NAME ?? '',
    /** 버킷 내 SIREN 전용 prefix - dev는 siren-dev, prod는 siren. */
    folder: process.env.S3_FOLDER ?? '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
});
