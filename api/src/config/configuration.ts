export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  // 비어 있으면 DatabaseModule이 임시 인메모리 MongoDB를 자동으로 띄우고 목업 데이터를 시드한다.
  mongodbUri: process.env.MONGODB_URI ?? '',
  auth: {
    devJwtSecret: process.env.DEV_JWT_SECRET ?? 'siren-dev-secret-change-me',
    devJwtExpiresIn: process.env.DEV_JWT_EXPIRES_IN ?? '8h',
  },
  storage: {
    endpoint: process.env.S3_ENDPOINT ?? '',
    region: process.env.S3_REGION ?? '',
    bucket: process.env.S3_BUCKET ?? '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
  },
  // TODO: 조직도/HR API 연동 지점, 사내 알림 서비스 연동 지점 - 현재는 미사용.
  hrApiBaseUrl: process.env.HR_API_BASE_URL ?? '',
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL ?? '',
});
