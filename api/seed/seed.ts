/**
 * ARBOR 개발용 목업 데이터 시드 CLI.
 * 실행: npm run seed  (사전에 .env의 MONGODB_URI가 설정되어 있어야 함 - 실제 DB 전용)
 *
 * MONGODB_URI를 비워두고 그냥 `npm run start:dev`를 실행하면 DB 연결 자체 없이
 * 인메모리 모드로 자동 시드된다 (src/database/seed-runner.service.ts 참고).
 * 실제 데이터 생성 로직은 src/database/seed-data.ts에 있다 - 두 경로가 공유한다.
 */
import mongoose, { Model } from 'mongoose';
import { UserSchema, UserDocument } from '../src/users/schemas/user.schema';
import { ProjectSchema, ProjectDocument } from '../src/projects/schemas/project.schema';
import { IpSchema, IpDocument } from '../src/ips/schemas/ip.schema';
import { DeliverableSchema, DeliverableDocument } from '../src/deliverables/schemas/deliverable.schema';
import { MemoSchema, MemoDocument } from '../src/memos/schemas/memo.schema';
import { EdgeSchema, EdgeDocument } from '../src/edges/schemas/edge.schema';
import { HldReleaseSchema, HldReleaseDocument } from '../src/hld/schemas/hld-release.schema';
import { seedDatabase } from '../src/database/seed-data';

/**
 * 주의: `connection.model<T>(name, schema)`처럼 제네릭 타입 인자를 명시해서 호출하면
 * mongoose 8.x의 Model 오버로드 해석 비용이 급격히 커져 tsc가 OOM까지 간다(실측 확인됨).
 * 제네릭 없이 호출한 뒤 결과를 캐스팅하는 방식으로 그 경로를 피한다.
 */
function modelFor<T>(name: string, schema: mongoose.Schema): Model<T> {
  return mongoose.connection.model(name, schema) as unknown as Model<T>;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI가 설정되어 있지 않습니다. api/.env를 확인하세요. ' +
        '(DB 없이 목업만 확인하려면 `npm run start:dev`를 그냥 실행하세요 - 인메모리 모드가 자동 시드됩니다.)',
    );
  }
  await mongoose.connect(uri);
  console.log(`Connected: ${uri}`);

  await seedDatabase({
    User: modelFor<UserDocument>('User', UserSchema),
    Project: modelFor<ProjectDocument>('Project', ProjectSchema),
    Ip: modelFor<IpDocument>('Ip', IpSchema),
    Deliverable: modelFor<DeliverableDocument>('Deliverable', DeliverableSchema),
    Memo: modelFor<MemoDocument>('Memo', MemoSchema),
    Edge: modelFor<EdgeDocument>('Edge', EdgeSchema),
    HldRelease: modelFor<HldReleaseDocument>('HldRelease', HldReleaseSchema),
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
