import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AutoRun, AutoRunDocument, AutoRunFailureKind, AutoRunSource, AutoRunSourceError, AutoRunStatus, ACTIVE_AUTO_RUN_STATUSES,
} from './schemas/auto-run.schema';
import { WorkflowNode, WorkflowNodeDocument } from '../nodes/schemas/node.schema';
import { Workflow, WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { Artifact, ArtifactDocument, ArtifactVersion } from '../artifacts/schemas/artifact.schema';
import { ArtifactService, ArtifactServiceDocument } from '../hub/schemas/artifact-service.schema';
import { EdgesService } from '../edges/edges.service';
import { NotificationService } from '../notifications/notification.service';
import { Actor } from '../common/actor';
import { AutoRunDispatcher } from './auto-run.dispatcher';
import { FlowEdge, downstreamOf, isOnCycle, shouldAutoFire, upstreamOf } from './auto-run-policy';
import { signSourceToken } from './source-token';

/** Calypso의 고정 serviceKey — hub/calypso-client.service.ts의 CALYPSO_SERVICE_KEY와 같은 값.
 * HubModule을 import하면 모듈 순환이 생겨(HubModule → AutoRunModule) 값만 여기 둔다. */
const CALYPSO_KEY = 'calypso';
const RUN_LIST_LIMIT = 20;
const SWEEP_INTERVAL_MS = 60_000;

/** trigger를 받을 쪽 — node에 매핑된 artifact의 서비스. */
interface ResolvedTarget {
  serviceKey: string;
  serviceName: string;
  typeKey: string | null;
  typeName: string | null;
  baseUrl: string;
  token: string;
  /** Calypso probe(개발 검증용)로 보내는 중인가. */
  isCalypsoProbe: boolean;
}

interface CollectedSource {
  node: WorkflowNodeDocument;
  artifact: ArtifactDocument;
  /** 가장 최신 published 버전 — 없으면 null. */
  published: ArtifactVersion | null;
}

export interface AutoRunEligibility {
  eligible: boolean;
  reasons: string[];
}

export interface AutoRunRunDto {
  id: string;
  trigger: 'auto' | 'manual';
  requestedBy: string | null;
  status: AutoRunStatus;
  message: string | null;
  failureKind: AutoRunFailureKind | null;
  sourceErrors: AutoRunSourceError[];
  externalJobId: string | null;
  resultVersionLabel: string | null;
  causeArtifactId: string | null;
  causeVersionLabel: string | null;
  sources: AutoRunSource[];
  attempts: number;
  queuedAt: Date;
  dispatchedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface AutoRunStateDto {
  /** 서버 전역 kill switch(AUTO_RUN_ENABLED). false면 아무것도 발화하지 않는다. */
  serverEnabled: boolean;
  enabled: boolean;
  updatedBy: string | null;
  updatedAt: Date | null;
  eligibility: AutoRunEligibility;
  target: { serviceName: string; typeName: string | null; isCalypsoProbe: boolean } | null;
  sources: {
    nodeId: string;
    nodeName: string;
    artifactName: string;
    versionLabel: string | null;
    publishedAt: Date | null;
  }[];
  /** 대상 artifact의 최신 버전(published 여부 무관) 시각 — 자동 발화 조건의 기준선. */
  targetLatestAt: Date | null;
  runs: AutoRunRunDto[];
}

/** 캔버스 node 카드가 그리는 요약(설계서 10장 §8.1). */
export interface AutoRunNodeSummary {
  enabled: boolean;
  activeStatus: AutoRunStatus | null;
}

export interface AutoRunStatusInput {
  triggerRunId: string;
  status: 'running' | 'succeeded' | 'failed';
  message?: string | null;
  versionLabel?: string | null;
  externalJobId?: string | null;
  failureKind?: AutoRunFailureKind | null;
  sourceErrors?: {
    sirenArtifactId?: string | null;
    externalArtifactId?: string | null;
    nodeId?: string | null;
    versionLabel?: string | null;
    message: string;
  }[] | null;
}

function toRunDto(r: AutoRunDocument): AutoRunRunDto {
  return {
    id: r._id.toString(),
    trigger: r.trigger,
    requestedBy: r.requestedBy ?? null,
    status: r.status,
    message: r.message ?? null,
    failureKind: r.failureKind ?? null,
    sourceErrors: (r.sourceErrors ?? []).map((e) => ({ ...e })),
    externalJobId: r.externalJobId ?? null,
    resultVersionLabel: r.resultVersionLabel ?? null,
    causeArtifactId: r.causeArtifactId ?? null,
    causeVersionLabel: r.causeVersionLabel ?? null,
    sources: (r.sources ?? []).map((s) => ({ ...s })),
    attempts: r.attempts ?? 0,
    queuedAt: r.queuedAt,
    dispatchedAt: r.dispatchedAt ?? null,
    startedAt: r.startedAt ?? null,
    finishedAt: r.finishedAt ?? null,
  };
}

function isTerminal(status: AutoRunStatus): boolean {
  return status === 'succeeded' || status === 'failed';
}

/**
 * Auto Run(설계서 10장) — node에 걸어 둔 trigger를 평가하고, 발화하면 그 node의 artifact
 * 서비스에 `POST {baseUrl}/auto-run/triggers`를 보낸 뒤 서비스의 상태 콜백을 받아 기록한다.
 *
 * ★ SIREN의 역할은 여기까지다(사용자 결정 F4): trigger 전달 → 진행/성공/실패 수신 → owner
 *   알림. 무엇을 어떻게 만들지, 버전을 발행할지 temporary로 둘지는 전부 그 서비스가 정한다.
 *   release는 언제나 사람이 한다.
 */
@Injectable()
export class AutoRunService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoRunService.name);
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectModel(AutoRun.name) private readonly runs: Model<AutoRunDocument>,
    @InjectModel(WorkflowNode.name) private readonly nodes: Model<WorkflowNodeDocument>,
    @InjectModel(Workflow.name) private readonly workflows: Model<WorkflowDocument>,
    @InjectModel(Project.name) private readonly projects: Model<ProjectDocument>,
    @InjectModel(Artifact.name) private readonly artifacts: Model<ArtifactDocument>,
    @InjectModel(ArtifactService.name) private readonly services: Model<ArtifactServiceDocument>,
    private readonly edges: EdgesService,
    private readonly dispatcher: AutoRunDispatcher,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
  ) {}

  // ── 설정값 ─────────────────────────────────────────────────────────────

  private get serverEnabled(): boolean {
    return this.config.get<boolean>('autoRun.enabled') !== false;
  }

  private get systemAccount(): string {
    return this.config.get<string>('autoRun.systemAccount') ?? 'sdp.op';
  }

  private get timeoutMinutes(): number {
    return this.config.get<number>('autoRun.timeoutMinutes') ?? 60;
  }

  // ── 생명주기 ───────────────────────────────────────────────────────────

  /**
   * in-process 큐는 재시작하면 비어 버린다(사용자 결정 G3) — 부팅 시 아직 보내지 못한
   * queued 실행을 다시 큐에 넣고, 콜백이 끊긴 실행을 닫는 타이머를 건다.
   */
  async onModuleInit(): Promise<void> {
    try {
      const pending = await this.runs.find({ status: 'queued' }).exec();
      for (const r of pending) this.enqueueDispatch(r._id.toString());
    } catch (e) {
      this.logger.warn(`could not re-queue pending auto runs — ${(e as Error).message}`);
    }
    this.sweepTimer = setInterval(() => {
      void this.sweepTimeouts();
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  // ── 대상 판정 ──────────────────────────────────────────────────────────

  /**
   * node에 매핑된 artifact가 Auto Run을 받을 수 있는 서비스인가(사용자 결정 C5) — Service
   * Manage에서 그 artifact 종류의 `supportsAutoRun`이 켜져 있어야 한다. Calypso는 지원하지
   * 않는다 — 개발 검증용 probe(AUTO_RUN_CALYPSO_PROBE)가 켜져 있을 때만 예외다.
   */
  private async resolveTarget(artifact: ArtifactDocument): Promise<{ target: ResolvedTarget | null; reason: string | null }> {
    if (!artifact.serviceKey || !artifact.externalArtifactId) {
      return { target: null, reason: 'This artifact is not linked to a service.' };
    }

    if (artifact.serviceKey === CALYPSO_KEY) {
      if (this.config.get<boolean>('autoRun.calypsoProbe') !== true) {
        return { target: null, reason: 'File Artifacts (Calypso) do not support Auto Run.' };
      }
      const svc = await this.services.findOne({ key: CALYPSO_KEY }).exec();
      const baseUrl = (this.config.get<string>('calypsoApiUrl') ?? '').replace(/\/+$/, '');
      if (!svc?.token || !baseUrl) {
        return { target: null, reason: 'The Calypso probe is on, but Calypso has no event token or API address.' };
      }
      return {
        target: {
          serviceKey: CALYPSO_KEY,
          serviceName: 'Calypso (probe)',
          typeKey: null,
          typeName: null,
          baseUrl,
          token: svc.token,
          isCalypsoProbe: true,
        },
        reason: null,
      };
    }

    const svc = await this.services.findOne({ key: artifact.serviceKey }).exec();
    if (!svc) return { target: null, reason: 'The service behind this artifact is no longer registered.' };
    if (!svc.enabled || !svc.token) return { target: null, reason: `${svc.name} is disabled in Service Manage.` };
    if (!svc.baseUrl) return { target: null, reason: `${svc.name} has no BaseURL.` };

    const types = svc.artifactTypes ?? [];
    // 종류가 하나뿐인 서비스는 artifact에 종류가 안 찍혀 있어도 그 하나로 본다.
    const type = artifact.artifactTypeKey
      ? types.find((t) => t.key === artifact.artifactTypeKey)
      : types.length === 1 ? types[0] : undefined;
    if (!type) {
      return {
        target: null,
        reason: 'SIREN does not know which artifact type this is yet. Re-pick it with "Change source", or wait for its first version event.',
      };
    }
    if (type.supportsAutoRun !== true) {
      return { target: null, reason: `"${type.name}" (${svc.name}) does not support Auto Run.` };
    }
    return {
      target: {
        serviceKey: svc.key,
        serviceName: svc.name,
        typeKey: type.key,
        typeName: type.name,
        baseUrl: svc.baseUrl.replace(/\/+$/, ''),
        token: svc.token,
        isCalypsoProbe: false,
      },
      reason: null,
    };
  }

  private async flowEdges(workflowId: Types.ObjectId | string): Promise<FlowEdge[]> {
    const list = await this.edges.listForWorkflow(workflowId.toString());
    return list.map((e) => ({ fromId: e.fromId.toString(), toId: e.toId.toString(), bidirectional: e.bidirectional === true }));
  }

  /** flow 직전 1홉 upstream 중 artifact가 매핑된 node들과 그 최신 published 버전. */
  private async collectSources(node: WorkflowNodeDocument, edges: FlowEdge[]): Promise<CollectedSource[]> {
    const upstreamIds = upstreamOf(node._id.toString(), edges);
    if (!upstreamIds.length) return [];
    const upstream = await this.nodes.find({ _id: { $in: upstreamIds } }).exec();
    const mapped = upstream.filter((n) => n.artifactId && n.workflowId.toString() === node.workflowId.toString());
    if (!mapped.length) return [];
    const artifactDocs = await this.artifacts
      .find({ _id: { $in: mapped.map((n) => n.artifactId as Types.ObjectId) } })
      .exec();
    const byId = new Map(artifactDocs.map((a) => [a._id.toString(), a]));
    const out: CollectedSource[] = [];
    for (const n of mapped) {
      const artifact = byId.get((n.artifactId as Types.ObjectId).toString());
      if (!artifact) continue;
      // versions는 최신이 index 0이다(HubSyncService.upsertVersionEntry의 불변식).
      const published = (artifact.versions ?? []).find((v) => v.isPublished) ?? null;
      out.push({ node: n, artifact, published });
    }
    return out;
  }

  /**
   * 등록/실행 가능 여부와 그 이유(설계서 10장 §3). 등록할 때·수동 실행할 때·자동 발화 직전에
   * 매번 다시 본다 — 등록 뒤에 서비스 설정이나 flow가 바뀌었을 수 있다.
   */
  async eligibility(node: WorkflowNodeDocument, edges?: FlowEdge[]): Promise<{
    eligibility: AutoRunEligibility;
    artifact: ArtifactDocument | null;
    target: ResolvedTarget | null;
    sources: CollectedSource[];
    edges: FlowEdge[];
  }> {
    const reasons: string[] = [];
    const flow = edges ?? (await this.flowEdges(node.workflowId));
    if (!this.serverEnabled) reasons.push('Auto Run is turned off on this SIREN server.');

    let artifact: ArtifactDocument | null = null;
    let target: ResolvedTarget | null = null;
    if (!node.artifactId) {
      reasons.push('Map this node to an artifact first.');
    } else {
      artifact = await this.artifacts.findById(node.artifactId).exec();
      if (!artifact) {
        reasons.push('The mapped artifact no longer exists.');
      } else {
        const resolved = await this.resolveTarget(artifact);
        target = resolved.target;
        if (resolved.reason) reasons.push(resolved.reason);
      }
    }
    if (node.intent !== 'own') {
      reasons.push('Auto Run is only available on artifacts this workflow gives (not on received ones).');
    }

    const sources = await this.collectSources(node, flow);
    if (!sources.length) {
      reasons.push('Connect at least one mapped source artifact into this node with a flow.');
    }
    if (isOnCycle(node._id.toString(), flow)) {
      reasons.push('This node is part of a flow loop (including two-way flows). Remove the loop to use Auto Run.');
    }

    return { eligibility: { eligible: reasons.length === 0, reasons }, artifact, target, sources, edges: flow };
  }

  // ── 조회 ───────────────────────────────────────────────────────────────

  private async nodeInWorkflow(workflow: WorkflowDocument, nodeId: string): Promise<WorkflowNodeDocument> {
    if (!Types.ObjectId.isValid(nodeId)) throw new NotFoundException('Node not found.');
    const node = await this.nodes.findById(nodeId).exec();
    if (!node || node.workflowId.toString() !== workflow._id.toString()) {
      throw new NotFoundException('Node not found.');
    }
    return node;
  }

  async getState(workflow: WorkflowDocument, nodeId: string): Promise<AutoRunStateDto> {
    const node = await this.nodeInWorkflow(workflow, nodeId);
    const { eligibility, artifact, target, sources } = await this.eligibility(node);
    const runs = await this.runs
      .find({ nodeId: node._id })
      .sort({ queuedAt: -1 })
      .limit(RUN_LIST_LIMIT)
      .exec();
    return {
      serverEnabled: this.serverEnabled,
      enabled: node.autoRunEnabled === true,
      updatedBy: node.autoRunUpdatedBy ?? null,
      updatedAt: node.autoRunUpdatedAt ?? null,
      eligibility,
      target: target ? { serviceName: target.serviceName, typeName: target.typeName, isCalypsoProbe: target.isCalypsoProbe } : null,
      sources: sources.map((s) => ({
        nodeId: s.node._id.toString(),
        nodeName: s.node.name,
        artifactName: s.artifact.name,
        versionLabel: s.published?.versionLabel ?? null,
        publishedAt: s.published?.publishedAt ?? s.published?.observedAt ?? null,
      })),
      targetLatestAt: artifact?.versions?.[0]?.observedAt ?? null,
      runs: runs.map(toRunDto),
    };
  }

  /** 캔버스 조립용 — workflow 전체를 한 번에(node마다 따로 묻지 않는다). */
  async summarizeForWorkflow(workflowId: Types.ObjectId | string): Promise<Map<string, AutoRunStatus>> {
    const active = await this.runs
      .find({ workflowId, status: { $in: ACTIVE_AUTO_RUN_STATUSES } })
      .sort({ queuedAt: -1 })
      .exec();
    const map = new Map<string, AutoRunStatus>();
    for (const r of active) {
      const key = r.nodeId.toString();
      // 가장 진척된 상태를 보여준다 — running > dispatched > queued.
      const rank = (s: AutoRunStatus) => ACTIVE_AUTO_RUN_STATUSES.indexOf(s);
      const prev = map.get(key);
      if (!prev || rank(r.status) > rank(prev)) map.set(key, r.status);
    }
    return map;
  }

  // ── 등록 · 수동 실행 ──────────────────────────────────────────────────

  /** 켜고 끄기 — workflow Edit Access(컨트롤러 가드). 켤 때만 조건을 따진다. */
  async setEnabled(workflow: WorkflowDocument, nodeId: string, enabled: boolean, actor: Actor): Promise<AutoRunStateDto> {
    const node = await this.nodeInWorkflow(workflow, nodeId);
    if (enabled) {
      const { eligibility } = await this.eligibility(node);
      if (!eligibility.eligible) throw new BadRequestException(eligibility.reasons.join(' '));
    }
    node.autoRunEnabled = enabled;
    node.autoRunUpdatedBy = actor.knoxId;
    node.autoRunUpdatedAt = new Date();
    await node.save();
    return this.getState(workflow, nodeId);
  }

  /**
   * 지금 실행(사용자 결정 Q1) — 자동 조건(날짜 비교)을 보지 않고 지금의 source 최신 published
   * 버전으로 바로 보낸다. 등록(켜짐) 여부와 무관하게, 등록 조건만 만족하면 누를 수 있다.
   * source가 하나라도 published 버전이 없으면 거부한다 — 보낼 버전이 없다.
   */
  async runNow(workflow: WorkflowDocument, nodeId: string, actor: Actor): Promise<AutoRunRunDto> {
    const node = await this.nodeInWorkflow(workflow, nodeId);
    const { eligibility, artifact, target, sources } = await this.eligibility(node);
    if (!eligibility.eligible || !artifact || !target) {
      throw new BadRequestException(eligibility.reasons.join(' ') || 'Auto Run is not available on this node.');
    }
    const unpublished = sources.filter((s) => !s.published);
    if (unpublished.length) {
      throw new BadRequestException(
        `These sources have no published version yet: ${unpublished.map((s) => s.node.name).join(', ')}.`,
      );
    }
    const run = await this.createRun(node, artifact, target, sources, { trigger: 'manual', requestedBy: actor.knoxId });
    return toRunDto(run);
  }

  private async createRun(
    node: WorkflowNodeDocument,
    artifact: ArtifactDocument,
    target: ResolvedTarget,
    sources: CollectedSource[],
    meta: { trigger: 'auto' | 'manual'; requestedBy?: string | null; causeArtifactId?: string | null; causeVersionLabel?: string | null },
  ): Promise<AutoRunDocument> {
    const run = await this.runs.create({
      projectId: node.projectId,
      workflowId: node.workflowId,
      nodeId: node._id,
      artifactId: artifact._id,
      serviceKey: target.serviceKey,
      trigger: meta.trigger,
      requestedBy: meta.requestedBy ?? null,
      causeArtifactId: meta.causeArtifactId ?? null,
      causeVersionLabel: meta.causeVersionLabel ?? null,
      sources: sources.map((s) => ({
        nodeId: s.node._id.toString(),
        nodeName: s.node.name,
        artifactId: s.artifact._id.toString(),
        artifactName: s.artifact.name,
        tier: s.artifact.tier,
        network: s.artifact.network ?? null,
        serviceKey: s.artifact.serviceKey ?? null,
        externalArtifactId: s.artifact.externalArtifactId ?? null,
        versionLabel: (s.published as ArtifactVersion).versionLabel,
        versionRef: s.published?.versionRef ?? null,
        publishedAt: s.published?.publishedAt ?? s.published?.observedAt ?? null,
      })),
      status: 'queued',
      message: null,
      externalJobId: null,
      resultVersionLabel: null,
      attempts: 0,
      queuedAt: new Date(),
      dispatchedAt: null,
      startedAt: null,
      finishedAt: null,
    });
    this.enqueueDispatch(run._id.toString());
    return run;
  }

  // ── 자동 발화 ──────────────────────────────────────────────────────────

  /**
   * push 이벤트로 받은 버전이 published일 때 부른다(hub-events.controller.ts). 그 버전으로
   * 처음 평가하는 경우에만 downstream을 찾는다 — 같은 버전은 두 번 평가하지 않는다
   * (`autoRunEvaluatedAt`, 설계서 10장 §4.1). 호출부는 이 결과를 기다리지 않는다.
   *
   * 찾는 방법(사용자 결정 A1): 이 artifact를 매핑한 **모든 workflow의 모든 node**를 찾고,
   * 각 node의 flow 직후 1홉 downstream 중 Auto Run이 켜진 node를 평가한다.
   */
  async onSourcePublished(artifactId: Types.ObjectId, versionLabel: string): Promise<void> {
    if (!this.serverEnabled) return;
    try {
      const holders = await this.nodes.find({ artifactId }).exec();
      const edgesByWorkflow = new Map<string, FlowEdge[]>();
      const evaluated = new Set<string>();
      for (const holder of holders) {
        const wfKey = holder.workflowId.toString();
        let flow = edgesByWorkflow.get(wfKey);
        if (!flow) {
          flow = await this.flowEdges(holder.workflowId);
          edgesByWorkflow.set(wfKey, flow);
        }
        const downstreamIds = downstreamOf(holder._id.toString(), flow);
        if (!downstreamIds.length) continue;
        const candidates = await this.nodes.find({ _id: { $in: downstreamIds } }).exec();
        for (const candidate of candidates) {
          const key = candidate._id.toString();
          if (!candidate.autoRunEnabled || evaluated.has(key)) continue;
          evaluated.add(key);
          await this.tryAutoFire(candidate, flow, { artifactId: artifactId.toString(), versionLabel });
        }
      }
    } catch (e) {
      this.logger.warn(`auto-run evaluation failed for artifact ${artifactId.toString()} — ${(e as Error).message}`);
    }
  }

  private async tryAutoFire(
    node: WorkflowNodeDocument,
    flow: FlowEdge[],
    cause: { artifactId: string; versionLabel: string },
  ): Promise<void> {
    const { eligibility, artifact, target, sources } = await this.eligibility(node, flow);
    if (!eligibility.eligible || !artifact || !target) {
      this.logger.log(`auto-run skipped for node ${node._id.toString()} — ${eligibility.reasons.join(' ')}`);
      return;
    }
    const targetLatestAt = artifact.versions?.[0]?.observedAt ?? null;
    const fire = shouldAutoFire(
      targetLatestAt,
      sources.map((s) => ({ latestPublishedAt: s.published ? (s.published.publishedAt ?? s.published.observedAt ?? null) : null })),
    );
    if (!fire) return;
    await this.createRun(node, artifact, target, sources, {
      trigger: 'auto',
      requestedBy: null,
      causeArtifactId: cause.artifactId,
      causeVersionLabel: cause.versionLabel,
    });
  }

  // ── 전송 ───────────────────────────────────────────────────────────────

  private enqueueDispatch(runId: string): void {
    this.dispatcher.enqueue(() => this.dispatch(runId));
  }

  /** 발화 시점에 고정한 source 버전(run.sources)으로 payload를 만들어 보낸다(설계서 10장 §6). */
  private async dispatch(runId: string): Promise<void> {
    const run = await this.runs.findById(runId).exec();
    if (!run || run.status !== 'queued') return;

    const fail = async (message: string) => {
      run.status = 'failed';
      run.message = message;
      run.finishedAt = new Date();
      await run.save();
      await this.notifyOwner(run);
    };

    if (!this.serverEnabled) return fail('Auto Run was turned off on this SIREN server before the trigger was sent.');

    const [node, workflow, project, artifact] = await Promise.all([
      this.nodes.findById(run.nodeId).exec(),
      this.workflows.findById(run.workflowId).exec(),
      this.projects.findById(run.projectId).exec(),
      this.artifacts.findById(run.artifactId).exec(),
    ]);
    if (!node || !workflow || !project || !artifact) return fail('The node, workflow or artifact was removed before the trigger was sent.');

    const { target, reason } = await this.resolveTarget(artifact);
    if (!target) return fail(reason ?? 'The target service cannot receive Auto Run triggers.');

    const payload = await this.buildPayload(run, node, workflow, project, artifact, target);
    const result = await this.dispatcher.post(`${target.baseUrl}/auto-run/triggers`, target.token, payload);
    run.attempts = result.attempts;
    if (!result.ok) return fail(result.error ?? 'The service did not accept the trigger.');

    // 202를 받기 전에 running 콜백이 먼저 올 수도 있다 — 그러면 이미 앞선 상태이므로 덮지 않는다.
    const fresh = await this.runs.findById(runId).exec();
    if (!fresh) return;
    fresh.attempts = result.attempts;
    fresh.dispatchedAt = fresh.dispatchedAt ?? new Date();
    if (fresh.status === 'queued') fresh.status = 'dispatched';
    if (!fresh.externalJobId && result.jobId) fresh.externalJobId = result.jobId;
    await fresh.save();
  }

  private async buildPayload(
    run: AutoRunDocument,
    node: WorkflowNodeDocument,
    workflow: WorkflowDocument,
    project: ProjectDocument,
    artifact: ArtifactDocument,
    target: ResolvedTarget,
  ): Promise<Record<string, unknown>> {
    const publicApi = this.config.get<string>('autoRun.publicApiUrl') ?? '';
    const calypsoExternal = this.config.get<string>('autoRun.calypsoExternalApiUrl') ?? '';
    const secret = this.config.get<string>('autoRun.sourceTokenSecret') ?? '';
    const ttlHours = this.config.get<number>('autoRun.sourceTokenTtlHours') ?? 24;
    const expiresAt = new Date(Date.now() + ttlHours * 3600_000);

    const sourceArtifacts = await this.artifacts
      .find({ _id: { $in: run.sources.map((s) => s.artifactId) } })
      .exec();
    const artifactById = new Map(sourceArtifacts.map((a) => [a._id.toString(), a]));
    const serviceKeys = [...new Set(run.sources.map((s) => s.serviceKey).filter((k): k is string => !!k && k !== CALYPSO_KEY))];
    const serviceDocs = serviceKeys.length ? await this.services.find({ key: { $in: serviceKeys } }).exec() : [];
    const serviceByKey = new Map(serviceDocs.map((s) => [s.key, s]));

    const sources = run.sources.map((s) => {
      const a = artifactById.get(s.artifactId);
      const entry = a?.versions?.find((v) => v.versionLabel === s.versionLabel) ?? null;
      const isCalypso = s.serviceKey === CALYPSO_KEY;
      const svc = s.serviceKey && !isCalypso ? serviceByKey.get(s.serviceKey) : undefined;
      const type = svc?.artifactTypes?.find((t) => t.key === a?.artifactTypeKey);

      let calypso: Record<string, unknown> | null = null;
      if (isCalypso && s.externalArtifactId && s.versionRef) {
        const token = signSourceToken(secret, {
          a: s.externalArtifactId,
          r: s.versionRef,
          e: Math.floor(expiresAt.getTime() / 1000),
        });
        const base = `${calypsoExternal}/auto-run/artifacts/${encodeURIComponent(s.externalArtifactId)}/versions/${encodeURIComponent(s.versionRef)}`;
        calypso = {
          baseUrl: calypsoExternal,
          contentsUrl: `${base}/contents`,
          downloadUrl: `${base}/download`,
          accessToken: token,
          expiresAt: expiresAt.toISOString(),
        };
      }

      return {
        nodeId: s.nodeId,
        nodeName: s.nodeName,
        sirenArtifactId: s.artifactId,
        name: s.artifactName,
        tier: s.tier,
        network: s.network,
        serviceKey: s.serviceKey,
        serviceName: isCalypso ? 'Calypso' : (svc?.name ?? null),
        serviceBaseUrl: isCalypso ? calypsoExternal : (svc?.baseUrl ?? null),
        artifactTypeKey: isCalypso ? null : (a?.artifactTypeKey ?? null),
        artifactTypeName: type?.name ?? null,
        externalArtifactId: s.externalArtifactId,
        version: {
          versionLabel: s.versionLabel,
          versionRef: s.versionRef,
          isPublished: true,
          publishedAt: s.publishedAt ? new Date(s.publishedAt).toISOString() : null,
          viewUrl: entry?.viewUrl ?? null,
          hpcPath: entry?.hpcPath ?? null,
          note: entry?.note || null,
        },
        calypso,
      };
    });

    return {
      contractVersion: '1.0',
      triggerRunId: run._id.toString(),
      trigger: run.trigger,
      requestedBy: run.requestedBy ?? null,
      runAs: this.systemAccount,
      triggeredAt: run.queuedAt.toISOString(),
      project: {
        id: project._id.toString(),
        code: project.code,
        revision: project.revision,
        name: project.name,
      },
      workflow: { id: workflow._id.toString(), name: workflow.name },
      node: { id: node._id.toString(), name: node.name, phaseId: node.phaseId },
      target: {
        sirenArtifactId: artifact._id.toString(),
        name: artifact.name,
        serviceKey: target.serviceKey,
        artifactTypeKey: target.typeKey,
        externalArtifactId: artifact.externalArtifactId,
        currentVersionLabel: artifact.versions?.[0]?.versionLabel ?? null,
      },
      cause: run.causeArtifactId
        ? {
            sirenArtifactId: run.causeArtifactId,
            externalArtifactId: artifactById.get(run.causeArtifactId)?.externalArtifactId ?? null,
            versionLabel: run.causeVersionLabel,
          }
        : null,
      sources,
      callback: {
        statusUrl: `${publicApi}/hub/events/auto-run-status`,
        versionEventUrl: `${publicApi}/hub/events/version-published`,
      },
    };
  }

  // ── 서비스 콜백 ───────────────────────────────────────────────────────

  /**
   * `POST /hub/events/auto-run-status`(설계서 08장 §2.3). 그 run을 받은 서비스의 토큰으로만
   * 갱신할 수 있고, 끝난(succeeded/failed) run은 더 이상 바뀌지 않는다.
   */
  async recordStatus(senderServiceKey: string, input: AutoRunStatusInput): Promise<{ recorded: boolean }> {
    if (!Types.ObjectId.isValid(input.triggerRunId)) return { recorded: false };
    const run = await this.runs.findById(input.triggerRunId).exec();
    if (!run) return { recorded: false };
    if (run.serviceKey !== senderServiceKey) {
      throw new ForbiddenException('This run was not sent to your service.');
    }
    if (isTerminal(run.status)) return { recorded: false };
    if (input.status !== 'failed' && (input.failureKind || input.sourceErrors?.length)) {
      throw new BadRequestException('failureKind and sourceErrors are only allowed with status "failed".');
    }

    const now = new Date();
    if (input.externalJobId) run.externalJobId = input.externalJobId;
    if (input.message !== undefined) run.message = input.message ?? null;
    if (input.versionLabel) run.resultVersionLabel = input.versionLabel;
    run.dispatchedAt = run.dispatchedAt ?? now;

    if (input.status === 'running') {
      run.status = 'running';
      run.startedAt = run.startedAt ?? now;
      await run.save();
      return { recorded: true };
    }

    run.status = input.status;
    run.startedAt = run.startedAt ?? now;
    run.finishedAt = now;
    if (input.status === 'failed') {
      run.sourceErrors = this.matchSourceErrors(run, input.sourceErrors ?? []);
      run.failureKind = input.failureKind ?? (run.sourceErrors.length ? 'source' : null);
    }
    await run.save();
    await this.notifyOwner(run);
    return { recorded: true };
  }

  /**
   * 서비스가 짚은 source를 이 run이 실제로 보낸 source(run.sources)와 맞춘다 — sirenArtifactId →
   * externalArtifactId → nodeId 순서로 찾는다. 못 맞춘 항목도 버리지 않고 서비스가 준 값 그대로
   * 남긴다(무엇 때문에 실패했는지는 그래도 보여야 한다).
   */
  private matchSourceErrors(run: AutoRunDocument, input: NonNullable<AutoRunStatusInput['sourceErrors']>): AutoRunSourceError[] {
    return input.map((e) => {
      const src = run.sources.find((s) =>
        (!!e.sirenArtifactId && s.artifactId === e.sirenArtifactId)
        || (!!e.externalArtifactId && s.externalArtifactId === e.externalArtifactId)
        || (!!e.nodeId && s.nodeId === e.nodeId));
      return {
        nodeId: src?.nodeId ?? e.nodeId ?? null,
        nodeName: src?.nodeName ?? null,
        artifactId: src?.artifactId ?? e.sirenArtifactId ?? null,
        artifactName: src?.artifactName ?? null,
        externalArtifactId: src?.externalArtifactId ?? e.externalArtifactId ?? null,
        versionLabel: e.versionLabel ?? src?.versionLabel ?? null,
        message: e.message,
      };
    });
  }

  /**
   * version 이벤트에 triggerRunId가 실려 오면 그 run의 결과 버전으로 기록한다(D1). 상태는
   * 바꾸지 않는다 — 끝났다는 신호는 status 콜백만 준다(버전을 안 내고 끝나는 서비스도 있다).
   */
  async linkResultVersion(senderServiceKey: string, triggerRunId: string, versionLabel: string): Promise<void> {
    if (!Types.ObjectId.isValid(triggerRunId)) return;
    const run = await this.runs.findById(triggerRunId).exec();
    if (!run || run.serviceKey !== senderServiceKey) return;
    run.resultVersionLabel = versionLabel;
    await run.save();
  }

  // ── 시간 초과 · 알림 ───────────────────────────────────────────────────

  /** 전송 뒤 timeoutMinutes 안에 succeeded/failed 콜백이 없으면 실패로 닫는다(사용자: 길어야 1시간). */
  async sweepTimeouts(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - this.timeoutMinutes * 60_000);
      const stale = await this.runs
        .find({ status: { $in: ['dispatched', 'running'] }, dispatchedAt: { $lt: cutoff } })
        .exec();
      for (const run of stale) {
        run.status = 'failed';
        run.message = `No completion callback from the service within ${this.timeoutMinutes} minutes.`;
        run.finishedAt = new Date();
        await run.save();
        await this.notifyOwner(run);
      }
    } catch (e) {
      this.logger.warn(`auto-run timeout sweep failed — ${(e as Error).message}`);
    }
  }

  /**
   * 결과 알림(설계서 10장 §7) — workflow owner에게는 성공/실패 모두. source 때문에 실패했으면
   * **문제가 된 source 버전을 발행한 사람(giver)**에게도 실패 알림을 보낸다 — 고칠 사람이 바로
   * 알아야 하기 때문이다. 같은 사람이 여러 자격으로 걸리면 한 통만 보낸다(owner 우선).
   */
  private async notifyOwner(run: AutoRunDocument): Promise<void> {
    if (run.status !== 'succeeded' && run.status !== 'failed') return;
    try {
      const [workflow, node, artifact] = await Promise.all([
        this.workflows.findById(run.workflowId).exec(),
        this.nodes.findById(run.nodeId).exec(),
        this.artifacts.findById(run.artifactId).exec(),
      ]);
      if (!workflow) return;
      const sourceErrors = (run.sourceErrors ?? []).map((e) => ({
        nodeName: e.nodeName ?? null,
        artifactName: e.artifactName ?? e.externalArtifactId ?? null,
        versionLabel: e.versionLabel ?? null,
        message: e.message,
      }));
      const base = {
        runId: run._id.toString(),
        workflowId: workflow._id.toString(),
        workflowName: workflow.name,
        nodeName: node?.name ?? '',
        artifactName: artifact?.name ?? '',
        trigger: run.trigger,
        status: run.status,
        message: run.message ?? null,
        resultVersionLabel: run.resultVersionLabel ?? null,
        failureKind: run.failureKind ?? null,
        sourceErrors,
      };

      const sent = new Set<string>();
      if (workflow.ownerKnoxId) {
        sent.add(workflow.ownerKnoxId);
        await this.notifications.notifyAutoRun({ ...base, recipientKnoxId: workflow.ownerKnoxId, recipientRole: 'owner' });
      }
      if (run.status === 'failed' && run.sourceErrors?.length) {
        const givers = await this.sourceGivers(run);
        for (const knoxId of givers) {
          if (sent.has(knoxId)) continue;
          sent.add(knoxId);
          await this.notifications.notifyAutoRun({ ...base, recipientKnoxId: knoxId, recipientRole: 'source-giver' });
        }
      }
    } catch (e) {
      this.logger.warn(`auto-run notification failed for run ${run._id.toString()} — ${(e as Error).message}`);
    }
  }

  /** 문제가 된 source 버전들의 giver(그 버전을 발행한 사람) — SIREN 버전 캐시에서 찾는다. */
  private async sourceGivers(run: AutoRunDocument): Promise<string[]> {
    const ids = [...new Set((run.sourceErrors ?? []).map((e) => e.artifactId).filter((x): x is string => !!x))];
    if (!ids.length) return [];
    const docs = await this.artifacts.find({ _id: { $in: ids } }).exec();
    const out: string[] = [];
    for (const e of run.sourceErrors ?? []) {
      const a = docs.find((d) => d._id.toString() === e.artifactId);
      const label = e.versionLabel ?? run.sources.find((s) => s.artifactId === e.artifactId)?.versionLabel;
      const giver = a?.versions?.find((v) => v.versionLabel === label)?.giverKnoxId;
      if (giver && !out.includes(giver)) out.push(giver);
    }
    return out;
  }

  // ── 다른 모듈이 쓰는 검증 ─────────────────────────────────────────────

  /**
   * 캔버스 저장 직전(canvas.service.ts) — 새 flow가 Auto Run node를 순환 위에 올리면 저장을
   * 거부한다(사용자 결정 Q7). 순환이 있는 node는 애초에 등록할 수 없으므로, 등록된 node를
   * 순환으로 만드는 편집도 막는 것이 같은 규칙이다.
   */
  async assertFlowKeepsAutoRunAcyclic(workflowId: Types.ObjectId | string, edges: FlowEdge[]): Promise<void> {
    const enabled = await this.nodes.find({ workflowId, autoRunEnabled: true }).exec();
    const looped = enabled.filter((n) => isOnCycle(n._id.toString(), edges));
    if (looped.length) {
      throw new BadRequestException(
        `This flow creates a loop through Auto Run node(s): ${looped.map((n) => n.name).join(', ')}. ` +
          'Remove the loop, or turn Auto Run off on those nodes first.',
      );
    }
  }
}
