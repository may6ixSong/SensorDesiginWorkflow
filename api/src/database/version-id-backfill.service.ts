import { Inject, Injectable, Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ArtifactDocument } from '../artifacts/schemas/artifact.schema';

/**
 * `ArtifactVersion`이 `_id:false`였던 시절에 저장된 버전 엔트리는 식별자가 없다.
 * Comment가 versionId로 특정 버전을 참조하려면 모든 기존 엔트리에도 안정적인 _id가
 * 있어야 하므로, 부팅 시 한 번 훑어서 없는 것만 채운다.
 *
 * ★★★ 반드시 `.lean()`으로 읽는다 — `_id:true`인 서브다큐먼트 배열은, 저장된 원본에
 *   `_id`가 없으면 **hydrate(=`.find()`가 문서를 만드는 과정)할 때마다 Mongoose가 그
 *   자리에서 매번 새 ObjectId를 발급해 메모리에만 채워 넣는다** — 저장되는 게 아니라
 *   읽을 때마다 값이 달라진다. 그래서 이전 버전의 `if (v._id) return v`는 실제로는 이미
 *   hydrate된 문서에 그 위조 `_id`가 항상 들어 있어 조건이 늘 참이 되고, `changed`가
 *   한 번도 true가 안 돼 실제 DB에는 영원히 반영되지 않는 조용한 버그였다(실제 Mongoose로
 *   재현·확인함 — `Model.hydrate()`에 같은 원본 객체를 두 번 넣으면 매번 다른 `_id`가
 *   나온다). `.lean()`은 Document로 감싸지 않고 원본 그대로 돌려주므로 이 위조가 없다 —
 *   여기서 "정말 없는지"를 판정하고, 쓰기는 `updateOne({$set})`으로 그 값을 그대로
 *   집어넣어 hydrate 경로를 아예 타지 않게 한다.
 *
 * 이미 _id가 있으면 건드리지 않으므로 몇 번 실행돼도 안전하다(idempotent).
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
    const artifacts = await this.artifactModel.find({}).lean().exec();
    let patchedArtifacts = 0;
    let patchedVersions = 0;

    for (const artifact of artifacts as any[]) {
      const versions = artifact.versions ?? [];
      if (versions.length === 0) continue;

      let changed = false;
      const backfilled = versions.map((v: any) => {
        if (v._id) return v;
        changed = true;
        patchedVersions += 1;
        return { ...v, _id: new Types.ObjectId() };
      });

      if (!changed) continue;
      await this.artifactModel.updateOne({ _id: artifact._id }, { $set: { versions: backfilled } }).exec();
      patchedArtifacts += 1;
    }

    if (patchedArtifacts > 0) {
      this.logger.log(
        `버전 식별자 backfill 완료 - artifact ${patchedArtifacts}건, version ${patchedVersions}건에 _id를 채웠습니다.`,
      );
    }
  }
}
