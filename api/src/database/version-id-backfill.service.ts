import { Inject, Injectable, Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ArtifactDocument, ArtifactVersion } from '../artifacts/schemas/artifact.schema';

/**
 * `ArtifactVersion`이 `_id:false`였던 시절에 저장된 버전 엔트리는 식별자가 없다.
 * Comment가 versionId로 특정 버전을 참조하려면 모든 기존 엔트리에도 안정적인 _id가
 * 있어야 하므로, 부팅 시 한 번 훑어서 없는 것만 채운다.
 *
 * 이미 _id가 있으면 건드리지 않으므로 몇 번 실행돼도 안전하다(idempotent).
 * `versions` 배열 전체를 새 배열로 재할당해서 저장한다 - 실제 Mongoose 문서와
 * 인메모리 페이크 문서(src/database/in-memory-driver.ts) 양쪽에서 동일하게 동작한다.
 *
 * ★ OnModuleInit으로 스스로 부팅에 끼어들지 않는다 - Nest의 모듈 간 onModuleInit 호출
 *   순서는 같은 모듈 안 provider 등록 순서나 생성자 의존성만으로 보장되지 않아서,
 *   SeedRunnerService의 목업 시드보다 먼저 실행될 수 있다(실제로 그렇게 됐다 - 시드가
 *   만든 목업 버전은 그 뒤로 한 번도 backfill되지 않은 채 남는다). 그래서 SeedRunnerService가
 *   시드/정리를 끝낸 다음 이 서비스의 run()을 명시적으로 호출해서 순서를 강제한다.
 */
@Injectable()
export class VersionIdBackfillService {
  private readonly logger = new Logger(VersionIdBackfillService.name);

  constructor(@Inject(getModelToken('Artifact')) private readonly artifactModel: Model<ArtifactDocument>) {}

  async run() {
    const artifacts = await this.artifactModel.find({}).exec();
    let patchedArtifacts = 0;
    let patchedVersions = 0;

    for (const artifact of artifacts) {
      const versions = artifact.versions ?? [];
      if (versions.length === 0) continue;

      let changed = false;
      const backfilled = versions.map((v: ArtifactVersion) => {
        if (v._id) return v;
        changed = true;
        patchedVersions += 1;
        const plain = typeof (v as any).toObject === 'function' ? (v as any).toObject() : v;
        return { ...plain, _id: new Types.ObjectId() } as ArtifactVersion;
      });

      if (!changed) continue;
      artifact.versions = backfilled;
      await artifact.save();
      patchedArtifacts += 1;
    }

    if (patchedArtifacts > 0) {
      this.logger.log(
        `버전 식별자 backfill 완료 - artifact ${patchedArtifacts}건, version ${patchedVersions}건에 _id를 채웠습니다.`,
      );
    }
  }
}
