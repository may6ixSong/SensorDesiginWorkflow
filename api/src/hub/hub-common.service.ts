import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { Workflow, WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { sortSchedule } from '../common/schedule';

/**
 * SIREN → 산출물 서비스 방향의 공용 데이터 (Hub 설계서 §4.4).
 *
 * 각 서비스가 자기 권한 화면의 담당자 후보를 여기서 가져다 쓰므로, 조직이 바뀌어도
 * SIREN 한 곳만 고치면 된다. HPC망 서비스는 이 API를 직접 부를 수 없어 같은 내용을
 * 공용 DB의 siren_common 테이블로 받는다(§8.2) - 그쪽 sync job도 이 서비스가 만든
 * 페이로드를 그대로 쓴다.
 */
@Injectable()
export class HubCommonService {
  constructor(
    @InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>,
    @InjectModel(Workflow.name) private readonly workflowModel: Model<WorkflowDocument>,
  ) {}

  async build(projectId: string) {
    if (!projectId) throw new BadRequestException('projectId is required.');
    const project = await this.projectModel.findById(projectId).exec();
    if (!project) throw new NotFoundException('Project not found.');

    const workflows = await this.workflowModel.find({ projectId: project._id }).exec();

    return {
      projectId: project._id.toString(),
      members: (project.members ?? []).map((m) => ({
        knoxId: m.knoxId,
        // api에는 users 컬렉션이 없다 - 이름은 사내 공통 플랫폼이 소유하므로 여기서 못 채운다.
        name: null,
        // 한 사람이 여러 부서에 속할 수 있어 배열이다. 대표 부서만 필요한 쪽을 위해 첫 값을 함께 준다.
        dept: m.departments?.[0] ?? null,
        departments: m.departments ?? [],
      })),
      departments: project.departments ?? [],
      schedule: {
        milestones: sortSchedule(project.milestones ?? []).map(toPhasePayload),
        workflowPhases: workflows.map((w) => ({
          workflowId: w._id.toString(),
          workflowName: w.name,
          phases: sortSchedule(w.phases ?? []).map(toPhasePayload),
        })),
      },
    };
  }
}

function toPhasePayload(p: { id: string; name: string; start: string; end: string }) {
  return { id: p.id, name: p.name, start: p.start, end: p.end };
}
