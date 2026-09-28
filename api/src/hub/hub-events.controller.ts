import { BadRequestException, Controller, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Artifact, ArtifactDocument } from '../artifacts/schemas/artifact.schema';
import { HubSyncService } from './hub-sync.service';
import { HubEventSender, HubTokenGuard } from './guards/hub-token.guard';
import { AutoRunStatusEventDto, VersionPublishedEventDto } from './dto/version-event.dto';
import { AutoRunService } from '../auto-run/auto-run.service';

/**
 * 각 산출물 서비스가 SIREN에 version 발행을 알리는 인바운드 경로(설계서 07장 §4).
 * `HubTokenGuard`가 Bearer token으로 호출자를 확인해 `req.hubEventSender_`에 담아준다 —
 * 여기서는 그 sender 기준으로 artifact를 찾아 upsert만 한다.
 */
@Controller('hub/events')
@UseGuards(HubTokenGuard)
export class HubEventsController {
  private readonly logger = new Logger(HubEventsController.name);

  constructor(
    @InjectModel(Artifact.name) private readonly artifacts: Model<ArtifactDocument>,
    private readonly hubSync: HubSyncService,
    private readonly autoRun: AutoRunService,
  ) {}

  /**
   * ★ 이 라우트만 `forbidNonWhitelisted:true`로 검증한다 — DTO 모양을 조금이라도
   *   벗어나면(필수 필드 누락·타입 불일치·정의 안 된 필드 포함) 400으로 요청 전체를
   *   거부한다. 일부만 기록하는 부분 반영은 하지 않는다(설계서 07장 §4.1).
   *
   * ★ `@Body()` 데코레이터 대신 `req.body`를 직접 검증한다 — 전역 파이프(main.ts,
   *   `whitelist:true, forbidNonWhitelisted:false`)가 `@Body()` 값에 먼저 적용되면서
   *   정의 안 된 필드를 조용히 지워버리면, 그 뒤에 걸리는 이 라우트만의 엄격한 검증은
   *   이미 지워진 값을 보게 되어 절대 걸리지 않는다(파이프는 순서대로 값을 넘겨받아
   *   체이닝된다) — 원본 body를 직접 검증해야 "정의 안 된 필드 포함 시 거부"가 실제로
   *   동작한다.
   */
  @Post('version-published')
  async versionPublished(
    @Req() req: { body: unknown; hubEventSender_: HubEventSender },
  ): Promise<{ recorded: boolean }> {
    const dto = plainToInstance(VersionPublishedEventDto, req.body);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) {
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      throw new BadRequestException(messages.length > 0 ? messages : 'Validation failed.');
    }

    const sender = req.hubEventSender_;

    if (sender.artifactTypeKeys.length > 0 && !sender.artifactTypeKeys.includes(dto.artifactTypeKey)) {
      throw new BadRequestException(`Unknown artifactTypeKey "${dto.artifactTypeKey}" for this service.`);
    }

    // (serviceKey, externalArtifactId)로 기존 Artifact를 찾는다 — 없으면 그냥 버린다.
    // 아직 아무 workflow도 이 산출물을 매핑한 적 없다는 뜻이므로 미리 쌓아둘 이유가 없다 —
    // 나중에 실제로 매핑되는 순간 전체 이력을 한 번에 pull한다(설계서 07장 §4.2, §4.3).
    const artifact = await this.artifacts
      .findOne({ serviceKey: sender.serviceKey, externalArtifactId: dto.externalArtifactId })
      .exec();
    if (!artifact) {
      // 200으로 응답하되(그 산출물이 아직 아무 workflow에도 매핑되지 않았을 뿐인 정상
      // 케이스와, 발신기의 (serviceKey, externalArtifactId)가 실제로 어긋난 버그 케이스를
      // 겉으로는 구분할 수 없다) 최소한 로그에는 남긴다 — 발신기를 새로 붙였을 때(문제 1)
      // 조회 키가 어긋나면 그동안 아무 에러 없이 이벤트가 계속 유실될 수 있다(문제 8).
      this.logger.warn(
        `version-published event dropped — no artifact mapped for ${sender.serviceKey}/${dto.externalArtifactId}`,
      );
      return { recorded: false };
    }

    // ★ artifact.name은 안 건드린다 — SIREN 쪽에서 생성 시 admin/사용자가 정한 이름을
    //   그대로 유지한다(node.name과 같은 이유, 사용자 지적). 예전에는 이 이벤트의
    //   artifactName으로 매번 덮어썼는데, 그러면 그 admin이 정한 이름이 첫 이벤트가
    //   오는 순간 영구히 그 서비스가 부르는 이름으로 바뀌어버려 의미가 없었다.
    this.hubSync.upsertVersionEntry(artifact, sender.tier, {
      versionLabel: dto.versionLabel,
      isPublished: dto.isPublished,
      versionRef: dto.versionRef ?? null,
      giverKnoxId: dto.updatedUserId,
      giverDept: null,
      viewUrl: dto.viewUrl ?? null,
      hpcPath: dto.path ?? null,
      note: dto.note ?? null,
      observedAt: new Date(dto.updatedAt),
    });

    // 종류 없이 매핑된 artifact(예전 데이터·종류를 모르는 후보)는 이벤트가 알려준 종류로
    // 채운다 — Auto Run 지원 판정이 종류 단위다(설계서 10장 §2).
    if (!artifact.artifactTypeKey && sender.artifactTypeKeys.includes(dto.artifactTypeKey)) {
      artifact.artifactTypeKey = dto.artifactTypeKey;
    }

    // Auto Run 발화 평가(설계서 10장 §4.1) — published 버전을 push로 **처음** 본 순간에만
    // 한 번 평가한다. pull 경로(매핑 시·Calypso 프록시·야간 재동기화)는 평가하지 않지만,
    // pull이 먼저 캐시를 채웠어도 이 표시가 비어 있으니 push가 도착하면 그때 평가된다.
    const entry = (artifact.versions ?? []).find((v) => v.versionLabel === dto.versionLabel);
    const evaluateAutoRun = !!entry && entry.isPublished && !entry.autoRunEvaluatedAt;
    if (evaluateAutoRun && entry) {
      entry.autoRunEvaluatedAt = new Date();
      artifact.markModified('versions');
    }
    await artifact.save();

    if (dto.triggerRunId) {
      await this.autoRun.linkResultVersion(sender.serviceKey, dto.triggerRunId, dto.versionLabel);
    }
    if (evaluateAutoRun) {
      // 응답을 기다리게 하지 않는다 — 발신 서비스의 publish 동작과 무관한 SIREN 내부 일이다.
      void this.autoRun.onSourcePublished(artifact._id, dto.versionLabel);
    }
    return { recorded: true };
  }

  /**
   * Auto Run trigger를 받은 서비스의 진행 상태 콜백(설계서 08장 §2.3, 10장 §6.3).
   * 같은 Bearer token으로 인증하고, 그 run을 받은 서비스만 갱신할 수 있다. 엄격 검증 규칙은
   * version 이벤트와 같다(정의 안 된 필드가 섞이면 400).
   */
  @Post('auto-run-status')
  async autoRunStatus(
    @Req() req: { body: unknown; hubEventSender_: HubEventSender },
  ): Promise<{ recorded: boolean }> {
    const dto = plainToInstance(AutoRunStatusEventDto, req.body);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) {
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      throw new BadRequestException(messages.length > 0 ? messages : 'Validation failed.');
    }
    return this.autoRun.recordStatus(req.hubEventSender_.serviceKey, dto);
  }
}
