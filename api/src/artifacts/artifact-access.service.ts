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
import { ArtifactDocument, ArtifactVersion } from './schemas/artifact.schema';
import { ArtifactVersionDto, toVersionDtoList } from './dto/artifact.dto';
import { HubService } from '../hub/hub.service';
import { ObserverClientService, ObserverHtmlView } from '../hub/observer-client.service';
import { CALYPSO_SERVICE_KEY, CalypsoClientService } from '../hub/calypso-client.service';

/**
 * 산출물 상세(slide) 열람 판정 (설계서 01장 §4.2, 04장 §4).
 *
 * common/access.ts 의 순수 함수와 달리 여기는 **I/O가 있다** — 게이트 2가 그 서비스에
 * 라이브로 물어보는 호출이기 때문이다.
 *
 * ┌ OA Service/File Artifacts/HPC Service(A/B/C) — 2단 게이트, 공통 ──────┐
 * │ 게이트 1 (SIREN)  그 block의 recipients(edit 또는 view)에 속하나?      │
 * │                    아니다 → 막는다. 서비스에 물어보지도 않는다.         │
 * │ 게이트 2 (서비스)  access.canView 가 true 인가? (File Artifacts는       │
 * │                    SIREN BE가 Calypso에 대신 물어본다)                 │
 * │                    아니다 → 막는다.                                    │
 * │                    맞다  → 연다. 버전 트리 깊이는 canEdit로 갈린다.     │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * ★ workflow Edit Access가 있어도 recipient가 아니면 막힌다. 예전 설계의 "workflow Edit
 *   Access는 항상 통과" 규칙은 폐지되었다.
 * ★ v3 설계 도중 한 번 뒤집힌 결정이다(설계서 04장 §3) — 원래는 B/C/D를 artifact 단위
 *   SIREN 보관 권한(sirenArtifactLevel)으로 판정했는데, 여러 workflow가 하나의 artifact를
 *   공유할 때 한 workflow의 수정이 다른 workflow까지 번지는 문제와 HPC Service는 HPC망
 *   안에서 권한 자체가 무의미하다는 점 때문에 A/B/C를 이 2단 게이트로 통일했다.
 *
 * External/Attested(D)만 이번 범위에서 제외 — 물어볼 서비스가 없으므로 옛 방식
 * (sirenArtifactLevel, artifact 단위 SIREN 보관 권한)을 잠정적으로 그대로 쓴다.
 */
@Injectable()
export class ArtifactAccessService {
  private readonly logger = new Logger(ArtifactAccessService.name);

  constructor(
    private readonly hub: HubService,
    private readonly observer: ObserverClientService,
    private readonly calypso: CalypsoClientService,
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

    if ((artifact.tier ?? 'D') === 'D') {
      // External/Attested — 이번 범위에서 세부 미정. 물어볼 서비스가 없으므로 옛 방식을 쓴다.
      return sirenArtifactLevel(actor, artifact, myDepts);
    }

    // --- A/B/C(OA Service/File Artifacts/HPC Service) 공통 ---
    // 게이트 1: SIREN recipient. 여기서 막히면 서비스 호출 자체를 하지 않는다.
    const gate1 = recipientLevel(actor, block, myDepts);
    if (gate1 === null) return null;

    // 게이트 2: 그 서비스의 실제 권한.
    const serviceAccess = await this.serviceAccess(actor, artifact, myDepts);
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
   * 게이트 2 — 그 서비스에 canView/canEdit를 물어본다. File Artifacts(B, Calypso)는
   * Hub 레지스트리 대상이 아니므로 CalypsoClientService로 따로 분기한다.
   *
   * fail-closed다: 서비스가 죽었거나 느리면 `{canView:false, canEdit:false}`를 돌려주므로
   * 결과적으로 막힌다. 권한 판정에서 실패를 관대하게 처리하면 안 된다.
   *
   * isAdmin은 항상 false로 넘긴다 — 여기 도달했다는 것은 actor.isAdmin이 false라는 뜻이고
   * (위에서 이미 걸러졌다), 시뮬레이션 중에 대상 사용자 시야를 정확히 재현해야 한다.
   */
  private async serviceAccess(
    actor: Actor,
    artifact: { serviceKey?: string | null; externalArtifactId?: string | null },
    myDepts: string[],
  ): Promise<{ canView: boolean; canEdit: boolean }> {
    const { serviceKey, externalArtifactId } = artifact;
    if (!serviceKey || !externalArtifactId) {
      // 매핑이 없다 — 물어볼 곳이 없으므로 열지 않는다.
      return { canView: false, canEdit: false };
    }
    try {
      if (serviceKey === CALYPSO_SERVICE_KEY) {
        return await this.calypso.access(externalArtifactId, actor.knoxId, myDepts, false);
      }
      const svc = await this.hub.findByKeyOrThrow(serviceKey);
      return await this.observer.access(svc, externalArtifactId, actor.knoxId, false);
    } catch (e) {
      this.logger.warn(
        `access gate failed for ${serviceKey}/${externalArtifactId} — ${(e as Error).message}`,
      );
      return { canView: false, canEdit: false };
    }
  }

  /**
   * 버전 목록 — 이제 **SIREN 캐시에서 읽는다.** OA Service/File Artifacts/HPC Service
   * (A/B/C) 전부 push event + 야간 재동기화로 이미 `artifact.versions`에 채워져 있다
   * (설계서 07장 §3·§4). 열 때마다 그 서비스에 라이브로 다시 묻지 않는다 — 라이브인 건
   * 오직 권한(게이트 2)과 html-view뿐이다(04장 §7).
   *
   * level은 호출부가 이미 levelFor()/assertCanOpen()으로 판정해 둔 값을 그대로 받는다.
   * level이 null이면(=열람 자체가 막힘) 빈 배열이다.
   */
  async liveVersions(
    actor: Actor,
    artifact: { versions?: ArtifactVersion[] },
    level: AccessLevel,
  ): Promise<ArtifactVersionDto[]> {
    if (level === null) return [];
    return toVersionDtoList(artifact.versions ?? [], level);
  }

  /**
   * 이 버전의 html preview(설계서 04장 §19 확장 — B Tier의 upload/download 자리를 A/C
   * Tier에서는 이걸로 대신한다). File Artifacts(B, Calypso)는 이 자리를 upload/download
   * UI가 대신하므로 애초에 대상이 아니다 — 시도조차 하지 않는다.
   * 서비스가 이 라우트를 모르거나 실패하면 null — 호출부는 "이전처럼 아무것도 안 보여준다."
   * (07장 §4.1 — hasHtmlView를 캐시하지 않기로 하면서, 클릭 가능 여부를 미리 표시하지 않고
   * 매번 이 라이브 호출로 그 자리에서 확인하는 방식으로 단순화했다.)
   */
  async htmlView(
    actor: Actor,
    artifact: { serviceKey?: string | null; externalArtifactId?: string | null },
    level: AccessLevel,
    versionLabel: string,
  ): Promise<ObserverHtmlView | null> {
    if (level === null) return null;
    const { serviceKey, externalArtifactId } = artifact;
    if (!serviceKey || !externalArtifactId || serviceKey === CALYPSO_SERVICE_KEY) return null;
    try {
      const svc = await this.hub.findByKeyOrThrow(serviceKey);
      return await this.observer.htmlView(svc, externalArtifactId, versionLabel, actor.knoxId, this.isAdminVisible(actor));
    } catch (e) {
      this.logger.warn(
        `html-view failed for ${serviceKey}/${externalArtifactId}@${versionLabel} — ${(e as Error).message}`,
      );
      return null;
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
