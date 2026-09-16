import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Artifact, ArtifactDocument, ArtifactVersion } from '../artifacts/schemas/artifact.schema';
import { Tier } from '../common/constants/tier';
import { HubService } from './hub.service';
import { ObserverClientService } from './observer-client.service';
import { CalypsoClientService } from './calypso-client.service';

const CALYPSO_SERVICE_KEY = 'calypso';

/** upsertVersionEntry가 받는, 서비스 종류를 가리지 않는 정규화된 입력(설계서 07장 §4.1). */
export interface NormalizedVersionInput {
  versionLabel: string;
  isPublished: boolean;
  giverKnoxId: string | null;
  giverDept: string | null;
  /** OA Service 전용 */
  viewUrl: string | null;
  /** HPC Service 전용 (vwp path) */
  hpcPath: string | null;
  /** release note/update note — 모든 서비스가 갖고 있는 건 아니라 nullable이다. */
  note: string | null;
  observedAt: Date;
}

/**
 * A/B/C(OA Service/File Artifacts/HPC Service) 공통 버전 캐시 — push 이벤트 수신(hub-events)과
 * 매핑 시 즉시 pull(§4.3), 야간 재동기화(§6)가 전부 이 서비스의 upsertVersionEntry() 하나를
 * 공유한다(설계서 07장).
 */
@Injectable()
export class HubSyncService {
  private readonly logger = new Logger(HubSyncService.name);

  constructor(
    @InjectModel(Artifact.name) private readonly artifacts: Model<ArtifactDocument>,
    private readonly hub: HubService,
    private readonly observer: ObserverClientService,
    private readonly calypso: CalypsoClientService,
  ) {}

  /**
   * 단일 진실 통로 — `versionLabel` 기준으로 upsert한다(사실상의 불변 참조, 07장 §4.1).
   * 갱신 뒤 `observedAt` 내림차순으로 재정렬해 index 0 = 최신 불변식을 유지한다
   * (event가 순서 없이 도착해도 안전하다). **여기서 `.save()`는 하지 않는다** — 호출부가
   * 트랜잭션 경계를 정한다.
   *
   * ★ 기존 엔트리를 갱신할 때는 그 `_id`를 반드시 그대로 물려받는다 — Comment가 versionId로
   *   이 값을 참조하므로(ArtifactsService.replaceVersions와 동일한 이유), 새 `_id`로
   *   바뀌면 이미 달린 댓글이 조용히 고아가 된다.
   */
  upsertVersionEntry(artifact: ArtifactDocument, tier: Tier, input: NormalizedVersionInput): void {
    const versions = artifact.versions ?? [];
    const idx = versions.findIndex((v) => v.versionLabel === input.versionLabel);
    // pull(mapping-time·야간 재동기화)은 note를 모른다 — null로 덮어써서 push 이벤트가
    // 이미 채워둔 note를 지우지 않게, 안 준 경우엔 기존 값을 그대로 이어받는다.
    const note = input.note ?? versions[idx]?.note ?? '';
    const entry = {
      _id: idx >= 0 ? versions[idx]._id : new Types.ObjectId(),
      tier,
      versionLabel: input.versionLabel,
      isPublished: input.isPublished,
      versionRef: null,
      giverKnoxId: input.giverKnoxId,
      giverDept: input.giverDept,
      sourceRefs: [],
      viewUrl: input.viewUrl,
      hpcPath: input.hpcPath,
      note,
      assertedBy: null,
      assertedAt: null,
      observedAt: input.observedAt,
      // html-view는 캐시하지 않는다 — 열람 시점에 라이브로 확인한다(07장 §4.1).
      hasHtmlView: false,
      publishedAt: input.isPublished ? input.observedAt : null,
      createdAt: idx >= 0 ? versions[idx].createdAt : new Date(),
    } as ArtifactVersion;

    if (idx >= 0) versions[idx] = entry;
    else versions.push(entry);
    versions.sort((a, b) => (b.observedAt?.getTime() ?? 0) - (a.observedAt?.getTime() ?? 0));
    artifact.versions = versions;
    artifact.tier = tier;
  }

  /**
   * 매핑(신규/재매핑) 직후 한 번, 그 artifact의 전체 버전 이력을 라이브로 pull해 upsert한다
   * (설계서 07장 §4.3, 04장 §6.3). A/B/C 공통 — 호출부(ArtifactSourceService)가 매핑 확정
   * 직후 호출하고 저장까지 책임진다.
   */
  async pullFullHistory(artifact: ArtifactDocument, knoxId: string, isAdmin: boolean): Promise<void> {
    const { serviceKey, externalArtifactId } = artifact;
    if (!serviceKey || !externalArtifactId) return;

    try {
      if (serviceKey === CALYPSO_SERVICE_KEY) {
        const list = await this.calypso.versions(externalArtifactId, knoxId);
        for (const v of list) {
          this.upsertVersionEntry(artifact, 'B', {
            versionLabel: v.versionLabel,
            isPublished: v.isReleased,
            giverKnoxId: v.giverKnoxId,
            giverDept: null,
            viewUrl: v.viewUrl,
            hpcPath: null,
            // pull 계약엔 note가 없다 — upsertVersionEntry가 기존 값을 그대로 이어받는다.
            note: null,
            observedAt: new Date(),
          });
        }
        return;
      }

      const svc = await this.hub.findByKeyOrThrow(serviceKey);
      const records = await this.observer.versions(svc, externalArtifactId, knoxId, isAdmin);
      const tier = svc.defaultTier as Tier;
      for (const r of records) {
        this.upsertVersionEntry(artifact, tier, {
          versionLabel: r.versionLabel,
          isPublished: r.isReleased,
          giverKnoxId: r.giverKnoxId,
          giverDept: r.giverDept,
          // HPC Service(C)는 실 파일이 아니라 경로만 온다 — pull 계약(observer-contract-v1.yaml,
          // 관측 전용)엔 아직 path 전용 필드가 없어 viewUrl 자리를 그대로 path로 쓴다. push
          // 이벤트(07장 §4.1)에는 이미 path가 별도 필드로 있다 — pull 쪽도 필요해지면 계약을
          // 넓힌다.
          viewUrl: tier === 'C' ? null : r.viewUrl,
          hpcPath: tier === 'C' ? r.viewUrl : null,
          // pull 계약엔 note가 없다 — upsertVersionEntry가 기존 값을 그대로 이어받는다.
          note: null,
          observedAt: r.observedAt ? new Date(r.observedAt) : new Date(),
        });
      }
    } catch (e) {
      this.logger.warn(`pullFullHistory failed for ${serviceKey}/${externalArtifactId} — ${(e as Error).message}`);
    }
  }

  /**
   * 야간 전체 재동기화(설계서 07장 §6, README §4 T9) — event 유실에 대비한 안전망이다.
   *
   * ★★★ 이 메서드는 구현만 됐고 지금은 **아무 데서도 호출하지 않는다.** sync 주기(시각·
   * 윈도우·재시도 정책)가 아직 정해지지 않았기 때문이다(README §4 T9) — 정책이 정해지면
   * 여기에 `@Cron(...)` 또는 트리거만 붙이면 바로 동작한다. HubModule에도 이 메서드를
   * 자동으로 부르는 provider(스케줄러 등)를 등록하지 않았다.
   */
  async resyncAll(): Promise<{ scanned: number; failed: number }> {
    const artifacts = await this.artifacts
      .find({ serviceKey: { $ne: null }, externalArtifactId: { $ne: null } })
      .exec();
    let failed = 0;
    for (const artifact of artifacts) {
      const before = failed;
      // eslint-disable-next-line no-await-in-loop
      await this.pullFullHistory(artifact, 'system', true).catch((e) => {
        failed += 1;
        this.logger.warn(`resyncAll: pull failed for artifact ${artifact._id.toString()} — ${(e as Error).message}`);
      });
      if (failed === before) {
        // eslint-disable-next-line no-await-in-loop
        await artifact.save();
      }
    }
    this.logger.log(`resyncAll: scanned ${artifacts.length}, failed ${failed}`);
    return { scanned: artifacts.length, failed };
  }
}
