import { BadRequestException, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Artifact, ArtifactDocument } from '../artifacts/schemas/artifact.schema';
import { HubSyncService } from './hub-sync.service';
import { HubEventSender, HubTokenGuard } from './guards/hub-token.guard';
import { VersionPublishedEventDto } from './dto/version-event.dto';

/**
 * 각 산출물 서비스가 SIREN에 version 발행을 알리는 인바운드 경로(설계서 07장 §4).
 * `HubTokenGuard`가 Bearer token으로 호출자를 확인해 `req.hubEventSender_`에 담아준다 —
 * 여기서는 그 sender 기준으로 artifact를 찾아 upsert만 한다.
 */
@Controller('hub/events')
@UseGuards(HubTokenGuard)
export class HubEventsController {
  constructor(
    @InjectModel(Artifact.name) private readonly artifacts: Model<ArtifactDocument>,
    private readonly hubSync: HubSyncService,
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
    if (!artifact) return { recorded: false };

    artifact.name = dto.artifactName.trim();
    this.hubSync.upsertVersionEntry(artifact, sender.tier, {
      versionLabel: dto.versionLabel,
      isPublished: dto.isPublished,
      giverKnoxId: dto.updatedUserId,
      giverDept: null,
      viewUrl: dto.viewUrl ?? null,
      hpcPath: dto.path ?? null,
      note: dto.note ?? null,
      observedAt: new Date(dto.updatedAt),
    });
    await artifact.save();
    return { recorded: true };
  }
}
