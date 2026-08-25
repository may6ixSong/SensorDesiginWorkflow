import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Project, ProjectDocument } from './schemas/project.schema';
import { IpsService } from '../ips/ips.service';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../common/actor';
import { isValidDepartment } from '../common/constants/departments';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name) private readonly model: Model<ProjectDocument>,
    private readonly ips: IpsService,
    private readonly audit: AuditService,
  ) {}

  /** 접근 가능한 과제 목록 = 하나 이상의 IP에 Edit/View 권한이 있는 과제 (설계서 5.1). */
  async listAccessibleForUser(knoxId: string) {
    const projectIds = await this.ips.distinctAccessibleProjectIds(knoxId);
    return this.model.find({ _id: { $in: projectIds } }).sort({ code: 1 }).exec();
  }

  async findByIdOrThrow(id: string) {
    const project = await this.model.findById(id).exec();
    if (!project) throw new NotFoundException('Project not found.');
    return project;
  }

  async getPhases(id: string) {
    const project = await this.findByIdOrThrow(id);
    return project.phases;
  }

  /**
   * 마일스톤(Phase) 일정 수정 — label/start/end만 바꾼다. key/order는 산출물의
   * phaseKey·캔버스 레이아웃이 참조하므로 이 API로 추가/삭제/개명하지 않는다 -
   * 그래서 들어온 phases는 기존 key 집합과 정확히 일치해야 한다.
   */
  async updatePhases(id: string, updates: { key: string; label: string; start: string; end: string }[], actor: Actor) {
    await this.assertManageAccess(id, actor);
    const project = await this.findByIdOrThrow(id);

    const existingKeys = new Set(project.phases.map((p) => p.key));
    const updateKeys = new Set(updates.map((p) => p.key));
    if (existingKeys.size !== updateKeys.size || [...existingKeys].some((k) => !updateKeys.has(k))) {
      throw new BadRequestException('Milestones cannot be added or removed here — only the schedule can change.');
    }
    const byKey = new Map(updates.map((p) => [p.key, p]));
    for (const p of project.phases) {
      const u = byKey.get(p.key)!;
      const start = new Date(u.start);
      const end = new Date(u.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new BadRequestException(`Invalid date for milestone ${p.key}.`);
      }
      if (start.getTime() >= end.getTime()) {
        throw new BadRequestException(`${p.key}: start date must be before the end date.`);
      }
      if (!u.label.trim()) {
        throw new BadRequestException(`${p.key}: label cannot be empty.`);
      }
    }

    project.phases = project.phases.map((p) => {
      const u = byKey.get(p.key)!;
      return { key: p.key, order: p.order, label: u.label.trim(), start: u.start, end: u.end };
    });

    await project.save();
    await this.audit.log(actor.knoxId, 'PROJECT_PHASES_UPDATE', 'project', project._id, {});
    return this.findDetailOrThrow(id, actor.knoxId);
  }

  /**
   * Project Information 페이지 상세 조회. 개인 접근 권한으로 막지 않는다 - 어떤 과제를
   * 보여줄지는 web이 사용자 Group(Admin이면 super)과 IP의 owners/viewGrants로 판단한다
   * (2026-08-25 결정, src/common/guards/ip-access.guard.ts 참고).
   * members는 KnoxID만 담으므로 populate 없이 그대로 내려간다.
   */
  async findDetailOrThrow(id: string, _knoxId: string) {
    const project = await this.model.findById(id).exec();
    if (!project) throw new NotFoundException('Project not found.');
    return project;
  }

  /**
   * 과제 열람 게이트 - 현재는 아무것도 막지 않는다. 추후 토큰 인증이 들어오면
   * 여기와 IpAccessGuard 두 곳만 되살리면 서버 차단이 복구된다.
   */
  async assertViewAccess(id: string, _knoxId: string) {
    await this.findByIdOrThrow(id);
  }

  /** 과제 관리 게이트 - 위 assertViewAccess와 동일한 이유로 차단하지 않는다. */
  private async assertManageAccess(id: string, _actor: Actor) {
    await this.findByIdOrThrow(id);
  }

  /** 과제 메타데이터(이름/코드/도메인/상태) 수정 — Phase는 읽기 전용이라 여기서 다루지 않는다. */
  async updateProject(
    id: string,
    dto: { name?: string; code?: string; domain?: string; status?: string },
    actor: Actor,
  ) {
    await this.assertManageAccess(id, actor);
    const project = await this.findByIdOrThrow(id);

    if (dto.code !== undefined && dto.code !== project.code) {
      const existing = await this.model.findOne({ code: dto.code }).exec();
      if (existing && existing._id.toString() !== project._id.toString()) {
        throw new BadRequestException('That project code is already in use.');
      }
      project.code = dto.code;
    }
    if (dto.name !== undefined) project.name = dto.name;
    if (dto.domain !== undefined) project.domain = dto.domain;
    if (dto.status !== undefined) project.status = dto.status;

    await project.save();
    await this.audit.log(actor.knoxId, 'PROJECT_UPDATE', 'project', project._id, dto);
    return this.findDetailOrThrow(id, actor.knoxId);
  }

  /** 과제 팀원 명단(부서별 로스터)에 인원을 추가한다 — IP owners/viewGrants(접근 권한)와는 별개 개념. */
  async addMember(id: string, knoxId: string, department: string, actor: Actor) {
    if (!isValidDepartment(department)) {
      throw new BadRequestException('Unknown department.');
    }
    await this.assertManageAccess(id, actor);
    const project = await this.findByIdOrThrow(id);
    if (!project.members.some((m) => m.knoxId === knoxId)) {
      project.members.push({ knoxId, department, addedAt: new Date() });
      await project.save();
      await this.audit.log(actor.knoxId, 'PROJECT_MEMBER_ADD', 'project', project._id, { knoxId, department });
    }
    return this.findDetailOrThrow(id, actor.knoxId);
  }

  async removeMember(id: string, knoxId: string, actor: Actor) {
    await this.assertManageAccess(id, actor);
    const project = await this.findByIdOrThrow(id);
    project.members = project.members.filter((m) => m.knoxId !== knoxId);
    await project.save();
    await this.audit.log(actor.knoxId, 'PROJECT_MEMBER_REMOVE', 'project', project._id, { knoxId });
    return this.findDetailOrThrow(id, actor.knoxId);
  }
}
