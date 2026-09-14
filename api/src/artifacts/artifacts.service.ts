import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Artifact, ArtifactDocument, ArtifactVersion } from './schemas/artifact.schema';
import { Actor } from '../common/actor';
import { AuditService } from '../audit/audit.service';
import { normalizeGrant } from '../common/access';
import { Tier, isServiceGovernedTier } from '../common/constants/tier';

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
      network?: 'OA' | 'HPC';
      serviceKey?: string | null;
      externalArtifactId?: string | null;
      artifactTypeKey?: string | null;
      externalUrl?: string | null;
      editAccess?: { departments?: string[]; users?: string[] };
      viewAccess?: { departments?: string[]; users?: string[] };
    },
    actor: Actor,
  ): Promise<ArtifactDocument> {
    const sirenGoverned = !isServiceGovernedTier(input.tier);
    const artifact = await this.model.create({
      projectId,
      name: input.name.trim(),
      tier: input.tier,
      network: input.network ?? 'OA',
      serviceKey: input.serviceKey ?? null,
      externalArtifactId: input.externalArtifactId ?? null,
      artifactTypeKey: input.artifactTypeKey ?? null,
      externalUrl: input.externalUrl ?? null,
      // A Tier는 그 서비스가 권한을 판정한다 — 값이 들어와도 저장하지 않는다.
      editAccess: sirenGoverned ? normalizeGrant(input.editAccess) : { departments: [], users: [] },
      viewAccess: sirenGoverned ? normalizeGrant(input.viewAccess) : { departments: [], users: [] },
      versions: [],
      createdBy: actor.knoxId,
      isMock: false,
    });
    await this.audit.log(actor.knoxId, 'ARTIFACT_CREATE', 'artifact', artifact._id, {
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
    input: { tier: 'A' | 'B'; name: string; serviceKey: string; externalArtifactId: string },
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
          network: 'OA',
          serviceKey: input.serviceKey,
          externalArtifactId: input.externalArtifactId,
          // B(File Artifacts)는 SIREN이 권한을 직접 들고 있다 — Calypso 접근은 "고를 수
          // 있는가"를 한 번 거르는 문지기일 뿐, 등록 이후의 열람·recipient 관리는 SIREN의
          // editAccess/viewAccess가 단일 진실이다(설계서 04장 §3.2). 등록자를 기본 edit으로
          // 넣지 않으면 아무도(Admin 제외) 못 여는 채로 만들어진다 — 그 뒤로는 기존
          // Recipients 탭(PUT /artifacts/:id/access)에서 그대로 넓히면 된다.
          // A Tier는 create()가 이 값을 무조건 무시하므로 여기서 넘겨도 안전하다.
          editAccess: { users: [actor.knoxId], departments: [] },
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
   * D Tier(Attested) — 검증할 시스템이 없으므로 그냥 새로 만든다. `expectedGiver`는 권한이
   * 아니라 "누가 채워줄 것으로 기대되는지"를 적어두는 화면 표시용 메타데이터일 뿐이다
   * (설계서 04장 §6.4).
   */
  async createAttested(
    projectId: Types.ObjectId,
    input: { name: string; expectedGiver?: { departments?: string[]; users?: string[] } },
    actor: Actor,
  ): Promise<ArtifactDocument> {
    // 등록자를 기본 edit으로 — 안 그러면 열람 권한이 아무에게도 없는 채로 만들어진다.
    const artifact = await this.create(
      projectId,
      { name: input.name, tier: 'D', network: 'OA', editAccess: { users: [actor.knoxId], departments: [] } },
      actor,
    );
    artifact.expectedGiver = normalizeGrant(input.expectedGiver);
    await artifact.save();
    return artifact;
  }

  /**
   * B/C/D의 Edit/View 권한 교체. **viewAccess가 곧 recipient**이므로 이 한 번의 쓰기가
   * 열람 권한과 수신 대상을 동시에 바꾼다(설계서 04장 §3.2).
   *
   * A Tier는 거부한다 — 그 권한은 그 서비스가 관리하고, SIREN의 recipient는 block에 있다.
   */
  async replaceAccess(
    artifactId: string,
    input: {
      editAccess?: { departments?: string[]; users?: string[] };
      viewAccess?: { departments?: string[]; users?: string[] };
    },
    actor: Actor,
  ): Promise<ArtifactDocument> {
    const artifact = await this.findOrThrow(artifactId);
    if (isServiceGovernedTier(artifact.tier)) {
      throw new BadRequestException(
        'Tier A permissions are governed by the owning service. Set recipients on the block instead.',
      );
    }
    artifact.editAccess = normalizeGrant(input.editAccess);
    artifact.viewAccess = normalizeGrant(input.viewAccess);
    await artifact.save();
    await this.audit.log(actor.knoxId, 'ARTIFACT_ACCESS_REPLACE', 'artifact', artifact._id, {
      editAccess: artifact.editAccess,
      viewAccess: artifact.viewAccess,
    });
    return this.findOrThrow(artifactId);
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
    artifact.versions = versions as ArtifactVersion[];
    if (versions.length > 0 && versions[0].tier) artifact.tier = versions[0].tier;
    await artifact.save();
    return artifact;
  }

  /**
   * C/D 티어의 수동 버전 기록. 시스템이 확인한 값이 아니라 담당자가 주장한 값이라는 사실이
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
    await this.audit.log(actor.knoxId, 'ARTIFACT_VERSION_ASSERT', 'artifact', artifact._id, {
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
