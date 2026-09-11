import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Actor } from '../common/actor';
import {
  AccessLevel,
  ArtifactLike,
  BlockLike,
  ProjectLike,
  myDepartments,
  recipientLevel,
  sirenArtifactLevel,
} from '../common/access';
import { isServiceGovernedTier } from '../common/constants/tier';
import { ArtifactDocument, ArtifactVersion } from './schemas/artifact.schema';
import { ArtifactVersionDto, toVersionDtoList } from './dto/artifact.dto';
import { HubService } from '../hub/hub.service';
import { ObserverClientService } from '../hub/observer-client.service';

/**
 * 산출물 상세(slide) 열람 판정 (설계서 01장 §4.2, 04장 §4).
 *
 * common/access.ts 의 순수 함수와 달리 여기는 **I/O가 있다** — A Tier의 두 번째 게이트가
 * 그 서비스에 라이브로 물어보는 호출이기 때문이다.
 *
 * ┌ A Tier — 2단 게이트 ────────────────────────────────────────────┐
 * │ 게이트 1 (SIREN)  그 block의 recipients(edit 또는 view)에 속하나? │
 * │                    아니다 → 막는다. 서비스에 물어보지도 않는다.    │
 * │ 게이트 2 (서비스)  access.canView 가 true 인가?                   │
 * │                    아니다 → 막는다.                               │
 * │                    맞다  → 연다. 버전 트리 깊이는 canEdit로 갈린다.│
 * └──────────────────────────────────────────────────────────────────┘
 *
 * ★ workflow Edit Access가 있어도 recipient가 아니면 막힌다. 예전 설계의 "workflow Edit
 *   Access는 항상 통과" 규칙은 폐지되었다.
 *
 * B/C/D는 SIREN이 권한을 직접 들고 있으므로 게이트가 하나뿐이고 외부 호출도 없다.
 */
@Injectable()
export class ArtifactAccessService {
  private readonly logger = new Logger(ArtifactAccessService.name);

  constructor(
    private readonly hub: HubService,
    private readonly observer: ObserverClientService,
  ) {}

  /**
   * 이 사람이 이 산출물에 대해 갖는 실효 권한.
   * null이면 상세를 열 수 없다 — 호출부는 "권한 없음"을 렌더하고, **"아직 publish된 버전이
   * 없음"과 절대 같은 화면을 쓰지 않는다**(설계서 04장 §4.3).
   */
  async levelFor(
    actor: Actor,
    artifact: ArtifactDocument | (ArtifactLike & { serviceKey?: string | null; externalArtifactId?: string | null }),
    block: BlockLike | null,
    project: ProjectLike | null,
  ): Promise<AccessLevel> {
    if (actor.isAdmin) return 'edit';

    const myDepts = myDepartments(actor, project);

    if (!isServiceGovernedTier((artifact.tier ?? 'D') as 'A' | 'B' | 'C' | 'D')) {
      // B / C / D — artifact 자체 권한만 본다. workflow Edit Access는 근거가 되지 않는다.
      return sirenArtifactLevel(actor, artifact, myDepts);
    }

    // --- A Tier ---
    // 게이트 1: SIREN recipient. 여기서 막히면 서비스 호출 자체를 하지 않는다.
    const gate1 = recipientLevel(actor, block, myDepts);
    if (gate1 === null) return null;

    // 게이트 2: 그 서비스의 실제 권한.
    const serviceAccess = await this.serviceAccess(actor, artifact);
    if (!serviceAccess.canView) return null;

    // 버전 트리 깊이는 **최종적으로 그 서비스의 응답**이 결정한다 — recipient에 edit으로
    // 들어 있어도 서비스에서 edit이 아니면 working 버전은 안 보인다(설계서 04장 §7).
    return serviceAccess.canEdit ? 'edit' : 'view';
  }

  /** 열 수 없으면 403. 컨트롤러에서 한 줄로 쓰기 위한 래퍼다. */
  async assertCanOpen(
    actor: Actor,
    artifact: ArtifactDocument,
    block: BlockLike | null,
    project: ProjectLike | null,
  ): Promise<AccessLevel> {
    const level = await this.levelFor(actor, artifact, block, project);
    if (level === null) throw new ForbiddenException('You do not have access to this artifact.');
    return level;
  }

  /**
   * 게이트 2 — 그 서비스에 canView/canEdit를 물어본다.
   *
   * fail-closed다: 서비스가 죽었거나 느리면 ObserverClientService가 `{canView:false,
   * canEdit:false}`를 돌려주므로 결과적으로 막힌다. 권한 판정에서 실패를 관대하게
   * 처리하면 안 된다.
   *
   * isAdmin은 항상 false로 넘긴다 — 여기 도달했다는 것은 actor.isAdmin이 false라는 뜻이고
   * (위에서 이미 걸러졌다), 시뮬레이션 중에 대상 사용자 시야를 정확히 재현해야 한다.
   */
  private async serviceAccess(
    actor: Actor,
    artifact: { serviceKey?: string | null; externalArtifactId?: string | null },
  ): Promise<{ canView: boolean; canEdit: boolean }> {
    const { serviceKey, externalArtifactId } = artifact;
    if (!serviceKey || !externalArtifactId) {
      // A Tier인데 매핑이 없다 — 물어볼 곳이 없으므로 열지 않는다.
      return { canView: false, canEdit: false };
    }
    try {
      const svc = await this.hub.findByKeyOrThrow(serviceKey);
      return await this.observer.access(svc, externalArtifactId, actor.knoxId, false);
    } catch (e) {
      this.logger.warn(
        `A-tier access gate failed for ${serviceKey}/${externalArtifactId} — ${(e as Error).message}`,
      );
      return { canView: false, canEdit: false };
    }
  }

  /**
   * 라이브 버전 조회 — v3 재설계 전 `DeliverablesService.liveVersions()`가 하던 일의
   * 복원이다. Hub에 등록된(Calypso 제외) 서비스에 연동된 **A Tier만** 대상이다 — B/C/D는
   * SIREN이 로컬 기록을 그대로 쓰고, Calypso는 이 레지스트리 대상이 아니며 브라우저가
   * 이미 직접 호출한다(설계서 04장 §10). 매핑이 없거나 서비스가 응답하지 않으면 빈
   * 배열이다 — 호출부(slide)는 그걸 "아직 published된 버전이 없음"과 동일하게 그린다.
   *
   * level은 호출부가 이미 levelFor()/assertCanOpen()으로 판정해 둔 값을 그대로 받는다 —
   * 여기서 다시 게이트 1(recipient)을 판정할 근거(block)가 없기 때문이다. level이
   * null이면(=열람 자체가 막힘) 호출하지 않는다.
   */
  async liveVersions(
    actor: Actor,
    artifact: { tier: string; serviceKey?: string | null; externalArtifactId?: string | null },
    level: AccessLevel,
  ): Promise<ArtifactVersionDto[]> {
    if (level === null) return [];
    if (!isServiceGovernedTier((artifact.tier ?? 'D') as 'A' | 'B' | 'C' | 'D')) return [];
    const { serviceKey, externalArtifactId } = artifact;
    if (!serviceKey || serviceKey === 'calypso' || !externalArtifactId) return [];

    try {
      const svc = await this.hub.findByKeyOrThrow(serviceKey);
      const records = await this.observer.versions(
        svc,
        externalArtifactId,
        actor.knoxId,
        this.isAdminVisible(actor),
      );
      const entries = records.map((r) => this.observer.toVersionEntry(r, 'A') as ArtifactVersion);
      return toVersionDtoList(entries, level);
    } catch (e) {
      this.logger.warn(
        `A-tier live-versions failed for ${serviceKey}/${externalArtifactId} — ${(e as Error).message}`,
      );
      return [];
    }
  }

  /**
   * RPM처럼 서비스가 자발적으로 지원하면, 실제 검증된 Admin(시뮬레이션 중이 아닌)에게
   * member가 아니어도 편집자 시야(작업중 버전)를 보여줄 수 있다. isAdmin은 realKnoxId
   * 기준이라 시뮬레이션 중에도 true로 남으므로, isImpersonating도 함께 봐야 한다 —
   * 시뮬레이션 중엔 Admin의 super 권한이 아니라 대상 사용자 본인의 실제 권한으로
   * 보여야 하기 때문이다(§13.3 규칙 2와 같은 이유).
   */
  private isAdminVisible(actor: Actor): boolean {
    return actor.isAdmin && !actor.isImpersonating;
  }
}
