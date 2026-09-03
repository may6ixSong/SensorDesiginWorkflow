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
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5174',
  /** 사람이 여는 Calypso 화면의 베이스 URL - Observer 계약의 viewUrl이 이걸로 만들어진다. */
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:5174',
  mongodbUri: resolveMongodbUri(),
  /**
   * 목업 데이터 노출 여부. true면 부팅 시 목업이 없을 때 한 번 시드하고(isMock:true 표시),
   * false로 바꿔 재시작하면 isMock:true 문서만 일괄 삭제된다 - 사용자가 만든 실제
   * 데이터는 어느 쪽에서도 건드리지 않는다. (src/database/seed-runner.service.ts)
   */
  mockupEnabled: (process.env.MOCKUP_ENABLED ?? 'false') === 'true',
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
