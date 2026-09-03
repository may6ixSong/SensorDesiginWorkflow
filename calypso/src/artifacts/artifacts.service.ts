import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Artifact, ArtifactDocument, ArtifactVersion } from './schemas/artifact.schema';
import { Actor } from '../common/actor';
import { CreateArtifactDto, ListArtifactsQuery } from './dto/artifact-crud.dto';

@Injectable()
export class ArtifactsService {
  constructor(@InjectModel(Artifact.name) private readonly model: Model<ArtifactDocument>) {}

  /**
   * 목록. `mine=true`면 내가 등록한 것만 (Hub 설계서 §14.3 My Task).
   *
   * 이 필터는 SIREN이 대신 계산해주는 게 아니라 각 서비스가 자기 목록에서 직접
   * 구현한다 - 오케스트레이션과 무관한 자기 화면의 책임이다.
   */
  list(query: ListArtifactsQuery, actor: Actor) {
    const filter: Record<string, unknown> = {};
    if (query.projectId) filter.projectId = query.projectId;
    if (query.department) filter.department = query.department;
    if (query.mine === 'true') filter.createdBy = actor.knoxId;
    return this.model.find(filter).sort({ updatedAt: -1 }).exec();
  }

  async findOrThrow(id: string) {
    const a = await this.model.findById(id).exec();
    if (!a) throw new NotFoundException('Artifact not found.');
    return a;
  }

  create(dto: CreateArtifactDto, actor: Actor) {
    return this.model.create({
      projectId: dto.projectId,
      department: dto.department,
      name: dto.name,
      description: dto.description ?? '',
      versions: [],
      createdBy: actor.knoxId,
      isMock: false,
    });
  }

  /**
   * 편집 권한 - 등록한 본인만 (Hub 설계서 §9.2의 "쓰기 권한을 등록 당사자로 좁힌다"를
   * Calypso에도 같은 원칙으로 적용). 다중 편집자 개념이 필요해지면 여기를 넓힌다.
   */
  private assertOwner(a: ArtifactDocument, actor: Actor): void {
    if (a.createdBy !== actor.knoxId) {
      throw new ForbiddenException('Only the person who registered this artifact can change it.');
    }
  }

  /** 다음 업로드가 받을 버전 - minor +1 (최초 0.1). */
  nextVersionLabel(a: ArtifactDocument): string {
    const latest = a.versions[0];
    return latest ? `${latest.major}.${latest.minor + 1}` : '0.1';
  }

  /** 업로드 = minor +1. 아직 릴리스가 아니다 (작업중). */
  async addVersion(
    id: string,
    input: { fileName: string; storageKey: string; note?: string; dept?: string | null },
    actor: Actor,
  ) {
    const a = await this.findOrThrow(id);
    this.assertOwner(a, actor);

    const latest = a.versions[0];
    const major = latest ? latest.major : 0;
    const minor = latest ? latest.minor + 1 : 1;

    a.versions.unshift({
      major,
      minor,
      isReleased: false,
      versionRef: this.buildVersionRef(a, major, minor),
      fileName: input.fileName,
      storageKey: input.storageKey,
      note: input.note ?? '',
      createdBy: actor.knoxId,
      createdByDept: input.dept ?? null,
      createdAt: new Date(),
    } as ArtifactVersion);
    await a.save();
    return a;
  }

  /** Release = major +1 · minor 0. 최신 업로드분을 그대로 승격한다. */
  async release(id: string, note: string | undefined, actor: Actor) {
    const a = await this.findOrThrow(id);
    this.assertOwner(a, actor);
    const latest = a.versions[0];
    if (!latest) throw new BadRequestException('There is no uploaded version to release.');
    if (latest.isReleased) throw new BadRequestException('The latest version is already released.');

    const major = latest.major + 1;
    a.versions.unshift({
      major,
      minor: 0,
      isReleased: true,
      versionRef: this.buildVersionRef(a, major, 0),
      fileName: latest.fileName,
      storageKey: latest.storageKey,
      note: note ?? '',
      createdBy: actor.knoxId,
      createdByDept: latest.createdByDept,
      createdAt: new Date(),
    } as ArtifactVersion);
    await a.save();
    return a;
  }

  /**
   * 불변 참조. SIREN의 Workflow Release가 이 값을 얼려 보관하므로, 한번 발급된 ref가
   * 다른 내용을 가리키게 되어서는 안 된다 (Hub 설계서 §6.3).
   */
  private buildVersionRef(a: ArtifactDocument, major: number, minor: number): string {
    return `calypso:${a._id.toString()}@${major}.${minor}`;
  }
}
