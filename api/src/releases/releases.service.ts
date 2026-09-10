import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Release, ReleaseDocument, ReleaseItem, ReleasedVersion } from './schemas/release.schema';
import { Workflow, WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { BlockDocument } from '../blocks/schemas/block.schema';
import { ArtifactDocument, ArtifactVersion } from '../artifacts/schemas/artifact.schema';
import { BlocksService } from '../blocks/blocks.service';
import { ArtifactsService, majorKeyOf } from '../artifacts/artifacts.service';
import { EdgesService } from '../edges/edges.service';
import { HubService } from '../hub/hub.service';
import { ObserverClientService } from '../hub/observer-client.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../common/actor';
import { isServiceGovernedTier } from '../common/constants/tier';

/** preview 응답의 한 줄. release 실행 결과와 같은 로직으로 만들어진다. */
export interface ReleasePreviewItem {
  blockId: string;
  artifactId: string;
  artifactName: string;
  tier: string;
  network: string;
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
    blockId: string;
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
    private readonly blocks: BlocksService,
    private readonly artifacts: ArtifactsService,
    private readonly edges: EdgesService,
    private readonly hub: HubService,
    private readonly observer: ObserverClientService,
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
   * 직전 release — 변경 감지와 source 이어받기의 기준점이다.
   *
   * `.limit(1)`을 쓰지 않는다 — 인메모리 드라이버(in-memory-driver.ts)가 그 체이닝을
   * 지원하지 않아 두 모드의 동작이 갈린다. 정렬된 결과의 첫 항목을 쓰면 양쪽 모두에서
   * 같게 동작한다. release 수는 workflow당 많아야 수십 건이라 비용도 문제되지 않는다.
   */
  async previous(workflowId: string | Types.ObjectId): Promise<ReleaseDocument | null> {
    const all = await this.model.find({ workflowId }).sort({ seq: -1 }).exec();
    return all[0] ?? null;
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
  async preview(workflow: WorkflowDocument, actor: Actor): Promise<ReleasePreview> {
    const items = await this.buildItems(workflow, actor);
    return {
      workflowId: workflow._id.toString(),
      nextSeq: (workflow.releaseSeq ?? 0) + 1,
      items,
      changedCount: items.filter((i) => i.changed).length,
    };
  }

  private async buildItems(workflow: WorkflowDocument, actor: Actor): Promise<ReleasePreviewItem[]> {
    const blocks = await this.blocks.releasableForWorkflow(workflow._id);
    const artifactMap = await this.artifacts.findMany(blocks.map((b) => b.artifactId!));
    const prev = await this.previous(workflow._id);
    const prevByArtifact = new Map((prev?.items ?? []).map((i) => [i.artifactId, i]));
    const upstream = await this.edges.upstreamMap(workflow._id);
    const phaseName = new Map((workflow.phases ?? []).map((p) => [p.id, p.name]));
    const blockById = new Map(blocks.map((b) => [b._id.toString(), b]));

    // 각 artifact의 "지금 최신 published"를 한 번씩만 해석한다.
    const resolved = new Map<string, { version: ReleasedVersion | null; lookupFailed: boolean }>();
    await Promise.all(
      [...artifactMap.values()].map(async (a) => {
        resolved.set(a._id.toString(), await this.resolveLatestPublished(a, actor));
      }),
    );

    const items: ReleasePreviewItem[] = [];

    for (const block of blocks) {
      const artifact = artifactMap.get(block.artifactId!.toString());
      if (!artifact) continue;

      const artifactId = artifact._id.toString();
      const current = resolved.get(artifactId) ?? { version: null, lookupFailed: false };
      const previousItem = prevByArtifact.get(artifactId);
      const firstTime = !previousItem;

      // 변경 감지는 major 단위로만 한다 — minor는 비교하지 않는다(설계서 05장 §3).
      const changed =
        firstTime || (current.version?.majorKey ?? null) !== (previousItem?.published?.majorKey ?? null);

      const sources = changed
        ? this.buildSourceCandidates(block, upstream, blockById, artifactMap)
        : // 바뀌지 않은 산출물은 직전 release의 선택을 그대로 이어받는다 — 사용자가 매번
          // 똑같은 선택을 반복하지 않게 한다(설계서 05장 §4.2).
          (previousItem?.sources ?? []).map((s) => ({
            blockId: s.blockId,
            artifactId: s.artifactId ?? '',
            artifactName: s.artifactName,
            candidates: [] as ReleasedVersion[],
            defaultVersionRef: s.selected?.versionRef ?? null,
            selected: s.selected ?? null,
          }));

      items.push({
        blockId: block._id.toString(),
        artifactId,
        artifactName: artifact.name,
        tier: artifact.tier,
        network: artifact.network,
        phaseId: block.phaseId,
        phaseName: phaseName.get(block.phaseId) ?? '',
        published: current.version,
        changed,
        firstTime,
        lookupFailed: current.lookupFailed,
        recipients: this.recipientsFor(block, artifact),
        sources,
      });
    }

    return items;
  }

  /**
   * flow 직전 1홉 upstream의 source 후보를 만든다(설계서 05장 §4.2).
   * 기본값은 그 source의 **최신 published**이고, 하나도 없으면 null(= `없음/None`)이다.
   * **그래도 release는 막지 않는다.**
   */
  private buildSourceCandidates(
    block: BlockDocument,
    upstream: Map<string, string[]>,
    blockById: Map<string, BlockDocument>,
    artifactMap: Map<string, ArtifactDocument>,
  ) {
    // 후보는 그 source의 **published 이력 전체**다(최신순). 지금 라이브로 해석한 "현재
    // 최신"과 달리 과거 버전도 고를 수 있어야 하므로 SIREN 로컬 기록을 그대로 쓴다.
    const sourceBlockIds = upstream.get(block._id.toString()) ?? [];
    const out: ReleasePreviewItem['sources'] = [];

    for (const sourceBlockId of sourceBlockIds) {
      const sourceBlock = blockById.get(sourceBlockId);
      // 미매핑 블록은 전달할 실체가 없으므로 source로도 잡지 않는다.
      if (!sourceBlock?.artifactId) continue;
      const sourceArtifact = artifactMap.get(sourceBlock.artifactId.toString());
      if (!sourceArtifact) continue;

      const candidates = this.artifacts
        .publishedVersions(sourceArtifact)
        .map((v) => this.toReleasedVersion(v));
      const latest = candidates[0] ?? null;

      out.push({
        blockId: sourceBlockId,
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
   * 이 산출물이 전달될 대상(설계서 05장 §6.2).
   *   A     → 그 **block**의 recipients(edit + view) — workflow마다 다를 수 있다
   *   B/C/D → 그 **artifact**의 viewAccess + editAccess — 모든 workflow에서 동일
   */
  private recipientsFor(block: BlockDocument, artifact: ArtifactDocument) {
    const departments = new Set<string>();
    const users = new Set<string>();

    if (isServiceGovernedTier(artifact.tier)) {
      for (const g of [block.recipients?.editAccess, block.recipients?.viewAccess]) {
        (g?.departments ?? []).forEach((d) => departments.add(d));
        (g?.users ?? []).forEach((u) => users.add(u));
      }
    } else {
      for (const g of [artifact.viewAccess, artifact.editAccess]) {
        (g?.departments ?? []).forEach((d) => departments.add(d));
        (g?.users ?? []).forEach((u) => users.add(u));
      }
    }

    return { departments: [...departments], users: [...users] };
  }

  /**
   * 그 산출물의 "지금 최신 published"를 해석한다.
   *   A/B (연동 있음) → 이 시점에 서비스에 라이브 조회
   *   C/D             → SIREN 로컬 기록
   *
   * ★ 조회에 실패한 서비스는 **SIREN이 마지막으로 알고 있던 값**을 쓰고 lookupFailed를
   *   세운다. release를 막지는 않는다(설계서 05장 §8).
   */
  private async resolveLatestPublished(
    artifact: ArtifactDocument,
    actor: Actor,
  ): Promise<{ version: ReleasedVersion | null; lookupFailed: boolean }> {
    const local = this.artifacts.latestPublished(artifact);
    const localVersion = local ? this.toReleasedVersion(local) : null;

    const needsLive = artifact.serviceKey && artifact.externalArtifactId && artifact.tier !== 'C' && artifact.tier !== 'D';
    if (!needsLive) return { version: localVersion, lookupFailed: false };

    try {
      const svc = await this.hub.findByKeyOrThrow(artifact.serviceKey!);
      // release는 개인화된 조회가 아니라 공식 행위다 — 누가 눌러도 얼려지는 값이 같아야
      // 하므로 admin 시야(isAdmin=true)를 넘기지 않는다.
      const record = await this.observer.currentVersion(
        svc,
        artifact.externalArtifactId!,
        actor.knoxId,
        false,
      );
      if (!record) return { version: localVersion, lookupFailed: true };
      if (!record.isReleased) return { version: null, lookupFailed: false };

      const entry = this.observer.toVersionEntry(record, artifact.tier === 'A' ? 'A' : 'B');
      return { version: this.toReleasedVersion(entry as ArtifactVersion), lookupFailed: false };
    } catch (e) {
      this.logger.warn(`Live version lookup failed for ${artifact.name} — ${(e as Error).message}`);
      return { version: localVersion, lookupFailed: true };
    }
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
   * @param sourceSelections blockId → (sourceBlockId → versionRef|null).
   *        changed:true 인 항목에 대해서만 사용자가 고른 값이 온다. 나머지는 무시된다 —
   *        직전 release에서 이어받은 값을 서버가 쓴다.
   */
  async create(
    workflow: WorkflowDocument,
    input: { note: string; sources?: Record<string, Record<string, string | null>> },
    actor: Actor,
  ): Promise<ReleaseDocument> {
    const note = (input.note ?? '').trim();
    if (!note) throw new BadRequestException('A release note is required.');

    const previewItems = await this.buildItems(workflow, actor);
    if (previewItems.length === 0) {
      throw new BadRequestException('There is nothing to release — no block has an artifact mapped.');
    }

    const selections = input.sources ?? {};
    const items: ReleaseItem[] = previewItems.map((item) => {
      const picked = selections[item.blockId] ?? {};
      return {
        blockId: item.blockId,
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
          blockId: s.blockId,
          artifactId: s.artifactId,
          artifactName: s.artifactName,
          // changed 항목만 사용자 선택을 반영한다. 고르지 않았으면 기본값(최신 published),
          // 그마저 없으면 null — 받는 쪽에 "아직 전달되지 않음"으로 보인다.
          selected: item.changed
            ? this.pickSource(s, picked[s.blockId])
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

    const release = await this.model.create({
      projectId: workflow.projectId,
      workflowId: workflow._id,
      seq,
      releasedAt: new Date(),
      releasedBy: actor.knoxId,
      note,
      workflowAt: { name: workflow.name, department: workflow.department },
      items,
      recipientDepartments: [...departments],
      recipientUsers: [...users],
      isMock: false,
    });

    await this.audit.log(actor.knoxId, 'RELEASE_CREATE', 'release', release._id, {
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
