import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { Actor } from '../common/actor';
import { AccessLevel, myDepartments } from '../common/access';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { HubService } from '../hub/hub.service';
import { ObserverClientService } from '../hub/observer-client.service';
import { CALYPSO_SERVICE_KEY, CalypsoClientService } from '../hub/calypso-client.service';
import { HubSyncService } from '../hub/hub-sync.service';
import { ArtifactsService } from './artifacts.service';
import { ArtifactDocument } from './schemas/artifact.schema';

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

/**
 * "새 Artifact 추가" 다이얼로그의 3개 소스(OA Service·File Artifacts·HPC Service)를
 * 후보 목록과 pickability로 통일해서 다루는 오케스트레이션 계층(설계서 04장 §6).
 *
 * ★ pickable 판정은 여기서 **한 번만** 한다 — FE도 같은 값을 그대로 그리고, BlocksService의
 *   실제 매핑도 같은 판정을 다시 태워서(재검증 원칙, 설계서 01장 §5) 신뢰하지 않는다.
 *
 *   주는(own)   → edit 권한이 있어야 고를 수 있다.
 *   받는(received) → edit 또는 view, 즉 접근 권한이 있으면 고를 수 있다.
 *
 * ★ OA Service(A)와 HPC Service(C)는 이제 **완전히 같은 흐름**이다 — HPC망과의 양방향
 *   API 연동이 확정되면서 HPC Service의 "항상 잠김"/mock 전용 처리를 없앴다(설계서 04장
 *   §2, §6.2, §6.3). project 사전 링크 단계(구 `ProjectServiceLink`)도 없다 — 후보는
 *   그 workflow가 속한 project의 code+revision을 그대로 필터로 실어 매번 실시간으로
 *   조회한다.
 */
@Injectable()
export class ArtifactSourceService {
  constructor(
    private readonly hub: HubService,
    private readonly observer: ObserverClientService,
    private readonly calypso: CalypsoClientService,
    private readonly hubSync: HubSyncService,
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
   * OA Service(A)/HPC Service(C) 후보 목록 — 그 workflow가 속한 project의 code+revision을
   * 그대로 필터로 실어 매번 실시간으로 조회한다(설계서 04장 §6.3). code/revision이 그
   * 서비스 안에서 유일하지 않은 문제(RPM처럼 production run·internal test가 같은
   * code/revision을 쓸 수 있는 경우)는 그 서비스가 필터링해서 답을 주는 문제로 넘어갔다 —
   * SIREN은 응답을 그대로 믿는다.
   */
  async liveServiceCandidates(
    project: ProjectDocument,
    actor: Actor,
    serviceKey: string,
    intent: CandidateIntent,
  ): Promise<CandidateListResult> {
    const svc = await this.hub.findByKeyOrThrow(serviceKey);
    const isAdmin = actor.isAdmin && !actor.isImpersonating;
    const summaries = await this.observer.listArtifacts(svc, project.code, project.revision, actor.knoxId, isAdmin);
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

  /** File Artifacts(B, Calypso) 후보 목록 — Calypso는 SIREN projectId를 그대로 쓴다. SIREN BE가 대신 호출한다(설계서 07장 §2). */
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

  async listCandidates(
    project: ProjectDocument,
    actor: Actor,
    source: CandidateSource,
    intent: CandidateIntent,
    serviceKey?: string,
  ): Promise<CandidateListResult> {
    if (source === 'live' || source === 'hpc') {
      if (!serviceKey) throw new BadRequestException('serviceKey is required for the OA Service/HPC Service source.');
      return this.liveServiceCandidates(project, actor, serviceKey, intent);
    }
    return this.fileArtifactCandidates(project, actor, intent);
  }

  /**
   * 실제 매핑 직전 서버 재검증(설계서 01장 §5) — FE의 pickable은 UX 게이트일 뿐이다.
   * 통과하면 find-or-create된 Artifact를 돌려주고, **그 즉시 전체 버전 이력을 한 번
   * 라이브로 pull해 캐시를 채운다**(설계서 07장 §4.3, 04장 §6.3).
   */
  async resolveLiveOrFile(
    project: ProjectDocument,
    actor: Actor,
    intent: CandidateIntent,
    input: { source: 'live' | 'file' | 'hpc'; serviceKey?: string; externalArtifactId: string; name: string },
  ): Promise<ArtifactDocument> {
    const serviceKey = input.source === 'file' ? CALYPSO_SERVICE_KEY : input.serviceKey;
    if (input.source !== 'file' && !serviceKey) throw new BadRequestException('serviceKey is required.');
    const tier: 'A' | 'B' | 'C' = input.source === 'file' ? 'B' : input.source === 'hpc' ? 'C' : 'A';

    // Admin은 여기서도 통과한다(설계서 01장 §1) — 라이브 조회는 그 값을 확인하려는
    // 목적일 뿐, 판정 자체를 좌우하지 않는다.
    let level: AccessLevel = 'edit';
    const isAdmin = actor.isAdmin && !actor.isImpersonating;
    if (!actor.isAdmin) {
      if (input.source === 'file') {
        const depts = myDepartments(actor, project);
        const list = await this.calypso.listArtifacts(project._id.toString(), actor.knoxId, depts, false);
        const found = list.find((a) => a.artifactId === input.externalArtifactId);
        level = found?.access ?? null;
      } else {
        const svc = await this.hub.findByKeyOrThrow(serviceKey as string);
        const access = await this.observer.access(svc, input.externalArtifactId, actor.knoxId, false);
        level = access.canEdit ? 'edit' : access.canView ? 'view' : null;
      }
    }

    if (!this.pickable(level, intent)) {
      throw new ForbiddenException(
        intent === 'own'
          ? 'You need edit access to that artifact to give it from this workflow.'
          : 'You do not have access to that artifact.',
      );
    }

    const artifact = await this.artifacts.findOrCreateExternal(
      project._id as Types.ObjectId,
      { tier, name: input.name, serviceKey: serviceKey as string, externalArtifactId: input.externalArtifactId },
      actor,
    );
    await this.hubSync.pullFullHistory(artifact, actor.knoxId, isAdmin);
    await artifact.save();
    return artifact;
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

    if (artifact.tier === 'D') {
      if (intent !== 'received') {
        throw new ForbiddenException('External/Attested can only be used for artifacts this workflow receives.');
      }
      return;
    }

    let level: AccessLevel;
    const isAdmin = actor.isAdmin && !actor.isImpersonating;
    if (artifact.tier === 'B' && artifact.serviceKey === CALYPSO_SERVICE_KEY && artifact.externalArtifactId) {
      const depts = myDepartments(actor, project);
      const list = await this.calypso.listArtifacts(project._id.toString(), actor.knoxId, depts, isAdmin);
      level = list.find((a) => a.artifactId === artifact.externalArtifactId)?.access ?? null;
    } else if (artifact.serviceKey && artifact.externalArtifactId) {
      // A/C(OA Service/HPC Service) — 둘 다 같은 라이브 게이트다.
      const svc = await this.hub.findByKeyOrThrow(artifact.serviceKey);
      const access = await this.observer.access(svc, artifact.externalArtifactId, actor.knoxId, isAdmin);
      level = access.canEdit ? 'edit' : access.canView ? 'view' : null;
    } else {
      // 매핑이 없는 비정상 상태 — 물어볼 곳이 없으므로 막는다.
      level = null;
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
