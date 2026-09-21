import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Actor } from '../common/actor';
import { AccessLevel, ArtifactLike, myDepartments, ProjectLike } from '../common/access';
import { ArtifactDocument, ArtifactVersion } from './schemas/artifact.schema';
import { ArtifactVersionDto, toVersionDtoList } from './dto/artifact.dto';
import { HubService } from '../hub/hub.service';
import { ObserverClientService, ObserverHtmlView } from '../hub/observer-client.service';
import { CALYPSO_SERVICE_KEY, CalypsoClientService } from '../hub/calypso-client.service';

/**
 * 산출물 상세(slide) 열람 판정 (설계서 01장 §4.2, 04장 §4).
 *
 * common/access.ts 의 순수 함수와 달리 여기는 **I/O가 있다** — 그 서비스에 라이브로
 * 물어보는 호출이기 때문이다.
 *
 * ┌ OA Service/File Artifacts/HPC Service(A/B/C) — 공통, 서비스 자신의 권한만 ──┐
 * │ access.canView 가 true 인가? (File Artifacts는 SIREN BE가 Calypso에 대신   │
 * │                    물어본다)                                              │
 * │                    아니다 → 막는다.                                       │
 * │                    맞다  → 연다. 버전 트리 깊이는 canEdit로 갈린다.        │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ★ **block.recipients는 이 판정에 관여하지 않는다**(사용자 결정, 01장 §4.2 갱신 — 이전
 *   버전은 "recipient(게이트 1) → 서비스 권한(게이트 2)"의 2단 게이트였다). 그 결과 같은
 *   부서가 만든 workflow인데도, artifact 자체는 view 제한이 없는데도, 그 block의
 *   recipient가 다른 부서로 지정돼 있으면 못 여는 상황이 나왔다 — recipient는 이제
 *   **release 알림 대상**과 **Recipients/Comments 탭에 누구를 보여줄지**에만 쓰이고,
 *   slide를 열 수 있는지는 그 서비스의 canView/canEdit 하나로만 정해진다.
 * ★ artifact 단위로 SIREN이 editAccess/viewAccess를 직접 보관하던 옛 모델은 완전히
 *   폐기했다 — 실제 Edit/View는 항상 그 서비스가 최종 판정한다. 여러 workflow가 하나의
 *   artifact를 공유해도 이 판정 자체는 workflow와 무관하다(block을 더 이상 참조하지
 *   않는다).
 *
 * ★ External/Attested(D) — 서비스가 없어 이 판정 자체가 없던 tier — 는 폐기했다. File
 *   Artifacts(B, Calypso)가 OA-link/HPC-path 참조형 콘텐츠까지 갖도록 넓어지면서 D의
 *   역할을 대체했으므로, 지금은 A/B/C 전부 예외 없이 이 규칙을 탄다.
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
   *
   * A/B/C(OA Service/File Artifacts/HPC Service) 전부 그 서비스 자신의 canView/canEdit
   * 하나로만 정해진다 — block/recipient는 더 이상 이 판정의 입력이 아니다.
   */
  async levelFor(
    actor: Actor,
    artifact: ArtifactDocument | (ArtifactLike & { serviceKey?: string | null; externalArtifactId?: string | null }),
    project: ProjectLike | null,
  ): Promise<AccessLevel> {
    if (actor.isAdmin) return 'edit';

    const myDepts = myDepartments(actor, project);
    const serviceAccess = await this.serviceAccess(actor, artifact, myDepts);
    if (serviceAccess.canEdit) return 'edit';
    if (serviceAccess.canView) return 'view';
    return null;
  }

  /** 열 수 없으면 403. 컨트롤러에서 한 줄로 쓰기 위한 래퍼다. */
  async assertCanOpen(
    actor: Actor,
    artifact: ArtifactDocument,
    project: ProjectLike | null,
  ): Promise<AccessLevel> {
    const level = await this.levelFor(actor, artifact, project);
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
   * isAdmin은 항상 false로 넘긴다 — 여기 도달했다는 것은 actor.isAdmin이 false라는 뜻이다
   * (위에서 이미 걸러졌다). 시뮬레이션 중이면 actor.isAdmin 자체가 대상 본인 기준이므로
   * (common/actor.ts) 그 사람의 시야가 그대로 재현된다.
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
      return await this.observer.htmlView(svc, externalArtifactId, versionLabel, actor.knoxId, actor.isAdmin);
    } catch (e) {
      this.logger.warn(
        `html-view failed for ${serviceKey}/${externalArtifactId}@${versionLabel} — ${(e as Error).message}`,
      );
      return null;
    }
  }
}
