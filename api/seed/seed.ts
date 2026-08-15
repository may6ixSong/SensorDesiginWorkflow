/**
 * ARBOR 개발용 목업 데이터 시드 CLI.
 * 실행: npm run seed  (사전에 .env의 MONGODB_URI가 설정되어 있어야 함)
 *
 * 실제 데이터 생성 로직은 src/database/seed-data.ts에 있다 - DatabaseModule의
 * 자동 인메모리 모드(MONGODB_URI 미설정 시)에서도 동일 로직을 재사용한다.
 */
import mongoose from 'mongoose';
import { seedDatabase } from '../src/database/seed-data';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI가 설정되어 있지 않습니다. api/.env를 확인하세요. ' +
        '(DB 없이 목업만 확인하려면 `npm run start:dev`를 그냥 실행하세요 - 인메모리 DB가 자동 시드됩니다.)',
    );
  }
  await mongoose.connect(uri);
  console.log(`Connected: ${uri}`);
  await seedDatabase(mongoose.connection);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
