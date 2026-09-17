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
   *   view: edit이거나 || restrictView가 false(기본, project member 누구나) || viewGrants
   *         에 내 knoxId/department 매치
   *   none: 나머지 — list()에서 제외되고 detail()은 403
   */
  computeAccess(a: ArtifactDocument, actor: Actor): AccessLevel {
    if (actor.isAdmin || a.createdBy === actor.knoxId) return 'edit';
    if (this.grantMatches(a.editors, actor)) return 'edit';
    if (!a.restrictView) return 'view';
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

  /**
   * detail()/download() 진입점 — 존재하지 않으면 404, 존재하지만 none 등급이면 403.
   * 사내 도구라 "이 id는 실재한다"는 사실을 굳이 숨길 필요는 없다고 판단했고(사용자
   * 요청), FE가 403을 "view 권한이 없다"는 구체적인 안내로 바로 보여줄 수 있어야 한다 —
   * 404로 뭉뚱그리면 "없는 건지 권한이 없는 건지" 구분이 안 된다.
   */
  async findVisibleOrThrow(id: string, actor: Actor) {
    const a = await this.findOrThrow(id);
    if (this.computeAccess(a, actor) === 'none') {
      throw new ForbiddenException('You do not have view access to this artifact.');
    }
    return a;
  }

  /**
   * ★ SIREN이 받는(received) 쪽 block을 위해 매핑용 placeholder로 이 엔드포인트를
   * 호출하는 경우에도 지금은 이 경로 그대로다 — createdBy는 여전히 실제로 호출한
   * 사용자로 기록되고, computeAccess()의 "createdBy는 항상 edit" 규칙도 그대로
   * 적용된다. 즉 받는 쪽이 만든 placeholder도 지금은 그 등록자가 편집할 수 있다.
   *
   * TODO: 받는 쪽 등록에는 원래 편집 권한을 주지 않기로 했었다(SIREN 설계서 04장 §6.4
   *   논의) — 나중에 이 grant를 제거하는 정책으로 갈 것. 지금은 단순함을 우선해
   *   구분 없이 등록자에게 edit을 그대로 준다(사용자 결정).
   */
  create(dto: CreateArtifactDto, actor: Actor) {
    return this.model.create({
      projectId: dto.projectId,
      department: dto.department,
      name: dto.name,
      description: dto.description ?? '',
      network: dto.network ?? null,
      versions: [],
      createdBy: actor.knoxId,
      isMock: false,
      editors: [],
      viewGrants: [],
      restrictView: dto.restrictView ?? false,
    });
  }

  /** view 제한 on/off — 등록자/editors/Admin만(다른 edit 동작과 동일한 기준). */
  async setRestrictView(id: string, restrictView: boolean, actor: Actor) {
    const a = await this.findOrThrow(id);
    this.assertCanEdit(a, actor);
    a.restrictView = restrictView;
    await a.save();
    return a;
  }

  /**
   * network를 언제든 바꿀 수 있게 한다(사용자 요청) — 원래는 첫 버전에서 한 번 정해지면
   * 고정이었지만, admin/editor가 필요하면 다시 고를 수 있어야 한다는 결정에 따라
   * 잠금을 풀었다. 이미 있는 버전들의 콘텐츠(files/viewUrl/hpcPath)는 그대로 둔다 —
   * 화면이 그중 새 network에 맞는 필드만 보여주는 것뿐이고, FE가 변경 전에 그 영향을
   * 경고한다.
   */
  async setNetwork(id: string, kind: 'file' | 'oa' | 'hpc', actor: Actor) {
    const a = await this.findOrThrow(id);
    this.assertCanEdit(a, actor);
    a.network = kind === 'file' ? null : kind === 'oa' ? 'OA' : 'HPC';
    await a.save();
    return a;
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

  /**
   * §3.9 — network에 따라 정확히 한 콘텐츠만 받는다: File(network===null)은
   * `files`(1개 이상), OA는 `viewUrl`, HPC는 `hpcPath`. 콘텐츠 종류는 그 artifact의
   * network로 고정되어 있으므로 여기서 다시 고르지 않는다 — 맞지 않는 필드가 오면 400.
   */
  private assertContentMatchesNetwork(
    a: ArtifactDocument,
    input: { files?: { fileName: string; storageKey: string }[]; viewUrl?: string | null; hpcPath?: string | null },
  ): void {
    if (a.network === null) {
      if (!input.files?.length) throw new BadRequestException('At least one file is required for this artifact.');
    } else if (a.network === 'OA') {
      if (!input.viewUrl) throw new BadRequestException('A link (viewUrl) is required for this OA artifact.');
    } else {
      if (!input.hpcPath) throw new BadRequestException('A path (hpcPath) is required for this HPC artifact.');
    }
  }

  /**
   * 등록 시점엔 이름만 받고 콘텐츠 종류(File/OA-link/HPC-path)를 아직 안 정했을 수
   * 있다(설계서 04장 §2.2, §6.4 — "새 Artifact 추가" 다이얼로그가 아니라 이 artifact의
   * contents 화면에서 첫 버전을 추가할 때 정한다). **그 첫 버전 추가 시점에 network가
   * 확정되고, 그 뒤로는 바뀌지 않는다.** File로 정해지는 경우는 `network`가 계속
   * null이라 별도로 할 것이 없다.
   */
  private lockNetworkOnFirstVersion(
    a: ArtifactDocument,
    input: { viewUrl?: string | null; hpcPath?: string | null },
  ): void {
    if (a.versions.length > 0) return;
    if (input.viewUrl) a.network = 'OA';
    else if (input.hpcPath) a.network = 'HPC';
  }

  /** 업로드 = minor +1. 아직 릴리스가 아니다 (작업중). */
  async addVersion(
    id: string,
    input: {
      files?: { fileName: string; storageKey: string }[];
      viewUrl?: string | null;
      hpcPath?: string | null;
      versionNote: string;
      description?: string;
      dept?: string | null;
    },
    actor: Actor,
  ) {
    const a = await this.findOrThrow(id);
    this.assertCanEdit(a, actor);
    this.lockNetworkOnFirstVersion(a, input);
    this.assertContentMatchesNetwork(a, input);

    const latest = a.versions[0];
    const major = latest ? latest.major : 0;
    const minor = latest ? latest.minor + 1 : 1;

    a.versions.unshift({
      major,
      minor,
      isReleased: false,
      versionRef: this.buildVersionRef(a, major, minor),
      files: input.files ?? [],
      viewUrl: input.viewUrl ?? null,
      hpcPath: input.hpcPath ?? null,
      versionNote: input.versionNote,
      description: input.description ?? '',
      createdBy: actor.knoxId,
      createdByDept: input.dept ?? null,
      createdAt: new Date(),
    } as ArtifactVersion);
    await a.save();
    return a;
  }

  /**
   * Release = major +1 · minor 0, 항상 새 버전을 하나 더 쌓는 방식으로 승격한다(과거
   * 버전을 고쳐 쓰지 않는다). 기본은 최신 업로드분(minor)을 그대로 쓰지만, Calypso는
   * minor를 여러 개 쌓아둘 수 있으므로(사용자 요청) `sourceVersionRef`로 과거의 released
   * 아닌 minor를 하나 골라 그 콘텐츠로 release할 수도 있다 — version tree에서 최신이
   * 아닌 작업본을 publish하는 경로다. 어느 쪽이든 새 major 번호는 항상 지금 진짜
   * 최신(a.versions[0])의 major+1이다 — release가 몇 번째 minor의 데이터를 썼는지와
   * 무관하게 버전 번호 자체는 계속 앞으로만 나간다.
   */
  async release(
    id: string,
    versionNote: string,
    description: string | undefined,
    actor: Actor,
    sourceVersionRef?: string,
  ) {
    const a = await this.findOrThrow(id);
    this.assertCanEdit(a, actor);
    const latest = a.versions[0];
    if (!latest) throw new BadRequestException('There is no uploaded version to release.');

    const source = sourceVersionRef
      ? a.versions.find((v) => v.versionRef === sourceVersionRef)
      : latest;
    if (!source) throw new NotFoundException('That version was not found.');
    if (source.isReleased) throw new BadRequestException('That version is already released.');

    const major = latest.major + 1;
    a.versions.unshift({
      major,
      minor: 0,
      isReleased: true,
      versionRef: this.buildVersionRef(a, major, 0),
      files: source.files,
      viewUrl: source.viewUrl,
      hpcPath: source.hpcPath,
      versionNote,
      description: description ?? '',
      createdBy: actor.knoxId,
      createdByDept: source.createdByDept,
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
