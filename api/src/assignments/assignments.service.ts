import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { Actor } from '../common/actor';
import { Release, ReleaseDocument } from '../releases/schemas/release.schema';
import { Artifact, ArtifactDocument, ArtifactVersion } from '../artifacts/schemas/artifact.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { MyScope, MyScopeService, ScopedNode } from './my-scope.service';
import {
  CalendarDto,
  MyArtifactRowDto,
  MyReleaseRowDto,
  PagedDto,
  VersionEventDto,
} from './dto/assignment.dto';

const DEFAULT_PAGE_SIZE = 20;
/** 내 산출물 목록은 최근 1년만 — 사용자 요청(전부 다 가져올 필요는 없다). */
const ARTIFACT_WINDOW_DAYS = 365;
/** 달력 한 번의 조회 범위 상한. 월 격자(최대 6주)보다 넉넉하되 연 단위 스캔은 막는다. */
const MAX_CALENDAR_DAYS = 100;

/** 아무것도 매치되지 않는다는 뜻. `{}`(전부 매치)와 절대 혼동하면 안 돼서 타입으로 가른다. */
type Scoped<T> = T | null;

/**
 * My Assignment (설계서 09장) — 과제 경계를 넘어 "내 일"만 모아 보여주는 화면의 뒤편.
 *
 * ★ 이 서비스는 **외부 서비스를 한 번도 호출하지 않는다.** 목록·달력에 필요한 판정이
 *   전부 SIREN이 직접 들고 있는 값(project 로스터, workflow.department, node.intent,
 *   node.recipients, release의 파생 필드)으로 끝나기 때문이다. 산출물별 라이브 권한
 *   판정(게이트 2)은 행을 눌러 release 상세를 열 때 그 한 건에 대해서만 돈다.
 *
 * ★ Admin은 어느 엔드포인트에서도 필터가 없다 — 전부 읽는다(사용자 요청).
 */
@Injectable()
export class AssignmentsService {
  constructor(
    @InjectModel(Release.name) private readonly releases: Model<ReleaseDocument>,
    @InjectModel(Artifact.name) private readonly artifacts: Model<ArtifactDocument>,
    private readonly scopeService: MyScopeService,
  ) {}

  /* ---------------------------------------------------------------- *
   * 1 · 받은 release · 2 · 낸 release
   * ---------------------------------------------------------------- */

  /**
   * 내가/내 부서가 **recipient로 잡힌** release. 최신순 페이지네이션.
   *
   * `recipientDepartments`/`recipientUsers`는 release 생성 시 items 안의 수신 대상을
   * 평탄화해 둔 파생 필드라(02장 §6) 인덱스 하나로 과제 경계를 넘어 조회된다.
   */
  async receivedReleases(
    actor: Actor,
    page: number,
    size: number,
    projectIds?: string[],
  ): Promise<PagedDto<MyReleaseRowDto>> {
    const scope = await this.scopeService.resolve(actor);
    return this.pagedReleases(scope, this.receivedFilter(scope, projectIds), page, size);
  }

  /**
   * 내가 실행했거나, **내 부서가 소속 부서인 workflow가 낸** release.
   *
   * 부서는 release 시점에 얼려둔 `workflowAt.department`로 맞춘다. 내 소속은 지금
   * 기준이다 — 발행 당시 그 부서가 아니었어도 지금 속해 있으면 내 것으로 본다(사용자 확정).
   */
  async publishedReleases(
    actor: Actor,
    page: number,
    size: number,
    projectIds?: string[],
  ): Promise<PagedDto<MyReleaseRowDto>> {
    const scope = await this.scopeService.resolve(actor);
    return this.pagedReleases(scope, this.publishedFilter(scope, projectIds), page, size);
  }

  private async pagedReleases(
    scope: MyScope,
    filter: Scoped<FilterQuery<ReleaseDocument>>,
    page: number,
    size: number,
  ): Promise<PagedDto<MyReleaseRowDto>> {
    const safePage = Math.max(1, Math.trunc(page) || 1);
    const safeSize = Math.min(100, Math.max(1, Math.trunc(size) || DEFAULT_PAGE_SIZE));
    if (filter === null) {
      return { items: [], meta: { page: safePage, size: safeSize, total: 0, hasMore: false } };
    }

    const total = await this.releases.countDocuments(filter).exec();
    const docs = await this.releases
      .find(filter)
      .sort({ releasedAt: -1 })
      .skip((safePage - 1) * safeSize)
      .limit(safeSize)
      .exec();

    const projectById = this.projectIndex(scope);
    return {
      items: docs.map((r) => this.toReleaseRow(r, scope, projectById)),
      meta: {
        page: safePage,
        size: safeSize,
        total,
        hasMore: safePage * safeSize < total,
      },
    };
  }

  /* ---------------------------------------------------------------- *
   * 3 · 내 부서가 주는 산출물
   * ---------------------------------------------------------------- */

  /**
   * 내 부서 workflow의 own node 중 artifact가 매핑된 것 전부(모든 과제·모든 workflow).
   * **최근 1년 안에 움직인 것만** 가져오고, 최근 순으로 준다.
   *
   * "움직였다"는 artifact 문서의 `updatedAt`과 마지막 버전 사건 중 더 최근 쪽이다 —
   * 버전은 배열 안에서 갱신되므로 문서 `updatedAt`만 보면 과거에 넣고 손대지 않은 문서가
   * 실제로는 이번 주에 새 버전을 받았는데도 빠질 수 있다.
   */
  async myArtifacts(actor: Actor): Promise<MyArtifactRowDto[]> {
    const scope = await this.scopeService.resolve(actor);
    if (!scope.myArtifactIds.length) return [];

    const cutoff = new Date(Date.now() - ARTIFACT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const artifacts = await this.artifacts
      .find({
        _id: { $in: scope.myArtifactIds },
        $or: [
          { updatedAt: { $gte: cutoff } },
          { 'versions.publishedAt': { $gte: cutoff } },
          { 'versions.observedAt': { $gte: cutoff } },
          { 'versions.createdAt': { $gte: cutoff } },
        ],
      })
      .exec();

    const byId = new Map(artifacts.map((a) => [a._id.toString(), a]));
    const projectById = this.projectIndex(scope);
    const workflowById = new Map(scope.myWorkflows.map((w) => [w.workflowId, w]));

    const rows: MyArtifactRowDto[] = [];
    for (const node of scope.myOwnNodes) {
      const artifact = byId.get(node.artifactId);
      if (!artifact) continue;

      // DB 필터는 배열 멀티키라 과매치된다(다른 원소가 범위 양끝을 나눠 만족해도 문서가
      // 걸린다) — 여기서 실제 값으로 한 번 더 자른다.
      const updatedAt = this.lastActivityAt(artifact);
      if (updatedAt.getTime() < cutoff.getTime()) continue;

      const workflow = workflowById.get(node.workflowId);
      const project = projectById.get(node.projectId);
      const versions = artifact.versions ?? [];
      const latest = this.latestVersion(versions);

      rows.push({
        nodeId: node.nodeId,
        nodeName: node.name,
        workflowId: node.workflowId,
        workflowName: workflow?.name ?? '',
        workflowDepartment: workflow?.department ?? '',
        projectId: node.projectId,
        projectCode: project?.code ?? '',
        projectName: project?.name ?? '',
        phaseId: node.phaseId,

        artifactId: node.artifactId,
        artifactName: artifact.name,
        tier: artifact.tier,
        network: artifact.network ?? null,
        serviceKey: artifact.serviceKey ?? null,

        latestVersion: latest
          ? {
              versionLabel: latest.versionLabel,
              isPublished: latest.isPublished,
              versionRef: latest.versionRef ?? null,
              occurredAt: this.versionDate(latest).toISOString(),
              viewUrl: latest.viewUrl ?? null,
              hpcPath: latest.hpcPath ?? null,
              giverKnoxId: latest.giverKnoxId ?? null,
            }
          : null,
        versionCount: versions.length,
        publishedVersionCount: versions.filter((v) => v.isPublished).length,

        recipientDepartments: node.recipientDepartments,
        recipientUserCount: node.recipientUsers.length,

        updatedAt: updatedAt.toISOString(),
      });
    }

    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /* ---------------------------------------------------------------- *
   * 4 · 달력
   * ---------------------------------------------------------------- */

  /**
   * 그 달 격자에 들어가는 event만 읽는다 — 범위 밖은 DB에서 이미 잘린다.
   *
   * 버전 event는 artifact 문서 안의 배열이라 범위 조건이 **문서 단위로 과매치**된다.
   * 그래도 읽어오는 문서 수는 "내 scope ∩ 그 달에 뭔가 있었던 것"으로 좁혀지고, 엔트리
   * 단위 필터는 메모리에서 끝난다 — 산출물 하나하나에 권한을 물어보는 일은 없다.
   */
  async calendar(actor: Actor, from: string, to: string): Promise<CalendarDto> {
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('from/to must be valid ISO-8601 timestamps.');
    }
    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('`to` must be later than `from`.');
    }
    if (end.getTime() - start.getTime() > MAX_CALENDAR_DAYS * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(`The calendar range cannot exceed ${MAX_CALENDAR_DAYS} days.`);
    }

    const scope = await this.scopeService.resolve(actor);
    const [versionEvents, releaseEvents] = await Promise.all([
      this.versionEventsIn(scope, start, end),
      this.releaseEventsIn(scope, start, end),
    ]);

    return { from: start.toISOString(), to: end.toISOString(), versionEvents, releaseEvents };
  }

  private async versionEventsIn(scope: MyScope, start: Date, end: Date): Promise<VersionEventDto[]> {
    if (!scope.myArtifactIds.length) return [];

    const artifacts = await this.artifacts
      .find({
        _id: { $in: scope.myArtifactIds },
        $or: [
          { 'versions.publishedAt': { $gte: start, $lt: end } },
          { 'versions.observedAt': { $gte: start, $lt: end } },
          { 'versions.createdAt': { $gte: start, $lt: end } },
        ],
      })
      .exec();

    const projectById = this.projectIndex(scope);
    const workflowById = new Map(scope.myWorkflows.map((w) => [w.workflowId, w]));
    const placementsByArtifact = new Map<string, ScopedNode[]>();
    for (const n of scope.myOwnNodes) {
      const list = placementsByArtifact.get(n.artifactId) ?? [];
      list.push(n);
      placementsByArtifact.set(n.artifactId, list);
    }

    const events: VersionEventDto[] = [];
    for (const artifact of artifacts) {
      const artifactId = artifact._id.toString();
      const project = projectById.get(artifact.projectId.toString());
      const placements = (placementsByArtifact.get(artifactId) ?? []).map((n) => ({
        workflowId: n.workflowId,
        workflowName: workflowById.get(n.workflowId)?.name ?? '',
        department: workflowById.get(n.workflowId)?.department ?? '',
        nodeId: n.nodeId,
      }));

      for (const v of artifact.versions ?? []) {
        const occurredAt = this.versionDate(v);
        if (occurredAt.getTime() < start.getTime() || occurredAt.getTime() >= end.getTime()) continue;
        events.push({
          artifactId,
          artifactName: artifact.name,
          tier: v.tier ?? artifact.tier,
          network: artifact.network ?? null,
          versionLabel: v.versionLabel,
          versionRef: v.versionRef ?? null,
          isPublished: v.isPublished,
          occurredAt: occurredAt.toISOString(),
          giverKnoxId: v.giverKnoxId ?? null,
          giverDept: v.giverDept ?? null,
          viewUrl: v.viewUrl ?? null,
          hpcPath: v.hpcPath ?? null,
          projectId: artifact.projectId.toString(),
          projectCode: project?.code ?? '',
          projectName: project?.name ?? '',
          placements,
        });
      }
    }

    return events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  /**
   * 달력의 release event — 받은 것과 낸 것의 합집합이다. 두 조건을 한 쿼리의 `$or`로
   * 합쳐 한 번만 읽고, 어느 쪽인지는 행마다 `received`/`published`로 표시한다.
   */
  private async releaseEventsIn(scope: MyScope, start: Date, end: Date): Promise<MyReleaseRowDto[]> {
    const received = this.receivedFilter(scope);
    const published = this.publishedFilter(scope);
    if (received === null && published === null) return [];

    const range = { releasedAt: { $gte: start, $lt: end } };
    const filter: FilterQuery<ReleaseDocument> = scope.isAdmin
      ? range
      : { ...range, $or: [received, published].filter(Boolean).map((f) => this.stripRange(f!)) };

    const docs = await this.releases.find(filter).sort({ releasedAt: -1 }).exec();
    const projectById = this.projectIndex(scope);
    return docs.map((r) => this.toReleaseRow(r, scope, projectById));
  }

  /**
   * `$or` 안에 다시 `$or`를 넣을 수 없으니(같은 키가 덮어써진다) 한 겹 풀어 `$and`로 감싼다.
   * received/published 필터는 각각 `{projectId, $or:[...]}` 모양이라 그대로는 못 합친다.
   */
  private stripRange(filter: FilterQuery<ReleaseDocument>): FilterQuery<ReleaseDocument> {
    const { $or, ...rest } = filter as Record<string, unknown> & { $or?: unknown[] };
    if (!$or) return rest as FilterQuery<ReleaseDocument>;
    return { $and: [rest, { $or }] } as FilterQuery<ReleaseDocument>;
  }

  /* ---------------------------------------------------------------- *
   * 필터 — scope를 Mongo 조건으로 옮기는 자리
   * ---------------------------------------------------------------- */

  /**
   * 부서는 **과제마다 다르다**(01장 §2.4) — 그래서 부서 조건을 전역으로 한 번 거는 게
   * 아니라 과제별로 하나씩 `$or`에 넣는다. 개별 사용자 지정(recipientUsers)만 과제와
   * 무관하지만, 그것도 내가 member인 과제 안으로 먼저 좁힌 뒤에 본다 — Project 계층이
   * 최종 관문이라 member가 아닌 과제의 release는 이름조차 보이면 안 된다(01장 §2.2).
   */
  /**
   * `projectIds`가 오면(FE legend 필터, 사용자 요청) scope가 이미 허용한 project
   * 집합과 교집합만 취한다 — 필터가 scope보다 넓은 project를 몰래 열어주지 않는다.
   * 교집합이 빈 배열이면(0개 선택, 또는 scope 밖 id만 보냄) 호출부가 "결과 없음"으로 다룬다.
   */
  private effectiveProjectIds(scope: MyScope, projectIds?: string[]): string[] {
    if (!projectIds) return scope.isAdmin ? [] : scope.projectIds;
    if (scope.isAdmin) return projectIds;
    const allowed = new Set(scope.projectIds);
    return projectIds.filter((id) => allowed.has(id));
  }

  private receivedFilter(scope: MyScope, projectIds?: string[]): Scoped<FilterQuery<ReleaseDocument>> {
    if (scope.isAdmin) {
      if (!projectIds) return {};
      const ids = this.effectiveProjectIds(scope, projectIds);
      return ids.length ? ({ projectId: { $in: ids } } as FilterQuery<ReleaseDocument>) : null;
    }
    if (!scope.projectIds.length) return null;
    const ids = this.effectiveProjectIds(scope, projectIds);
    if (!ids.length) return null;

    const clauses: FilterQuery<ReleaseDocument>[] = [{ recipientUsers: scope.knoxId }];
    for (const [projectId, departments] of scope.departmentsByProject) {
      if (departments.length) {
        clauses.push({ projectId, recipientDepartments: { $in: departments } } as FilterQuery<ReleaseDocument>);
      }
    }
    return { projectId: { $in: ids }, $or: clauses } as FilterQuery<ReleaseDocument>;
  }

  private publishedFilter(scope: MyScope, projectIds?: string[]): Scoped<FilterQuery<ReleaseDocument>> {
    if (scope.isAdmin) {
      if (!projectIds) return {};
      const ids = this.effectiveProjectIds(scope, projectIds);
      return ids.length ? ({ projectId: { $in: ids } } as FilterQuery<ReleaseDocument>) : null;
    }
    if (!scope.projectIds.length) return null;
    const ids = this.effectiveProjectIds(scope, projectIds);
    if (!ids.length) return null;

    const clauses: FilterQuery<ReleaseDocument>[] = [{ releasedBy: scope.knoxId }];
    for (const [projectId, departments] of scope.departmentsByProject) {
      if (departments.length) {
        clauses.push({ projectId, 'workflowAt.department': { $in: departments } } as FilterQuery<ReleaseDocument>);
      }
    }
    return { projectId: { $in: ids }, $or: clauses } as FilterQuery<ReleaseDocument>;
  }

  /* ---------------------------------------------------------------- *
   * 조립 헬퍼
   * ---------------------------------------------------------------- */

  private projectIndex(scope: MyScope): Map<string, ProjectDocument> {
    return new Map(scope.projects.map((p) => [p._id.toString(), p]));
  }

  private toReleaseRow(
    release: ReleaseDocument,
    scope: MyScope,
    projectById: Map<string, ProjectDocument>,
  ): MyReleaseRowDto {
    const projectId = release.projectId.toString();
    const project = projectById.get(projectId);
    const myDepts = scope.departmentsByProject.get(projectId) ?? [];

    const recipientDepartments = release.recipientDepartments ?? [];
    const myRecipientDepartments = recipientDepartments.filter((d) => myDepts.includes(d));
    const received =
      (release.recipientUsers ?? []).includes(scope.knoxId) || myRecipientDepartments.length > 0;
    const published =
      release.releasedBy === scope.knoxId || myDepts.includes(release.workflowAt?.department ?? '');

    return {
      id: release._id.toString(),
      projectId,
      projectCode: project?.code ?? '',
      projectName: project?.name ?? '',
      workflowId: release.workflowId.toString(),
      seq: release.seq,
      label: `v${release.seq}`,
      releasedAt: release.releasedAt.toISOString(),
      releasedBy: release.releasedBy,
      note: release.note ?? '',
      workflowAt: {
        name: release.workflowAt?.name ?? '',
        department: release.workflowAt?.department ?? '',
      },
      itemCount: (release.items ?? []).length,
      changedCount: (release.items ?? []).filter((i) => i.changed).length,
      myRecipientDepartments,
      received,
      published,
    };
  }

  /**
   * 한 버전 엔트리의 "언제 일어났는가".
   *
   * 공식 확정된 버전은 `publishedAt`이 그 시점이고, 아직 확정 전인(working) 엔트리는
   * 그 값이 null이라 SIREN이 그 사실을 관측한 `observedAt`을 쓴다. 둘 다 없는 수동
   * 기록(C tier의 assertedAt)이나 옛 문서는 `createdAt`으로 떨어진다.
   */
  private versionDate(v: ArtifactVersion): Date {
    return v.publishedAt ?? v.observedAt ?? v.assertedAt ?? v.createdAt ?? new Date(0);
  }

  private latestVersion(versions: ArtifactVersion[]): ArtifactVersion | null {
    if (!versions.length) return null;
    return [...versions].sort((a, b) => this.versionDate(b).getTime() - this.versionDate(a).getTime())[0];
  }

  /** artifact 문서 자체의 갱신과 마지막 버전 사건 중 더 최근 쪽. */
  private lastActivityAt(artifact: ArtifactDocument): Date {
    const docUpdated = (artifact as unknown as { updatedAt?: Date }).updatedAt ?? null;
    const latest = this.latestVersion(artifact.versions ?? []);
    const versionAt = latest ? this.versionDate(latest) : null;
    const times = [docUpdated, versionAt].filter(Boolean).map((d) => (d as Date).getTime());
    return times.length ? new Date(Math.max(...times)) : new Date(0);
  }
}
