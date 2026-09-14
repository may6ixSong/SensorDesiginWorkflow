import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Actor } from '../common/actor';
import { AccessLevel, myDepartments, sirenArtifactLevel } from '../common/access';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { HubService } from '../hub/hub.service';
import { ObserverClientService } from '../hub/observer-client.service';
import { CalypsoClientService } from '../hub/calypso-client.service';
import { ArtifactsService } from './artifacts.service';
import { ArtifactDocument } from './schemas/artifact.schema';
import { HpcPathMock, HpcPathMockDocument } from './schemas/hpc-path-mock.schema';

export type CandidateIntent = 'own' | 'received';
export type CandidateSource = 'live' | 'file' | 'hpc';

export interface ArtifactCandidate {
  externalArtifactId: string;
  name: string;
  currentVersionLabel: string | null;
  level: AccessLevel;
  pickable: boolean;
  blockedReason: string | null;
}

export interface CandidateListResult {
  /** false면 이 소스는 지금 후보를 브라우징할 수 없다 — FE는 수동 입력으로 폴백한다. */
  supported: boolean;
  candidates: ArtifactCandidate[];
  note?: string;
}

const CALYPSO_SERVICE_KEY = 'calypso';

/**
 * "새 Artifact 추가" 다이얼로그의 3개 소스(Live Service·File Artifacts·HPC Path)를
 * 후보 목록과 pickability로 통일해서 다루는 오케스트레이션 계층(설계서 04장 §6).
 *
 * ★ pickable 판정은 여기서 **한 번만** 한다 — FE도 같은 값을 그대로 그리고, BlocksService의
 *   실제 매핑도 같은 판정을 다시 태워서(재검증 원칙, 설계서 01장 §5) 신뢰하지 않는다.
 *
 *   주는(own)   → edit 권한이 있어야 고를 수 있다.
 *   받는(received) → edit 또는 view, 즉 접근 권한이 있으면 고를 수 있다.
 */
@Injectable()
export class ArtifactSourceService {
  constructor(
    @InjectModel(HpcPathMock.name) private readonly hpcMock: Model<HpcPathMockDocument>,
    private readonly hub: HubService,
    private readonly observer: ObserverClientService,
    private readonly calypso: CalypsoClientService,
    private readonly artifacts: ArtifactsService,
  ) {}

  private pickable(level: AccessLevel, intent: CandidateIntent): boolean {
    return intent === 'own' ? level === 'edit' : level !== null;
  }

  private blockedReason(level: AccessLevel, intent: CandidateIntent): string | null {
    if (this.pickable(level, intent)) return null;
    if (level === null) return 'no-access';
    return 'view-only'; // level==='view'인데 own을 요구하는 경우만 여기 온다
  }

  /**
   * Live Service(A) 후보 목록 — project code/revision 검색은 이 호출 **전에** FE가
   * `GET /hub/services/:key/projects/search`(기존 §19.3 엔드포인트)로 이미 끝내고,
   * 사람이 그 후보 중 하나를 직접 골라 `externalProjectId`로 넘겨준다(04장 §6.3). code+
   * revision이 그 서비스 안에서 유일하다는 보장이 없어(RPM처럼) 사람이 확정해야 한다 —
   * SIREN이 이 값을 미리 저장해 둔 링크에서 자동으로 찾지 않는다.
   */
  async liveServiceCandidates(
    project: ProjectDocument,
    actor: Actor,
    serviceKey: string,
    externalProjectId: string,
    intent: CandidateIntent,
  ): Promise<CandidateListResult> {
    const svc = await this.hub.findByKeyOrThrow(serviceKey);
    const isAdmin = actor.isAdmin && !actor.isImpersonating;
    const summaries = await this.observer.listArtifacts(svc, externalProjectId, actor.knoxId, isAdmin);
    if (summaries === null) {
      return { supported: false, candidates: [], note: 'This service does not support browsing — enter the artifact id directly.' };
    }

    const withAccess = await Promise.all(
      summaries.map(async (s) => {
        const access = await this.observer.access(svc, s.artifactId, actor.knoxId, isAdmin);
        const level: AccessLevel = access.canEdit ? 'edit' : access.canView ? 'view' : null;
        return { s, level };
      }),
    );

    return {
      supported: true,
      candidates: withAccess.map(({ s, level }) => ({
        externalArtifactId: s.artifactId,
        name: s.name,
        currentVersionLabel: s.currentVersion?.versionLabel ?? null,
        level,
        pickable: this.pickable(level, intent),
        blockedReason: this.blockedReason(level, intent),
      })),
    };
  }

  /** File Artifacts(B, Calypso) 후보 목록 — Calypso는 SIREN projectId를 그대로 쓴다. */
  async fileArtifactCandidates(
    project: ProjectDocument,
    actor: Actor,
    intent: CandidateIntent,
  ): Promise<CandidateListResult> {
    const depts = myDepartments(actor, project);
    const isAdmin = actor.isAdmin && !actor.isImpersonating;
    const list = await this.calypso.listArtifacts(project._id.toString(), actor.knoxId, depts, isAdmin);
    return {
      supported: true,
      candidates: list.map((a) => ({
        externalArtifactId: a.artifactId,
        name: a.name,
        currentVersionLabel: null,
        level: a.access,
        pickable: this.pickable(a.access, intent),
        blockedReason: this.blockedReason(a.access, intent),
      })),
    };
  }

  /** HPC Path(C) — 아직 미연동. 항상 선택 불가, 미리보기 전용(설계서 04장 §6.4). */
  async hpcMockCandidates(project: ProjectDocument): Promise<CandidateListResult> {
    const rows = await this.hpcMock
      .find({ projectCode: project.code, projectRevision: project.revision })
      .exec();
    return {
      supported: false,
      candidates: rows.map((r) => ({
        externalArtifactId: r._id.toString(),
        name: r.name,
        currentVersionLabel: r.path,
        level: null,
        pickable: false,
        blockedReason: 'not-integrated',
      })),
      note: 'HPC Path is not integrated yet — shown for preview only.',
    };
  }

  async listCandidates(
    project: ProjectDocument,
    actor: Actor,
    source: CandidateSource,
    intent: CandidateIntent,
    serviceKey?: string,
    externalProjectId?: string,
  ): Promise<CandidateListResult> {
    if (source === 'live') {
      if (!serviceKey) throw new BadRequestException('serviceKey is required for the Live Service source.');
      if (!externalProjectId) {
        throw new BadRequestException('externalProjectId is required — pick a project candidate first.');
      }
      return this.liveServiceCandidates(project, actor, serviceKey, externalProjectId, intent);
    }
    if (source === 'file') return this.fileArtifactCandidates(project, actor, intent);
    return this.hpcMockCandidates(project);
  }

  /**
   * 실제 매핑 직전 서버 재검증(설계서 01장 §5) — FE의 pickable은 UX 게이트일 뿐이다.
   * 통과하면 find-or-create된 Artifact를 돌려준다.
   */
  async resolveLiveOrFile(
    project: ProjectDocument,
    actor: Actor,
    intent: CandidateIntent,
    input: { source: 'live' | 'file'; serviceKey?: string; externalArtifactId: string; name: string },
  ): Promise<ArtifactDocument> {
    const serviceKey = input.source === 'live' ? input.serviceKey : CALYPSO_SERVICE_KEY;
    if (input.source === 'live' && !serviceKey) throw new BadRequestException('serviceKey is required.');
    const tier: 'A' | 'B' = input.source === 'live' ? 'A' : 'B';

    // Admin은 여기서도 통과한다(설계서 01장 §1) — 라이브 조회는 그 값을 확인하려는
    // 목적일 뿐, 판정 자체를 좌우하지 않는다.
    let level: AccessLevel = 'edit';
    if (!actor.isAdmin) {
      if (input.source === 'live') {
        const svc = await this.hub.findByKeyOrThrow(serviceKey as string);
        const access = await this.observer.access(svc, input.externalArtifactId, actor.knoxId, false);
        level = access.canEdit ? 'edit' : access.canView ? 'view' : null;
      } else {
        const depts = myDepartments(actor, project);
        const list = await this.calypso.listArtifacts(project._id.toString(), actor.knoxId, depts, false);
        const found = list.find((a) => a.artifactId === input.externalArtifactId);
        level = found?.access ?? null;
      }
    }

    if (!this.pickable(level, intent)) {
      throw new ForbiddenException(
        intent === 'own'
          ? 'You need edit access to that artifact to give it from this workflow.'
          : 'You do not have access to that artifact.',
      );
    }

    return this.artifacts.findOrCreateExternal(
      project._id as Types.ObjectId,
      { tier, name: input.name, serviceKey: serviceKey as string, externalArtifactId: input.externalArtifactId },
      actor,
    );
  }

  /**
   * 이미 있는 artifact를 **재사용**할 때의 재검증(설계서 01장 §5) — block 생성/재매핑
   * 양쪽에서 쓴다. 새로 만드는 경로(resolveLiveOrFile/resolveAttested)와 판정 기준은
   * 같지만, 이미 SIREN에 존재하는 artifact라 tier로 분기해서 다시 확인한다.
   */
  async assertReusePickable(
    project: ProjectDocument,
    actor: Actor,
    artifact: ArtifactDocument,
    intent: CandidateIntent,
  ): Promise<void> {
    if (actor.isAdmin) return;

    if (artifact.tier === 'C') {
      throw new ForbiddenException('Tier C (HPC Path) is not integrated yet — it cannot be mapped.');
    }

    if (artifact.tier === 'D') {
      if (intent !== 'received') {
        throw new ForbiddenException('Tier D can only be used for artifacts this workflow receives.');
      }
      return;
    }

    let level: AccessLevel;
    if (artifact.tier === 'A' && artifact.serviceKey && artifact.externalArtifactId) {
      const svc = await this.hub.findByKeyOrThrow(artifact.serviceKey);
      const isAdmin = actor.isAdmin && !actor.isImpersonating;
      const access = await this.observer.access(svc, artifact.externalArtifactId, actor.knoxId, isAdmin);
      level = access.canEdit ? 'edit' : access.canView ? 'view' : null;
    } else if (artifact.tier === 'B' && artifact.serviceKey === CALYPSO_SERVICE_KEY && artifact.externalArtifactId) {
      const depts = myDepartments(actor, project);
      const isAdmin = actor.isAdmin && !actor.isImpersonating;
      const list = await this.calypso.listArtifacts(project._id.toString(), actor.knoxId, depts, isAdmin);
      level = list.find((a) => a.artifactId === artifact.externalArtifactId)?.access ?? null;
    } else {
      // B/C/D 중 서비스 라이브 조회 대상이 아닌 것 — SIREN이 직접 든 editAccess/viewAccess로.
      level = sirenArtifactLevel(actor, artifact, myDepartments(actor, project));
    }

    if (!this.pickable(level, intent)) {
      throw new ForbiddenException(
        intent === 'own'
          ? 'You need edit access to that artifact to give it from this workflow.'
          : 'You do not have access to that artifact.',
      );
    }
  }

  /** D Tier(받는 전용) — 검증할 시스템이 없으므로 그냥 새로 만든다(설계서 04장 §6.4). */
  async resolveAttested(
    project: ProjectDocument,
    actor: Actor,
    intent: CandidateIntent,
    input: { name: string; expectedGiver?: { departments?: string[]; users?: string[] } },
  ): Promise<ArtifactDocument> {
    if (intent !== 'received') {
      throw new BadRequestException('Tier D can only be used for artifacts this workflow receives.');
    }
    return this.artifacts.createAttested(project._id as Types.ObjectId, input, actor);
  }
}
