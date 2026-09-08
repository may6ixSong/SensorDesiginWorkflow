import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HldRelease, HldReleaseDocument } from './schemas/hld-release.schema';
import { Deliverable, DeliverableDocument } from '../deliverables/schemas/deliverable.schema';
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { Actor } from '../common/actor';
import { AuditService } from '../audit/audit.service';
import { EdgesService } from '../edges/edges.service';
import { MemosService } from '../memos/memos.service';
import { HubService } from '../hub/hub.service';
import { ObserverClientService } from '../hub/observer-client.service';
import { CalypsoClientService } from '../hub/calypso-client.service';

@Injectable()
export class HldService {
  constructor(
    @InjectModel(HldRelease.name) private readonly hldModel: Model<HldReleaseDocument>,
    @InjectModel(Deliverable.name) private readonly deliverableModel: Model<DeliverableDocument>,
    private readonly audit: AuditService,
    private readonly edges: EdgesService,
    private readonly memos: MemosService,
    private readonly hub: HubService,
    private readonly observer: ObserverClientService,
    private readonly calypso: CalypsoClientService,
  ) {}

  listForWorkflow(workflowId: string) {
    return this.hldModel.find({ workflowId }).sort({ createdAt: -1 }).exec();
  }

  /**
   * 이 산출물의 "지금 이 순간 Released 버전"을 얼린다(설계서 §19.4).
   *
   * 상시 동기화가 없어졌으므로(§19.4) 연동된 서비스가 있으면 이 시점에 직접 물어보고
   * (Calypso는 전용 클라이언트, 그 외는 Observer 어댑터), 연동이 없으면(수동 C/D 기록)
   * SIREN 로컬 versions에서 찾는다. 물어보는 knoxId는 항상 릴리스를 누른 본인
   * (actor.knoxId)이다 - Release는 관리자/오너의 공식 행위이지 개인화된 조회가 아니라서
   * "그 순간 그 사람이 볼 수 있던 released 버전"이 곧 이 workflow의 공식 기록이 된다.
   */
  private async resolveReleasedItem(d: DeliverableDocument, actor: Actor, pinnedAt: Date): Promise<Record<string, unknown> | null> {
    if (d.serviceKey === 'calypso' && d.externalArtifactId) {
      const v = await this.calypso.currentVersion(d.externalArtifactId, actor.knoxId);
      if (!v || !v.isReleased) return null;
      return {
        version: v.versionLabel,
        versionLabel: v.versionLabel,
        versionRef: null,
        tier: 'A',
        confidence: 'verified',
        pinnedAt,
        file: v.viewUrl,
        at: pinnedAt.toISOString(),
        comment: '',
        giverKnoxId: v.giverKnoxId,
        viewUrl: v.viewUrl,
        sourceRefs: [],
      };
    }

    if (d.serviceKey && d.externalArtifactId) {
      const svc = await this.hub.findByKeyOrThrow(d.serviceKey);
      const v = await this.observer.currentVersion(svc, d.externalArtifactId, actor.knoxId);
      if (!v || !v.isReleased) return null;
      return {
        version: v.versionLabel,
        versionLabel: v.versionLabel,
        versionRef: null,
        tier: 'A',
        confidence: 'verified',
        pinnedAt,
        file: v.viewUrl,
        at: v.observedAt ?? pinnedAt.toISOString(),
        comment: '',
        giverKnoxId: v.giverKnoxId,
        viewUrl: v.viewUrl,
        sourceRefs: (v.sourceRefs ?? []).map((s) => ({
          artifactKey: s.artifactKey ?? '',
          serviceKey: s.serviceKey,
          versionRef: s.versionRef ?? '',
          versionLabel: s.versionLabel ?? '',
          capturedAt: s.capturedAt ? new Date(s.capturedAt) : null,
        })),
      };
    }

    // 연동이 없는(수동 C/D 기록) 산출물 - SIREN 로컬 기록에서 찾는다(기존 동작 그대로).
    const released = d.versions.find((v) => v.isReleased === true);
    if (!released) return null;
    return {
      version: released.versionLabel,
      versionRef: released.versionRef ?? null,
      versionLabel: released.versionLabel,
      tier: released.tier,
      confidence: released.tier === 'A' || released.tier === 'B' ? 'verified' : 'asserted',
      pinnedAt,
      file: released.hpcPath ?? released.viewUrl ?? null,
      at: released.createdAt.toISOString(),
      comment: released.note ?? '',
      giverKnoxId: released.giverKnoxId ?? null,
      viewUrl: released.viewUrl ?? null,
      sourceRefs: released.sourceRefs ?? [],
    };
  }

  /**
   * workflow 전체를 하나의 자기완결 스냅샷으로 얼린다(설계서 §19.4) - 캔버스 구조
   * (배치·연결·메모·일정)와 그 시점 Released 버전을 같은 문서 안에 함께 저장한다.
   * View 권한은 이 문서 하나만으로 "그 시점의 캔버스"를 다시 그릴 수 있어야 하고,
   * 지금의 라이브 캔버스와 절대 섞어 쓰지 않는다 - flow 연결이 그 뒤로 바뀌었을 수
   * 있기 때문이다(실측 확인된 문제: 오늘의 구조 + 과거의 버전을 조인하면 그 시점에
   * 존재하지 않았던/이미 없어진 연결이 마치 있었던 것처럼 보인다).
   */
  async createRelease(workflow: WorkflowDocument, note: string | undefined, actor: Actor) {
    const [deliverables, edgeDocs, memoDocs] = await Promise.all([
      this.deliverableModel.find({ workflowId: workflow._id }).exec(),
      this.edges.listForWorkflow(workflow._id.toString()),
      this.memos.listForWorkflow(workflow._id.toString()),
    ]);

    const pinnedAt = new Date();
    const items: Record<string, unknown> = {};
    for (const d of deliverables) {
      // eslint-disable-next-line no-await-in-loop
      const item = await this.resolveReleasedItem(d, actor, pinnedAt);
      if (item) items[d._id.toString()] = item;
    }

    const canvas = {
      deliverables: deliverables.map((d) => ({
        id: d._id.toString(),
        name: d.name,
        phaseId: d.phaseId,
        layout: { x: d.layout.x, y: d.layout.y, w: d.layout.w, h: d.layout.h },
        serviceKey: d.serviceKey ?? null,
        externalArtifactId: d.externalArtifactId ?? null,
        artifactTypeKey: d.artifactTypeKey ?? null,
        intent: d.intent ?? 'own',
        recvDept: d.recvDept ?? null,
        series: d.series ? d.series.toString() : null,
        seriesIdx: d.seriesIdx,
        seriesTotal: d.seriesTotal,
      })),
      edges: edgeDocs.map((e) => ({
        fromId: e.fromId.toString(),
        toId: e.toId.toString(),
        bidirectional: e.bidirectional,
      })),
      memos: memoDocs.map((m) => ({
        id: m._id.toString(),
        phaseId: m.phaseId,
        text: m.text,
        layout: { x: m.layout.x, y: m.layout.y, w: m.layout.w, h: m.layout.h },
      })),
      phases: (workflow.phases ?? []).map((p) => ({ id: p.id, name: p.name, start: p.start, end: p.end })),
    };

    const prevCount = await this.hldModel.countDocuments({ workflowId: workflow._id }).exec();
    const version = `${prevCount + 1}.0`;

    const hld = await this.hldModel.create({
      workflowId: workflow._id,
      version,
      date: new Date().toISOString().slice(0, 10),
      releasedBy: actor.knoxId,
      note: note ?? '',
      canvas,
      items,
      isMock: workflow.isMock,
    });

    await this.audit.log(actor.knoxId, 'HLD_RELEASE', 'workflow', workflow._id, { version });
    return hld;
  }
}
