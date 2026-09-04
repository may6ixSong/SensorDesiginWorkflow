import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Artifact, ArtifactDocument, ArtifactGrant, ArtifactVersion } from './schemas/artifact.schema';
import { Actor } from '../common/actor';
import { CreateArtifactDto, ListArtifactsQuery } from './dto/artifact-crud.dto';

export type AccessLevel = 'edit' | 'view' | 'none';

@Injectable()
export class ArtifactsService {
  constructor(@InjectModel(Artifact.name) private readonly model: Model<ArtifactDocument>) {}

  /**
   * 접근 등급 판정 — Artifact마다 독립적인 ACL이다(Workflow 권한을 상속하지 않는다,
   * 사용자 요청). 등록자·Admin은 항상 edit. 그 외엔 editors/viewGrants에 개인 또는
   * (지금 project 안에서의) 소속 부서가 들어있는지로 본다.
   *
   *   edit: createdBy === me || editors에 내 knoxId/department 매치 || isAdmin
   *   view: edit이거나 || viewGrants에 내 knoxId/department 매치
   *   none: 나머지 — list()에서 제외되고 detail()은 403
   */
  computeAccess(a: ArtifactDocument, actor: Actor): AccessLevel {
    if (actor.isAdmin || a.createdBy === actor.knoxId) return 'edit';
    if (this.grantMatches(a.editors, actor)) return 'edit';
    if (this.grantMatches(a.viewGrants, actor)) return 'view';
    return 'none';
  }

  private grantMatches(grants: ArtifactGrant[], actor: Actor): boolean {
    return grants.some((g) => (
      (g.type === 'user' && g.knoxId === actor.knoxId)
      || (g.type === 'department' && !!g.department && actor.departments.includes(g.department))
    ));
  }

  /**
   * 목록. `mine=true`면 내가 등록한 것만 (Hub 설계서 §14.3 My Task). none 등급인
   * 산출물은 아예 빼고 내려준다 — FE 필터를 신뢰하지 않고 서버가 직접 거른다.
   *
   * 이 필터는 SIREN이 대신 계산해주는 게 아니라 각 서비스가 자기 목록에서 직접
   * 구현한다 - 오케스트레이션과 무관한 자기 화면의 책임이다.
   */
  async list(query: ListArtifactsQuery, actor: Actor) {
    const filter: Record<string, unknown> = {};
    if (query.projectId) filter.projectId = query.projectId;
    if (query.department) filter.department = query.department;
    if (query.mine === 'true') filter.createdBy = actor.knoxId;
    const all = await this.model.find(filter).sort({ updatedAt: -1 }).exec();
    return all.filter((a) => this.computeAccess(a, actor) !== 'none');
  }

  async findOrThrow(id: string) {
    const a = await this.model.findById(id).exec();
    if (!a) throw new NotFoundException('Artifact not found.');
    return a;
  }

  /** detail() 진입점 — none 등급이면 존재 자체를 흘리지 않고 404로 막는다. */
  async findVisibleOrThrow(id: string, actor: Actor) {
    const a = await this.findOrThrow(id);
    if (this.computeAccess(a, actor) === 'none') {
      throw new NotFoundException('Artifact not found.');
    }
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
      editors: [],
      viewGrants: [],
    });
  }

  private assertCanEdit(a: ArtifactDocument, actor: Actor): void {
    if (this.computeAccess(a, actor) !== 'edit') {
      throw new ForbiddenException('You do not have edit access to this artifact.');
    }
  }

  /**
   * editors/viewGrants에 부여를 하나 추가한다. 부여자 자신도 edit 권한이 있어야 하고
   * (등록자/기존 editor/Admin), edit을 부서 단위로 줄 때는 **부여자 본인 소속 부서로만**
   * 제한한다(§9.2 원칙 — 부서가 analog 단위라 타 부서에 통째로 주면 관련 없는 IP까지
   * 편집권이 퍼진다). view는 어떤 부서든 지정할 수 있다.
   */
  async addGrant(
    id: string,
    kind: 'editors' | 'viewGrants',
    input: { type: 'user'; knoxId: string } | { type: 'department'; department: string },
    actor: Actor,
  ) {
    const a = await this.findOrThrow(id);
    this.assertCanEdit(a, actor);

    if (kind === 'editors' && input.type === 'department' && !actor.isAdmin) {
      if (!actor.departments.includes(input.department)) {
        throw new ForbiddenException('You can only grant edit access to your own department.');
      }
    }

    const grant: ArtifactGrant = {
      type: input.type,
      knoxId: input.type === 'user' ? input.knoxId : null,
      department: input.type === 'department' ? input.department : null,
      grantedBy: actor.knoxId,
      grantedAt: new Date(),
    } as ArtifactGrant;

    const already = a[kind].some((g) => (
      g.type === grant.type && g.knoxId === grant.knoxId && g.department === grant.department
    ));
    if (!already) {
      a[kind].push(grant);
      await a.save();
    }
    return a;
  }

  async removeGrant(
    id: string,
    kind: 'editors' | 'viewGrants',
    input: { type: 'user'; knoxId: string } | { type: 'department'; department: string },
    actor: Actor,
  ) {
    const a = await this.findOrThrow(id);
    this.assertCanEdit(a, actor);

    a[kind] = a[kind].filter((g) => !(
      g.type === input.type
      && g.knoxId === (input.type === 'user' ? input.knoxId : null)
      && g.department === (input.type === 'department' ? input.department : null)
    ));
    await a.save();
    return a;
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
    this.assertCanEdit(a, actor);

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
    this.assertCanEdit(a, actor);
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
