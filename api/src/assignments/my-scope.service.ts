import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Actor } from '../common/actor';
import { myDepartments } from '../common/access';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { Workflow, WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { Block, BlockDocument } from '../blocks/schemas/block.schema';

/** My Assignment가 한 workflow에 대해 들고 다니는 최소 정보. */
export interface ScopedWorkflow {
  workflowId: string;
  projectId: string;
  name: string;
  department: string;
}

/** artifact가 매핑된 own block 하나. */
export interface ScopedBlock {
  blockId: string;
  workflowId: string;
  projectId: string;
  artifactId: string;
  name: string;
  phaseId: string;
  recipientDepartments: string[];
  recipientUsers: string[];
}

/**
 * "지금 이 사람에게 My Assignment가 무엇을 보여줘야 하는가"를 한 번에 푼 결과.
 *
 * ★ 판정 기준(사용자 확정) — **workflow 소속 부서**다. 그 과제의 로스터에서 내가 속한
 *   부서(`Project.members[].departments`)와 `Workflow.department`가 같은 workflow만
 *   "내 것"이고, 그 안에서 **내가 주는 산출물(`intent: 'own'`)이면서 실제 artifact가
 *   매핑된 block**이 산출물 쪽 기준점이다.
 *
 *   Tier A/C는 실제 편집 권한을 그 서비스가 들고 있어 SIREN이 알 수 없고, 매번 물어보면
 *   산출물 수만큼 HTTP 호출이 나간다. 그래서 A/B/C를 가리지 않고 이 SIREN 안에서 끝나는
 *   기준 하나로 통일한다 — 설계서 09장.
 *
 * ★ Admin은 어떤 필터도 걸지 않는다 — 모든 과제·모든 workflow·모든 own block이 scope다
 *   (설계서 01장 §1).
 */
export interface MyScope {
  knoxId: string;
  isAdmin: boolean;
  projects: ProjectDocument[];
  projectIds: string[];
  /** projectId → 그 과제에서 내가 속한 부서. Admin은 그 과제의 전체 부서다. */
  departmentsByProject: Map<string, string[]>;
  myWorkflows: ScopedWorkflow[];
  myOwnBlocks: ScopedBlock[];
  /** myOwnBlocks가 가리키는 artifact id 집합(중복 제거). */
  myArtifactIds: string[];
}

/**
 * scope 해석은 My Assignment의 모든 엔드포인트가 맨 앞에서 한 번씩 부른다.
 * 쿼리는 최대 3방이다 — projects → workflows → blocks. 그 뒤로는 전부 이 결과 위에서
 * 걸러지므로 artifact 하나하나에 대해 외부 서비스로 권한을 물어보는 일이 없다.
 */
@Injectable()
export class MyScopeService {
  constructor(
    @InjectModel(Project.name) private readonly projects: Model<ProjectDocument>,
    @InjectModel(Workflow.name) private readonly workflows: Model<WorkflowDocument>,
    @InjectModel(Block.name) private readonly blocks: Model<BlockDocument>,
  ) {}

  async resolve(actor: Actor): Promise<MyScope> {
    const projects = actor.isAdmin
      ? await this.projects.find().exec()
      : await this.projects.find({ 'members.knoxId': actor.knoxId }).exec();

    const projectIds = projects.map((p) => p._id.toString());
    const departmentsByProject = new Map<string, string[]>();
    for (const p of projects) {
      departmentsByProject.set(p._id.toString(), myDepartments(actor, p));
    }

    if (!projectIds.length) {
      return {
        knoxId: actor.knoxId,
        isAdmin: actor.isAdmin,
        projects,
        projectIds,
        departmentsByProject,
        myWorkflows: [],
        myOwnBlocks: [],
        myArtifactIds: [],
      };
    }

    const workflowDocs = await this.workflows.find({ projectId: { $in: projectIds } }).exec();
    const myWorkflows: ScopedWorkflow[] = workflowDocs
      .filter((w) => {
        if (actor.isAdmin) return true;
        const depts = departmentsByProject.get(w.projectId.toString()) ?? [];
        return depts.includes(w.department);
      })
      .map((w) => ({
        workflowId: w._id.toString(),
        projectId: w.projectId.toString(),
        name: w.name,
        department: w.department,
      }));

    const myOwnBlocks = myWorkflows.length ? await this.ownBlocksOf(myWorkflows) : [];
    const myArtifactIds = [...new Set(myOwnBlocks.map((b) => b.artifactId))];

    return {
      knoxId: actor.knoxId,
      isAdmin: actor.isAdmin,
      projects,
      projectIds,
      departmentsByProject,
      myWorkflows,
      myOwnBlocks,
      myArtifactIds,
    };
  }

  /**
   * 그 workflow들의 block 중 **내가 주는 산출물이면서 실제 artifact가 매핑된 것**만.
   * 미매핑 block(`artifactId: null`)은 전달할 실체가 없으므로 애초에 대상이 아니다
   * (설계서 05장 §2.2와 같은 이유).
   */
  private async ownBlocksOf(workflows: ScopedWorkflow[]): Promise<ScopedBlock[]> {
    const docs = await this.blocks
      .find({
        workflowId: { $in: workflows.map((w) => w.workflowId) },
        intent: 'own',
        artifactId: { $ne: null },
      })
      .exec();

    return docs
      // $ne: null을 통과했더라도 방어적으로 한 번 더 본다 — 이 값이 없으면 아래 전부가
      // artifactId를 키로 도는 코드라 조용히 'undefined' 키가 섞이면 안 된다.
      .filter((b) => Boolean(b.artifactId))
      .map((b) => ({
        blockId: b._id.toString(),
        workflowId: b.workflowId.toString(),
        projectId: b.projectId.toString(),
        artifactId: b.artifactId!.toString(),
        name: b.name,
        phaseId: b.phaseId,
        recipientDepartments: [...(b.recipients?.departments ?? [])],
        recipientUsers: [...(b.recipients?.users ?? [])],
      }));
  }
}
