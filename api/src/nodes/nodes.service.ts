import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WorkflowNode, WorkflowNodeDocument } from './schemas/node.schema';
import { Actor } from '../common/actor';
import { AuditService } from '../audit/audit.service';
import { ArtifactsService } from '../artifacts/artifacts.service';
import { ArtifactSourceService, CandidateIntent } from '../artifacts/artifact-source.service';
import { ArtifactDocument } from '../artifacts/schemas/artifact.schema';
import { normalizeGrant } from '../common/access';
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { NewArtifactSourceDto } from './dto/node-crud.dto';
import { shouldResetRecipients } from './node-policy';

const EMPTY_RECIPIENTS = () => ({ departments: [], users: [] });

@Injectable()
export class NodesService {
  constructor(
    @InjectModel(WorkflowNode.name) private readonly model: Model<WorkflowNodeDocument>,
    private readonly artifacts: ArtifactsService,
    private readonly sources: ArtifactSourceService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 한 workflow 안에서 같은 artifact를 두 node에 걸 수 없다 — 주는/받는 모두다
   * (사용자 결정: source 버전을 지정하는 flow-upstream 판정이 모호해지기 때문).
   *
   * ★ `$ne`는 안 쓴다 — 인메모리 목업 드라이버(database/in-memory-driver.ts)가 지원하는
   *   연산자가 `$in`/`$or`뿐이라, `_id: { $ne: ... }`가 항상 매치 실패로 빠져 재매핑 시
   *   중복 검증이 조용히 무력화된다. 후보를 그대로 받아 JS에서 자기 자신만 제외한다.
   */
  private async assertNotDuplicateInWorkflow(
    workflowId: Types.ObjectId,
    artifactId: Types.ObjectId,
    excludeNodeId?: string,
  ): Promise<void> {
    const matches = await this.model.find({ workflowId, artifactId }).exec();
    const dupe = matches.some((n) => n._id.toString() !== excludeNodeId);
    if (dupe) {
      throw new BadRequestException(
        'This artifact is already mapped to another node in this workflow.',
      );
    }
  }

  /**
   * 부서는 항상 그 과제에 등록된 id여야 한다(설계서 02장 §9) — recipients가 이제 release
   * 대상을 결정하므로, 매칭되지 않는 department id는 "그 artifact가 누구에게도 조용히
   * 전달되지 않는" 사고로 이어진다(사용자 결정). create()와 replaceRecipients() 양쪽이
   * 같은 검증을 쓴다 — 한쪽만 검증하면 나머지 경로로 여전히 새어나간다.
   *
   * ★ 검증 대상은 **normalizeGrant를 통과한 뒤의 값**이어야 한다 — 앞뒤 공백만 섞인
   *   유효 id를 raw 문자열 그대로 비교해 "Unknown department"로 잘못 거부하면 안 된다.
   */
  private assertKnownDepartments(project: ProjectDocument, departments: string[]): void {
    const known = new Set(project.departments.map((d) => d.id));
    const unknown = departments.filter((d) => !known.has(d));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown department: ${unknown.join(', ')}`);
    }
  }

  /**
   * artifactId(재사용) 또는 newArtifact(그 자리에서 확정) 중 하나를 실제 ObjectId로 푼다.
   * 아무것도 안 왔으면 undefined(=건드리지 않음/그대로 빈 상태)를 돌려준다.
   */
  private async resolveArtifact(
    project: ProjectDocument,
    actor: Actor,
    intent: CandidateIntent,
    input: { artifactId?: string | null; newArtifact?: NewArtifactSourceDto },
  ): Promise<ArtifactDocument | null | undefined> {
    if (input.newArtifact) {
      const na = input.newArtifact;
      if (!na.externalArtifactId) {
        throw new BadRequestException('externalArtifactId is required for this source.');
      }
      return this.sources.resolveLiveOrFile(project, actor, intent, {
        source: na.source,
        serviceKey: na.serviceKey,
        externalArtifactId: na.externalArtifactId,
        name: na.name,
      });
    }
    if (input.artifactId === undefined) return undefined;
    if (input.artifactId === null) return null;

    const artifact = await this.artifacts.findOrThrow(input.artifactId);
    this.artifacts.assertSameProject(artifact, project._id as Types.ObjectId);
    await this.sources.assertReusePickable(project, actor, artifact, intent);
    return artifact;
  }

  listForWorkflow(workflowId: string | Types.ObjectId) {
    return this.model.find({ workflowId }).exec();
  }

  async findOrThrow(nodeId: string): Promise<WorkflowNodeDocument> {
    const node = await this.model.findById(nodeId).exec();
    if (!node) throw new NotFoundException('Node not found.');
    return node;
  }

  countForWorkflow(workflowId: string | Types.ObjectId) {
    return this.model.countDocuments({ workflowId }).exec();
  }

  /**
   * 새 노드. artifact 없이 만들 수 있다 — 자리는 캔버스에 잡아두고 출처는 나중에
   * 지정하는 것이 **정상 빈 상태**다(설계서 03장 §2.3).
   *
   * intent는 "새 Artifact 추가" 다이얼로그의 첫 질문이다 — 내가 주는 산출물(own)인지
   * 받는 산출물(received)인지(설계서 03장 §5.2, 04장 §6). 생성 후에는 바뀌지 않는다.
   */
  async create(
    workflow: WorkflowDocument,
    project: ProjectDocument,
    input: {
      name: string;
      phaseId: string;
      layout: { x: number; y: number; w: number; h: number };
      intent?: 'own' | 'received';
      artifactId?: string | null;
      newArtifact?: NewArtifactSourceDto;
      recipients?: { departments?: string[]; users?: string[] };
    },
    actor: Actor,
  ): Promise<WorkflowNodeDocument> {
    if (!(workflow.phases ?? []).some((p) => p.id === input.phaseId)) {
      throw new BadRequestException(`Unknown phase: ${input.phaseId}`);
    }

    // normalizeGrant로 다듬은(trim/dedupe) 뒤의 값을 검증한다 — 저장되는 값과 검증하는
    // 값이 같아야 한다.
    const normalizedRecipients = input.recipients ? normalizeGrant(input.recipients) : null;
    if (normalizedRecipients) {
      this.assertKnownDepartments(project, normalizedRecipients.departments);
    }

    const intent = input.intent ?? 'own';
    const resolved = await this.resolveArtifact(project, actor, intent, input);
    const artifactId = resolved ? resolved._id : null;

    if (artifactId) {
      await this.assertNotDuplicateInWorkflow(workflow._id, artifactId);
    }

    const node = await this.model.create({
      projectId: workflow.projectId,
      workflowId: workflow._id,
      phaseId: input.phaseId,
      artifactId,
      name: input.name.trim(),
      layout: input.layout,
      intent,
      recipients: normalizedRecipients ?? EMPTY_RECIPIENTS(),
      series: null,
      seriesIdx: 1,
      seriesTotal: 1,
      createdBy: actor.knoxId,
      isMock: false,
    });
    await this.audit.log(actor, 'BLOCK_CREATE', 'block', node._id, {
      workflowId: workflow._id.toString(),
      intent,
      artifactId: artifactId?.toString() ?? null,
    });
    return node;
  }

  /** 노드 이름 변경 / artifact 매핑 변경(재매핑). intent는 생성 후 바꾸지 않는다. */
  async update(
    project: ProjectDocument,
    nodeId: string,
    input: { name?: string; artifactId?: string | null; newArtifact?: NewArtifactSourceDto },
    actor: Actor,
  ): Promise<WorkflowNodeDocument> {
    const node = await this.findOrThrow(nodeId);

    if (input.name !== undefined) node.name = input.name.trim();

    if (input.artifactId !== undefined || input.newArtifact) {
      const before = node.artifactId?.toString() ?? null;

      const resolved = await this.resolveArtifact(project, actor, node.intent, input);
      const nextArtifactId = resolved ? resolved._id : null;

      if (nextArtifactId) {
        await this.assertNotDuplicateInWorkflow(node.workflowId, nextArtifactId, nodeId);
      }
      node.artifactId = nextArtifactId;

      const after = node.artifactId?.toString() ?? null;
      if (shouldResetRecipients(before, after)) {
        // 다른 산출물로 **바뀌면** recipient도 초기화한다 — 이전 값이 새 산출물에도 유효한
        // 구성이라는 보장이 없다(사용자 결정: 조용히 남기면 잘못된 부서에 알림이 갈 수 있다).
        // `null → X`(=처음 매핑)를 초기화 대상에서 빼는 이유는 shouldResetRecipients 참고.
        node.recipients = EMPTY_RECIPIENTS();
      }
      if (before !== after) {
        // 무엇이 누구에게 전달되는지가 통째로 달라지는 사건이라 반드시 남긴다.
        await this.audit.log(actor, 'BLOCK_ARTIFACT_REMAP', 'block', node._id, {
          workflowId: node.workflowId.toString(),
          from: before,
          to: after,
        });
      }
    }

    await node.save();
    return this.findOrThrow(nodeId);
  }

  async remove(nodeId: string, actor: Actor): Promise<void> {
    const node = await this.findOrThrow(nodeId);
    await this.model.findByIdAndDelete(nodeId).exec();
    await this.audit.log(actor, 'BLOCK_DELETE', 'block', node._id, {
      workflowId: node.workflowId.toString(),
    });
  }

  /**
   * node의 recipient 교체 — A/B/C 전부 공통이다(설계서 04장 §3.2). SIREN은 여기서
   * "누가 볼 수 있는지"만 보관하고, 실제 edit 여부는 그 서비스가 판정한다.
   *
   * ★ 편집 권한은 그 workflow의 Edit Access다 — 컨트롤러가 이미 검증하고 들어온다.
   *   recipient에 **속하는 것**과 recipient를 **편집하는 것**은 별개다(설계서 01장 §4.2).
   */
  async replaceRecipients(
    project: ProjectDocument,
    nodeId: string,
    input: { departments?: string[]; users?: string[] },
    actor: Actor,
  ): Promise<WorkflowNodeDocument> {
    const node = await this.findOrThrow(nodeId);
    if (!node.artifactId) {
      throw new BadRequestException('This node has no artifact mapped yet.');
    }
    const normalized = normalizeGrant(input);
    this.assertKnownDepartments(project, normalized.departments);
    node.recipients = normalized;
    await node.save();
    await this.audit.log(actor, 'BLOCK_RECIPIENTS_REPLACE', 'block', node._id, {
      recipients: node.recipients,
    });
    return this.findOrThrow(nodeId);
  }

  /**
   * 이 workflow의 노드 중 **release 대상**만 (설계서 05장 §2).
   * artifact가 매핑된 것 전부다 — 미매핑 노드는 전달할 실체가 없어 제외된다.
   */
  async releasableForWorkflow(workflowId: string | Types.ObjectId): Promise<WorkflowNodeDocument[]> {
    const nodes = await this.model.find({ workflowId }).exec();
    return nodes.filter((n) => Boolean(n.artifactId));
  }

  async deleteForWorkflow(workflowId: string | Types.ObjectId): Promise<void> {
    await this.model.deleteMany({ workflowId }).exec();
  }
}
