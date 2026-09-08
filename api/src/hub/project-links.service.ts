import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProjectServiceLink, ProjectServiceLinkDocument } from './schemas/project-service-link.schema';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { HubService } from './hub.service';
import { ObserverClientService, ObserverProjectCandidate } from './observer-client.service';
import { Actor, assertAdmin } from '../common/actor';
import { AuditService } from '../audit/audit.service';

/**
 * 과제(code+revision) ↔ 외부 서비스 프로젝트 링크 (설계서 §19.3).
 *
 * code+revision만으로는 그 서비스 안에서 유일하지 않을 수 있다(예: RPM) - 그래서
 * 후보 검색과 확정을 분리한다: searchCandidates()는 그 서비스가 code+revision으로
 * 찾아준 후보 목록을 그대로 보여줄 뿐이고, 실제로 링크가 되는 것은 사람이
 * externalProjectId를 하나 골라 create()를 호출했을 때뿐이다. 후보가 하나뿐이어도
 * SIREN이 자동으로 확정하지 않는다.
 */
@Injectable()
export class ProjectLinksService {
  constructor(
    @InjectModel(ProjectServiceLink.name) private readonly model: Model<ProjectServiceLinkDocument>,
    @InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>,
    private readonly hub: HubService,
    private readonly observer: ObserverClientService,
    private readonly audit: AuditService,
  ) {}

  private async findProjectOrThrow(projectId: string) {
    const project = await this.projectModel.findById(projectId).exec();
    if (!project) throw new NotFoundException(`Unknown project: ${projectId}`);
    return project;
  }

  /** 그 서비스가 code+revision으로 찾아준 후보 목록 - 링크 확정 전 단계다. */
  async searchCandidates(serviceKey: string, code: string, revision: string): Promise<ObserverProjectCandidate[]> {
    const svc = await this.hub.findByKeyOrThrow(serviceKey);
    return this.observer.searchProjects(svc, code, revision);
  }

  list(projectId: string) {
    return this.model
      .find({ projectId: new Types.ObjectId(projectId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async create(
    projectId: string,
    dto: { serviceKey: string; externalProjectId: string; displayName?: string },
    actor: Actor,
  ) {
    assertAdmin(actor);
    const project = await this.findProjectOrThrow(projectId);
    await this.hub.findByKeyOrThrow(dto.serviceKey);

    try {
      const link = await this.model.create({
        projectId: project._id,
        serviceKey: dto.serviceKey,
        externalProjectId: dto.externalProjectId.trim(),
        displayName: dto.displayName?.trim() || '',
        linkedBy: actor.realKnoxId,
      });
      await this.audit.log(actor.realKnoxId, 'PROJECT_SERVICE_LINK_CREATE', 'projectServiceLink', link._id, {
        projectId: project._id.toString(),
        serviceKey: dto.serviceKey,
        externalProjectId: link.externalProjectId,
      });
      return link;
    } catch (e: any) {
      if (e?.code === 11000) {
        throw new BadRequestException('This project is already linked to that external project.');
      }
      throw e;
    }
  }

  async remove(projectId: string, linkId: string, actor: Actor) {
    assertAdmin(actor);
    const link = await this.model
      .findOne({ _id: linkId, projectId: new Types.ObjectId(projectId) })
      .exec();
    if (!link) throw new NotFoundException(`Unknown project service link: ${linkId}`);
    await link.deleteOne();
    await this.audit.log(actor.realKnoxId, 'PROJECT_SERVICE_LINK_DELETE', 'projectServiceLink', link._id, {
      projectId,
      serviceKey: link.serviceKey,
    });
  }
}
