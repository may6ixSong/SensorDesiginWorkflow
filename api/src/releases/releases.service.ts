import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Release, ReleaseDocument, ReleaseItem, ReleasedVersion } from './schemas/release.schema';
import { Workflow, WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { WorkflowNodeDocument } from '../nodes/schemas/node.schema';
import { ArtifactDocument, ArtifactVersion } from '../artifacts/schemas/artifact.schema';
import { NodesService } from '../nodes/nodes.service';
import { ArtifactsService, majorKeyOf } from '../artifacts/artifacts.service';
import { EdgesService } from '../edges/edges.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../common/actor';
import {
  baselineByArtifact,
  resolveTargetDepartments,
  selectReleasableNodes,
  spilloverDepartments,
} from './release-policy';

/** preview 응답의 한 줄. release 실행 결과와 같은 로직으로 만들어진다. */
export interface ReleasePreviewItem {
  nodeId: string;
  artifactId: string;
  artifactName: string;
  tier: string;
  network: string | null;
  phaseId: string;
  phaseName: string;
  published: ReleasedVersion | null;
  changed: boolean;
  firstTime: boolean;
  lookupFailed: boolean;
  recipients: { departments: string[]; users: string[] };
  /**
   * changed:true 인 항목만 채워진다 — 그 경우에만 화면에 picker를 띄운다.
   * changed:false 는 직전 release의 선택을 그대로 이어받으므로 후보를 계산하지 않는다
   * (설계서 05장 §4.2).
   */
  sources: {
    nodeId: string;
    artifactId: string;
    artifactName: string;
    /** 최신순 published 목록. 비어 있으면 그 source는 아직 한 번도 publish되지 않았다. */
    candidates: ReleasedVersion[];
    /** 기본 선택값 = 최신 published. 없으면 null(= `없음/None`). */
    defaultVersionRef: string | null;
    selected: ReleasedVersion | null;
  }[];
}

export interface ReleasePreview {
  workflowId: string;
  nextSeq: number;
  items: ReleasePreviewItem[];
  changedCount: number;
  /** 해석된 타겟 부서 — 요청이 All이었으면 실제로 받게 되는 부서 전체(스펙 §4.1). */
  targetDepartments: string[];
  /** 다이얼로그 탭 구성 — 타겟 ∪ spillover. `isTarget:false`가 spillover다(스펙 §6.4). */
  departments: { id: string; itemCount: number; isTarget: boolean }[];
  /** artifact는 매핑됐지만 recipient 부서가 없어 전달되지 않는 node 수(스펙 §2.1). */
  excludedNoRecipient: number;
}

/**
 * Release — 이 workflow의 산출물들을 각 수신 부서에게 **전달**하는 행위(설계서 05장).
 *
 * ★ 캔버스 스냅샷을 찍지 않는다. 표 형태의 산출물 목록만 남긴다.
 * ★ 생성 후 수정·삭제·철회가 불가능하다. 그래서 이 서비스에는 update/delete 메서드를
 *   **의도적으로 두지 않는다** — 나중에 실수로 열리는 것을 막기 위해서다(설계서 05장 §4.5).
 */
@Injectable()
export class ReleasesService {
  private readonly logger = new Logger(ReleasesService.name);

  constructor(
    @InjectModel(Release.name) private readonly model: Model<ReleaseDocument>,
    @InjectModel(Workflow.name) private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>,
    private readonly nodes: NodesService,
    private readonly artifacts: ArtifactsService,
    private readonly edges: EdgesService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  /* ---------------------------------------------------------------- *
   * 조회
   * ---------------------------------------------------------------- */

  listForWorkflow(workflowId: string) {
    return this.model.find({ workflowId }).sort({ seq: -1 }).exec();
  }

  async findOrThrow(releaseId: string): Promise<ReleaseDocument> {
    const release = await this.model.findById(releaseId).exec();
    if (!release) throw new NotFoundException('Release not found.');
    return release;
  }

  /**
   * 변경 감지와 source 이어받기의 기준점 — **산출물별로** "그걸 담았던 직전 release의
   * item"이다(스펙 §3). 직전 release 한 건만 보던 옛 방식과 달리, 중간 release에 그
   * 산출물이 빠져 있어도 올바른 기준점이 잡힌다.
   *
   * ★ `CanvasViewService`(nodes/canvas-view.service.ts)의 publish 배지 계산도 이 메서드를
   *   쓴다 — 부서 타겟팅 이후로는 "가장 최근 release 한 건"만 보면 안 된다. 타겟이 B인
   *   release는 recipient가 A뿐인 산출물 X를 담지 않으므로, X가 두 release 전(A 타겟)에
   *   나갔더라도 최신 release 한 건짜리 기준으로는 "한 번도 안 나감"으로 오판된다. 부서
   *   타겟팅 하에서는 이게 예외가 아니라 일상적인 경우라 산출물별 기준점이 맞다.
   *
   * `.limit(1)`을 쓰지 않는다 — 인메모리 드라이버가 그 체이닝을 지원하지 않아 두 모드의
   * 동작이 갈린다. release 수는 workflow당 많아야 수십 건이라 전량 조회로도 충분하다.
   */
  async baselineFor(workflowId: string | Types.ObjectId): Promise<Map<string, ReleaseItem>> {
    const newestFirst = await this.model.find({ workflowId }).sort({ seq: -1 }).exec();
    return baselineByArtifact(newestFirst);
  }

  /**
   * 이 workflow가 release를 한 번이라도 낸 적이 있는가. `CanvasViewService`가 publish
   * 배지를 "신규"와 "그 major는 이미 나갔던 적 있음"으로 가르는 데 쓴다 — `baselineFor()`의
   * 결과가 비어 있는 것과는 별개 질문이다(그 map이 비어 있는 건 "이 workflow가 release를
   * 한 번도 안 냈다"뿐 아니라 "release는 냈지만 이 산출물이 그중 어디에도 없었다"에서도
   * 나올 수 있다) — 그래서 명시적으로 따로 묻는다.
   */
  async hasAnyRelease(workflowId: string | Types.ObjectId): Promise<boolean> {
    return (await this.model.countDocuments({ workflowId })) > 0;
  }

  /** 부서별 필터 뷰 — "우리 부서가 받은 것"(설계서 05장 §7.2). workflow 경계를 넘어 모은다. */
  listForDepartment(projectId: string, department: string) {
    return this.model
      .find({ projectId, recipientDepartments: department })
      .sort({ releasedAt: -1 })
      .exec();
  }

  /** artifact별 타임라인 — 버전 트리 위의 release 마커가 이걸 쓴다(설계서 05장 §7.3). */
  listForArtifact(artifactId: string) {
    return this.model.find({ 'items.artifactId': artifactId }).sort({ releasedAt: -1 }).exec();
  }

  /* ---------------------------------------------------------------- *
   * Preview — 실제 release와 같은 로직
   * ---------------------------------------------------------------- */

  /**
   * 지금 release하면 무엇이 나갈지 계산한다.
   *
   * ★ 실행(create)과 **같은 함수를 쓴다** — 미리보기와 결과가 어긋나면 안 되기 때문이다.
   *
   * 평소 캔버스 렌더링은 외부 서비스를 한 번도 호출하지 않는다. 라이브 조회는 여기와
   * 산출물 상세 slide를 열 때뿐이다(설계서 05장 §8).
   */
  async preview(
    workflow: WorkflowDocument,
    _actor: Actor,
    target: string[] = [],
  ): Promise<ReleasePreview> {
    const { items, excludedNoRecipient } = await this.buildItems(workflow, target);
    const targetDepartments = resolveTargetDepartments(items, target);
    const spillover = spilloverDepartments(items, target);

    const countFor = (dept: string) =>
      items.filter((i) => i.recipients.departments.includes(dept)).length;

    return {
      workflowId: workflow._id.toString(),
      nextSeq: (workflow.releaseSeq ?? 0) + 1,
      items,
      changedCount: items.filter((i) => i.changed).length,
      targetDepartments,
      departments: [
        ...targetDepartments.map((id) => ({ id, itemCount: countFor(id), isTarget: true })),
        ...spillover.map((id) => ({ id, itemCount: countFor(id), isTarget: false })),
      ],
      excludedNoRecipient,
    };
  }

  private async buildItems(
    workflow: WorkflowDocument,
    target: string[],
  ): Promise<{ items: ReleasePreviewItem[]; excludedNoRecipient: number }> {
    const candidates = await this.nodes.releasableForWorkflow(workflow._id);
    // ★ 포함 항목 선택은 policy 함수 하나만 쓴다 — preview와 create가 어긋나지 않게(§8).
    const { selected, excludedNoRecipient } = selectReleasableNodes(candidates, target);

    // ★ artifact는 **후보 전체**로 한 번만 읽는다 — 선택되지 않은 node도 flow상 upstream으로
    //   잡힐 수 있어 source 후보 계산에 필요하다. 선택된 것만 따로 또 읽지 않는다.
    const artifactMap = await this.artifacts.findMany(candidates.map((n) => n.artifactId!));
    const baseline = await this.baselineFor(workflow._id);
    const upstream = await this.edges.upstreamMap(workflow._id);
    const phaseName = new Map((workflow.phases ?? []).map((p) => [p.id, p.name]));
    const nodeById = new Map(candidates.map((n) => [n._id.toString(), n]));

    // 버전 해석은 실제로 나갈 항목에만 필요하다.
    const resolved = new Map<string, { version: ReleasedVersion | null; lookupFailed: boolean }>();
    for (const node of selected) {
      const a = artifactMap.get(node.artifactId!.toString());
      if (a) resolved.set(a._id.toString(), this.resolveLatestPublished(a));
    }

    const items: ReleasePreviewItem[] = [];

    for (const node of selected) {
      const artifact = artifactMap.get(node.artifactId!.toString());
      if (!artifact) continue;

      const artifactId = artifact._id.toString();
      const current = resolved.get(artifactId) ?? { version: null, lookupFailed: false };
      const previousItem = baseline.get(artifactId);
      const firstTime = !previousItem;

      // 변경 감지는 major 단위로만 한다 — minor는 비교하지 않는다(설계서 05장 §3).
      const changed =
        firstTime || (current.version?.majorKey ?? null) !== (previousItem?.published?.majorKey ?? null);

      const sources = changed
        ? this.buildSourceCandidates(node, upstream, nodeById, artifactMap)
        : // 바뀌지 않은 산출물은 **그걸 담았던 직전 release**의 선택을 그대로 이어받는다
          // (스펙 §3) — 사용자가 매번 똑같은 선택을 반복하지 않게 한다.
          (previousItem?.sources ?? []).map((s) => ({
            nodeId: s.nodeId,
            artifactId: s.artifactId ?? '',
            artifactName: s.artifactName,
            candidates: [] as ReleasedVersion[],
            defaultVersionRef: s.selected?.versionRef ?? null,
            selected: s.selected ?? null,
          }));

      items.push({
        nodeId: node._id.toString(),
        artifactId,
        artifactName: artifact.name,
        tier: artifact.tier,
        network: artifact.network,
        phaseId: node.phaseId,
        phaseName: phaseName.get(node.phaseId) ?? '',
        published: current.version,
        changed,
        firstTime,
        lookupFailed: current.lookupFailed,
        recipients: this.recipientsFor(node),
        sources,
      });
    }

    return { items, excludedNoRecipient };
  }

  /**
   * flow 직전 1홉 upstream의 source 후보를 만든다(설계서 05장 §4.2).
   * 기본값은 그 source의 **최신 published**이고, 하나도 없으면 null(= `없음/None`)이다.
   * **그래도 release는 막지 않는다.**
   */
  private buildSourceCandidates(
    node: WorkflowNodeDocument,
    upstream: Map<string, string[]>,
    nodeById: Map<string, WorkflowNodeDocument>,
    artifactMap: Map<string, ArtifactDocument>,
  ) {
    // 후보는 그 source의 **published 이력 전체**다(최신순). 지금 라이브로 해석한 "현재
    // 최신"과 달리 과거 버전도 고를 수 있어야 하므로 SIREN 로컬 기록을 그대로 쓴다.
    const sourceNodeIds = upstream.get(node._id.toString()) ?? [];
    const out: ReleasePreviewItem['sources'] = [];

    for (const sourceNodeId of sourceNodeIds) {
      const sourceNode = nodeById.get(sourceNodeId);
      // 미매핑 노드는 전달할 실체가 없으므로 source로도 잡지 않는다.
      if (!sourceNode?.artifactId) continue;
      const sourceArtifact = artifactMap.get(sourceNode.artifactId.toString());
      if (!sourceArtifact) continue;

      const candidates = this.artifacts
        .publishedVersions(sourceArtifact)
        .map((v) => this.toReleasedVersion(v));
      const latest = candidates[0] ?? null;

      out.push({
        nodeId: sourceNodeId,
        artifactId: sourceArtifact._id.toString(),
        artifactName: sourceArtifact.name,
        candidates,
        defaultVersionRef: latest?.versionRef ?? null,
        selected: latest,
      });
    }

    return out;
  }

  /**
   * 이 산출물이 전달될 대상(설계서 05장 §6.2) — 그 **node**의 recipients. A/B/C 전부
   * 공통이다(같은 workflow마다 다를 수 있다). artifact 단위로 SIREN이 따로 들고 있던
   * 옛 모델(viewAccess/editAccess)은 폐기했다.
   */
  private recipientsFor(node: WorkflowNodeDocument) {
    return {
      departments: [...(node.recipients?.departments ?? [])],
      users: [...(node.recipients?.users ?? [])],
    };
  }

  /**
   * 그 산출물의 "지금 최신 published"를 해석한다 — **SIREN 캐시에서 읽는다.** A/B/C
   * (OA Service/File Artifacts/HPC Service) 전부 event + 야간 재동기화로 이미
   * `artifact.versions`에 채워져 있으므로(설계서 07장 §3·§4), release/preview 시점에
   * 그 서비스로 라이브 조회를 하지 않는다(05장 §8). `lookupFailed`는 이제 항상 false다 —
   * 필드는 응답 모양을 유지하기 위해 남겨둔다.
   */
  private resolveLatestPublished(
    artifact: ArtifactDocument,
  ): { version: ReleasedVersion | null; lookupFailed: boolean } {
    const local = this.artifacts.latestPublished(artifact);
    return { version: local ? this.toReleasedVersion(local) : null, lookupFailed: false };
  }

  private toReleasedVersion(v: ArtifactVersion): ReleasedVersion {
    return {
      versionLabel: v.versionLabel,
      versionRef: v.versionRef ?? null,
      majorKey: majorKeyOf(v.versionLabel),
      publishedAt: v.publishedAt ?? v.observedAt ?? null,
      viewUrl: v.viewUrl ?? null,
      hpcPath: v.hpcPath ?? null,
      giverKnoxId: v.giverKnoxId ?? null,
    };
  }

  /* ---------------------------------------------------------------- *
   * 실행
   * ---------------------------------------------------------------- */

  /**
   * release 실행. 권한은 **Edit Access 전원**이며 컨트롤러가 이미 검증하고 들어온다.
   *
   * @param sourceSelections nodeId → (sourceNodeId → versionRef|null).
   *        changed:true 인 항목에 대해서만 사용자가 고른 값이 온다. 나머지는 무시된다 —
   *        직전 release에서 이어받은 값을 서버가 쓴다.
   */
  async create(
    workflow: WorkflowDocument,
    input: { note: string; sources?: Record<string, Record<string, string | null>>; targetDepartments?: string[] },
    actor: Actor,
  ): Promise<ReleaseDocument> {
    const note = (input.note ?? '').trim();
    if (!note) throw new BadRequestException('A release note is required.');

    const project = await this.projectModel.findById(workflow.projectId).exec();
    const knownDepartments = new Set((project?.departments ?? []).map((d) => d.id));
    const target = [...new Set(input.targetDepartments ?? [])];
    const unknown = target.filter((d) => !knownDepartments.has(d));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown department: ${unknown.join(', ')}`);
    }

    const { items: previewItems } = await this.buildItems(workflow, target);
    if (previewItems.length === 0) {
      throw new BadRequestException(
        target.length > 0
          ? 'There is nothing to release for the selected departments.'
          : 'There is nothing to release — no node has an artifact mapped with a recipient department.',
      );
    }

    // workflowAt.departmentLabel — 그 순간의 부서 이름을 얼려 둔다(02장 §9.4). id
    // 자체(workflow.department)는 살아있는 한 항상 Project.departments에서 다시 찾아
    // 최신 이름을 보여주고, 이 label은 그 부서가 나중에 지워졌을 때만 쓰이는 대체값이다.
    const departmentLabel =
      project?.departments.find((d) => d.id === workflow.department)?.name ?? workflow.department;

    const selections = input.sources ?? {};
    const items: ReleaseItem[] = previewItems.map((item) => {
      const picked = selections[item.nodeId] ?? {};
      return {
        nodeId: item.nodeId,
        artifactId: item.artifactId,
        artifactName: item.artifactName,
        tier: item.tier as ReleaseItem['tier'],
        network: item.network,
        phaseId: item.phaseId,
        phaseName: item.phaseName,
        published: item.published,
        changed: item.changed,
        firstTime: item.firstTime,
        recipients: item.recipients,
        lookupFailed: item.lookupFailed,
        sources: item.sources.map((s) => ({
          nodeId: s.nodeId,
          artifactId: s.artifactId,
          artifactName: s.artifactName,
          // changed 항목만 사용자 선택을 반영한다. 고르지 않았으면 기본값(최신 published),
          // 그마저 없으면 null — 받는 쪽에 "아직 전달되지 않음"으로 보인다.
          selected: item.changed
            ? this.pickSource(s, picked[s.nodeId])
            : s.selected,
        })),
      } as ReleaseItem;
    });

    const departments = new Set<string>();
    const users = new Set<string>();
    for (const item of items) {
      item.recipients.departments.forEach((d) => departments.add(d));
      item.recipients.users.forEach((u) => users.add(u));
    }

    // seq는 원자적으로 증가시켜 동시 클릭에도 순번이 겹치지 않게 한다.
    const bumped = await this.workflowModel
      .findOneAndUpdate({ _id: workflow._id }, { $inc: { releaseSeq: 1 } }, { new: true })
      .exec();
    const seq = bumped?.releaseSeq ?? (workflow.releaseSeq ?? 0) + 1;

    // ★ 이 프로젝트는 실제 트랜잭션(session)을 쓰지 않는다(인메모리 목업 드라이버가 지원하지
    //   않는다 — database/in-memory-driver.ts) — 그래서 증가와 문서 생성을 하나로 묶을 수는
    //   없다. 대신 문서 생성이 실패하면 방금 올린 seq를 되돌려, "카운터만 올라가고 release
    //   문서는 없는" 상태(관측된 실제 버그 — 개발 DB의 releaseSeq=3인데 release 문서 0건)가
    //   남지 않게 한다.
    let release: ReleaseDocument;
    try {
      release = await this.model.create({
        projectId: workflow.projectId,
        workflowId: workflow._id,
        seq,
        releasedAt: new Date(),
        releasedBy: actor.knoxId,
        note,
        workflowAt: { name: workflow.name, department: workflow.department, departmentLabel },
        items,
        targetDepartments: resolveTargetDepartments(items, target),
        recipientDepartments: [...departments],
        recipientUsers: [...users],
        isMock: false,
      });
    } catch (e) {
      await this.workflowModel
        .updateOne({ _id: workflow._id }, { $inc: { releaseSeq: -1 } })
        .exec()
        .catch((rollbackError) => {
          this.logger.error(
            `Release seq rollback failed for workflow ${workflow._id.toString()} (seq ${seq}) — ${(rollbackError as Error).message}`,
          );
        });
      throw e;
    }

    await this.audit.log(actor, 'RELEASE_CREATE', 'release', release._id, {
      workflowId: workflow._id.toString(),
      seq,
      itemCount: items.length,
      changedCount: items.filter((i) => i.changed).length,
    });

    // ★ 알림 전송 실패로 release를 롤백하지 않는다 — release는 확정하고, 전달 사실 자체는
    //   이 문서가 이미 증명한다(설계서 05장 §6.4).
    await this.notifications.notifyRelease(release).catch((e) => {
      this.logger.error(`Release notification failed for v${seq} — ${(e as Error).message}`);
    });

    return release;
  }

  private pickSource(
    source: ReleasePreviewItem['sources'][number],
    chosenRef: string | null | undefined,
  ): ReleasedVersion | null {
    if (chosenRef === undefined) return source.selected;
    if (chosenRef === null) return null;
    return source.candidates.find((c) => c.versionRef === chosenRef) ?? source.selected;
  }
}
