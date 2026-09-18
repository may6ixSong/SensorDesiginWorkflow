import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Artifact, ArtifactDocument, ArtifactVersion } from './schemas/artifact.schema';
import { Actor } from '../common/actor';
import { AuditService } from '../audit/audit.service';
import { Tier } from '../common/constants/tier';

/**
 * 변경 감지용 major 키 (설계서 02장 §3).
 *
 * release는 **major 단위로만** 비교한다 — minor가 올라간 것은 "바뀌었다"로 치지 않는다.
 * `v1.2` / `1.2` / `V1.` 처럼 앞자리를 뽑을 수 있으면 그 숫자를, 그 규칙에 안 맞는
 * 자유 문자열·경로형 버전은 라벨 전체를 키로 쓴다(그러면 라벨이 달라질 때만 변경으로 잡힌다).
 */
export function majorKeyOf(versionLabel: string | null | undefined): string {
  const label = (versionLabel ?? '').trim();
  const m = /^v?(\d+)\./i.exec(label);
  return m ? m[1] : label;
}

@Injectable()
export class ArtifactsService {
  constructor(
    @InjectModel(Artifact.name) private readonly model: Model<ArtifactDocument>,
    private readonly audit: AuditService,
  ) {}

  async findOrThrow(artifactId: string): Promise<ArtifactDocument> {
    const artifact = await this.model.findById(artifactId).exec();
    if (!artifact) throw new NotFoundException('Artifact not found.');
    return artifact;
  }

  async findMany(ids: (Types.ObjectId | string)[]): Promise<Map<string, ArtifactDocument>> {
    const unique = [...new Set(ids.filter(Boolean).map((i) => i.toString()))];
    if (unique.length === 0) return new Map();
    const docs = await this.model.find({ _id: { $in: unique } }).exec();
    return new Map(docs.map((d) => [d._id.toString(), d]));
  }

  listForProject(projectId: string | Types.ObjectId) {
    return this.model.find({ projectId }).exec();
  }

  /**
   * 최신 publish 버전. versions는 최신이 index 0이라는 불변식을 유지하므로 앞에서부터
   * 첫 isPublished를 찾으면 된다.
   */
  latestPublished(artifact: ArtifactDocument): ArtifactVersion | null {
    return (artifact.versions ?? []).find((v) => v.isPublished) ?? null;
  }

  /** publish된 버전 전체(최신순) — release 화면의 source 후보 목록이 이걸 쓴다. */
  publishedVersions(artifact: ArtifactDocument): ArtifactVersion[] {
    return (artifact.versions ?? []).filter((v) => v.isPublished);
  }

  /**
   * ★ 같은 과제 안에서만 매핑할 수 있다(설계서 04장 §1.1). `code`가 같아도 `revision`이
   *   다르면 다른 project이므로 자연히 걸러진다. Admin이 여러 과제를 볼 수 있어도
   *   이 제약은 그대로다.
   */
  assertSameProject(artifact: ArtifactDocument, projectId: Types.ObjectId | string): void {
    if (artifact.projectId.toString() !== projectId.toString()) {
      throw new BadRequestException(
        'An artifact can only be mapped within the same project (code + revision).',
      );
    }
  }

  async create(
    projectId: Types.ObjectId,
    input: {
      name: string;
      tier: Tier;
      network?: 'OA' | 'HPC' | null;
      serviceKey?: string | null;
      externalArtifactId?: string | null;
      artifactTypeKey?: string | null;
      externalUrl?: string | null;
    },
    actor: Actor,
  ): Promise<ArtifactDocument> {
    const artifact = await this.model.create({
      projectId,
      name: input.name.trim(),
      tier: input.tier,
      // ?? 는 안 쓴다 — findOrCreateExternal이 B(File Artifacts)에 명시적으로 null(File
      // 콘텐츠 잠정)을 넘기는데, ??는 null도 undefined와 똑같이 'OA'로 되돌려버려서 B가
      // 항상 OA로 잘못 생성되는 버그가 있었다. "안 준 경우"(undefined)만 'OA'로 기본값을
      // 채운다 — Service Manage 수동 등록(A/C)처럼 network를 아예 안 넘기는 호출을 위해서다.
      network: input.network === undefined ? 'OA' : input.network,
      serviceKey: input.serviceKey ?? null,
      externalArtifactId: input.externalArtifactId ?? null,
      artifactTypeKey: input.artifactTypeKey ?? null,
      externalUrl: input.externalUrl ?? null,
      versions: [],
      createdBy: actor.knoxId,
      isMock: false,
    });
    await this.audit.log(actor, 'ARTIFACT_CREATE', 'artifact', artifact._id, {
      tier: input.tier,
      serviceKey: input.serviceKey ?? null,
    });
    return artifact;
  }

  /**
   * A/B Tier — (projectId, serviceKey, externalArtifactId)로 이미 등록된 artifact가 있으면
   * 재사용하고, 없으면 새로 만든다(설계서 04장 §1 — 같은 산출물이 여러 workflow의 캔버스에
   * 놓여도 권한·버전 이력은 하나여야 한다). 이 조합의 unique 인덱스가 경쟁 상황에서도
   * 중복 생성을 막아준다.
   */
  async findOrCreateExternal(
    projectId: Types.ObjectId,
    input: { tier: 'A' | 'B' | 'C'; name: string; serviceKey: string; externalArtifactId: string },
    actor: Actor,
  ): Promise<ArtifactDocument> {
    const existing = await this.model
      .findOne({ projectId, serviceKey: input.serviceKey, externalArtifactId: input.externalArtifactId })
      .exec();
    if (existing) return existing;
    try {
      return await this.create(
        projectId,
        {
          name: input.name,
          tier: input.tier,
          // B(File Artifacts)는 Calypso와 마찬가지로 첫 버전을 추가하기 전까지 콘텐츠
          // 종류가 정해지지 않는다 — null(File 잠정)로 두고, hub-sync가 실제 값으로 갱신한다.
          network: input.tier === 'C' ? 'HPC' : input.tier === 'B' ? null : 'OA',
          serviceKey: input.serviceKey,
          externalArtifactId: input.externalArtifactId,
        },
        actor,
      );
    } catch (e: any) {
      if (e?.code === 11000) {
        // 동시에 두 요청이 같은 조합을 만들려 한 경우 — 방금 다른 쪽이 만든 것을 재사용한다.
        const raced = await this.model
          .findOne({ projectId, serviceKey: input.serviceKey, externalArtifactId: input.externalArtifactId })
          .exec();
        if (raced) return raced;
      }
      throw e;
    }
  }

  /**
   * 버전 엔트리를 통째로 갱신한다 — A/B Tier의 라이브 조회 결과를 반영할 때 쓴다.
   * 최신이 index 0이라는 불변식을 여기서 지킨다.
   *
   * artifact.tier는 versions[0].tier의 캐시다(설계서 04장 §2 — tier는 버전 엔트리의 속성).
   */
  async replaceVersions(
    artifact: ArtifactDocument,
    versions: Partial<ArtifactVersion>[],
  ): Promise<ArtifactDocument> {
    // Comment가 versionId로 참조하므로, 들어오는 엔트리마다 안정적인 _id가 있어야 한다 -
    // 라이브 동기화가 새로 만든 엔트리는 _id가 없을 수 있어 여기서 채워준다.
    artifact.versions = versions.map((v) => ({ ...v, _id: v._id ?? new Types.ObjectId() })) as ArtifactVersion[];
    if (versions.length > 0 && versions[0].tier) artifact.tier = versions[0].tier;
    await artifact.save();
    return artifact;
  }

  /**
   * C 티어의 수동 버전 기록. 시스템이 확인한 값이 아니라 담당자가 주장한 값이라는 사실이
   * assertedBy/assertedAt으로 남는다.
   */
  async assertVersion(
    artifactId: string,
    input: { versionLabel: string; isPublished: boolean; hpcPath?: string | null; externalUrl?: string | null; note?: string },
    actor: Actor,
  ): Promise<ArtifactDocument> {
    const artifact = await this.findOrThrow(artifactId);
    const now = new Date();
    const entry: Partial<ArtifactVersion> = {
      _id: new Types.ObjectId(),
      tier: artifact.tier,
      versionLabel: input.versionLabel.trim(),
      isPublished: input.isPublished,
      versionRef: null,
      giverKnoxId: actor.knoxId,
      giverDept: null,
      sourceRefs: [],
      viewUrl: input.externalUrl ?? artifact.externalUrl ?? null,
      hpcPath: input.hpcPath ?? null,
      note: input.note ?? '',
      assertedBy: actor.knoxId,
      assertedAt: now,
      observedAt: null,
      publishedAt: input.isPublished ? now : null,
      createdAt: now,
    };
    artifact.versions = [entry as ArtifactVersion, ...(artifact.versions ?? [])];
    await artifact.save();
    await this.audit.log(actor, 'ARTIFACT_VERSION_ASSERT', 'artifact', artifact._id, {
      versionLabel: entry.versionLabel,
      isPublished: entry.isPublished,
    });
    return this.findOrThrow(artifactId);
  }

  async rename(artifactId: string, name: string, _actor: Actor): Promise<ArtifactDocument> {
    const artifact = await this.findOrThrow(artifactId);
    artifact.name = name.trim();
    await artifact.save();
    return this.findOrThrow(artifactId);
  }
}
