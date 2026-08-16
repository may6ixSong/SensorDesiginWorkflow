import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Project, ProjectDocument } from './schemas/project.schema';
import { IpsService } from '../ips/ips.service';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name) private readonly model: Model<ProjectDocument>,
    private readonly ips: IpsService,
  ) {}

  /** 접근 가능한 과제 목록 = 하나 이상의 IP에 Edit/View 권한이 있는 과제 (설계서 5.1). */
  async listAccessibleForUser(userId: string) {
    const projectIds = await this.ips.distinctAccessibleProjectIds(userId);
    return this.model.find({ _id: { $in: projectIds } }).sort({ code: 1 }).exec();
  }

  async findByIdOrThrow(id: string) {
    const project = await this.model.findById(id).exec();
    if (!project) throw new NotFoundException('Program not found.');
    return project;
  }

  /** phases는 읽기 전용 참조 (설계서 3.2, 4.4) - 이 시스템에는 쓰는 API가 없다. */
  async getPhases(id: string) {
    const project = await this.findByIdOrThrow(id);
    return project.phases;
  }
}
