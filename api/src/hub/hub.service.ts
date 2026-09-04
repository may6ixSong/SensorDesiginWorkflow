import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { ArtifactService, ArtifactServiceDocument, Tier, Transport } from './schemas/artifact-service.schema';
import { Actor, assertAdmin } from '../common/actor';
import { AuditService } from '../audit/audit.service';
import { RegisterServiceDto, UpdateServiceDto } from './dto/artifact-service.dto';

/**
 * Hub 레지스트리 (Hub 설계서 §3.2).
 *
 * 등록·수정은 Admin 전용이다(§13.4) - 판정 기준은 ADSSO User.Group이며, 그 값은 항상
 * 실제 호출자(realKnoxId) 기준으로 본다. 사용자 시뮬레이션 중이어도 시뮬레이션 대상의
 * 권한으로 레지스트리를 고칠 수는 없다.
 */
@Injectable()
export class HubService {
  constructor(
    @InjectModel(ArtifactService.name) private readonly model: Model<ArtifactServiceDocument>,
    private readonly audit: AuditService,
  ) {}

  /** 산출물 출처를 고를 때 쓰는 목록. 기본은 켜져 있는 것만. */
  list(includeDisabled = false) {
    const filter = includeDisabled ? {} : { enabled: true };
    return this.model.find(filter).sort({ isBuiltIn: -1, name: 1 }).exec();
  }

  async findByKeyOrThrow(key: string) {
    const svc = await this.model.findOne({ key }).exec();
    if (!svc) throw new NotFoundException(`Unknown artifact service: ${key}`);
    return svc;
  }

  private slugify(name: string): string {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'service';
  }

  /**
   * `{8자리 랜덤}_{name 슬러그}` 형태로 key를 직접 만든다 (사용자 요청) - Admin이
   * key를 신경 쓸 필요가 없게 한다. 랜덤 8자리(32bit)면 충돌 가능성은 무시할
   * 수준이지만, 그래도 몇 번 재시도해 확실히 유일한 값을 보장한다.
   */
  private async generateKey(name: string): Promise<string> {
    const slug = this.slugify(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const unique = randomUUID().replace(/-/g, '').slice(0, 8);
      const key = `${unique}_${slug}`;
      // eslint-disable-next-line no-await-in-loop
      if (!(await this.model.findOne({ key }).exec())) return key;
    }
    throw new BadRequestException('Could not generate a unique service key. Try again.');
  }

  /**
   * A(Live) 티어가 아니면 실연동이 없다는 뜻이므로, transport/baseUrl/viewUrlTemplate을
   * 서버가 무조건 비운다 - FE가 이미 폼에서 이 규칙대로 잠가두지만(ServiceManagePage.tsx),
   * API를 직접 두드리는 경로에도 같은 불변식을 강제한다.
   */
  private applyTierInvariant(
    tier: Tier,
    input: { transport?: Transport; baseUrl?: string | null; viewUrlTemplate?: string | null },
  ): { transport: Transport; baseUrl: string | null; viewUrlTemplate: string | null } {
    if (tier !== 'A') {
      return { transport: 'none', baseUrl: null, viewUrlTemplate: null };
    }
    return {
      transport: input.transport ?? 'http',
      baseUrl: input.baseUrl?.trim() || null,
      viewUrlTemplate: input.viewUrlTemplate?.trim() || null,
    };
  }

  async register(dto: RegisterServiceDto, actor: Actor) {
    assertAdmin(actor);
    const key = await this.generateKey(dto.name);
    const tier: Tier = dto.defaultTier ?? 'C';
    const { transport, baseUrl, viewUrlTemplate } = this.applyTierInvariant(tier, dto);
    const svc = await this.model.create({
      key,
      name: dto.name.trim(),
      description: dto.description?.trim() || '',
      icon: dto.icon?.trim() || '',
      contractVersion: dto.contractVersion?.trim() || '1.0',
      defaultTier: tier,
      transport,
      baseUrl,
      viewUrlTemplate,
      embedUploadUrlTemplate: dto.embedUploadUrlTemplate?.trim() || null,
      isBuiltIn: false,
      // 등록만 하고 못 쓰게 잠가두는 별도 활성화 단계는 두지 않는다(사용자 요청) -
      // 등록 즉시 워크플로우의 출처 선택지에 뜬다.
      enabled: true,
      isMock: false,
    });
    await this.audit.log(actor.realKnoxId, 'ARTIFACT_SERVICE_REGISTER', 'artifactService', svc._id, {
      key: svc.key,
      transport: svc.transport,
    });
    return svc;
  }

  /**
   * key는 생성 후 바꿀 수 없다 (§3.2) - 산출물이 그 값으로 서비스를 참조하므로,
   * 이름이 바뀌어도 key는 유지한다. DTO에 아예 없으므로 여기서 막을 것도 없다.
   */
  async update(key: string, dto: UpdateServiceDto, actor: Actor) {
    assertAdmin(actor);
    const svc = await this.findByKeyOrThrow(key);
    if (dto.name !== undefined) svc.name = dto.name.trim();
    if (dto.description !== undefined) svc.description = dto.description.trim();
    if (dto.icon !== undefined) svc.icon = dto.icon.trim();
    if (dto.contractVersion !== undefined) svc.contractVersion = dto.contractVersion.trim();
    if (dto.defaultTier !== undefined) svc.defaultTier = dto.defaultTier;

    const { transport, baseUrl, viewUrlTemplate } = this.applyTierInvariant(svc.defaultTier, {
      transport: dto.transport ?? svc.transport,
      baseUrl: dto.baseUrl !== undefined ? dto.baseUrl : svc.baseUrl,
      viewUrlTemplate: dto.viewUrlTemplate !== undefined ? dto.viewUrlTemplate : svc.viewUrlTemplate,
    });
    svc.transport = transport;
    svc.baseUrl = baseUrl;
    svc.viewUrlTemplate = viewUrlTemplate;

    if (dto.embedUploadUrlTemplate !== undefined) {
      svc.embedUploadUrlTemplate = dto.embedUploadUrlTemplate.trim() || null;
    }
    if (dto.enabled !== undefined) svc.enabled = dto.enabled;
    await svc.save();

    await this.audit.log(actor.realKnoxId, 'ARTIFACT_SERVICE_UPDATE', 'artifactService', svc._id, {
      key: svc.key,
      enabled: svc.enabled,
    });
    return svc;
  }

  /** `https://ssm.local/spec/{artifactId}` 같은 템플릿을 실제 링크로 바꾼다. */
  resolveViewUrl(svc: ArtifactServiceDocument, externalArtifactId: string | null): string | null {
    if (!svc.viewUrlTemplate || !externalArtifactId) return null;
    return svc.viewUrlTemplate.replace('{artifactId}', encodeURIComponent(externalArtifactId));
  }

  /** null이면 SIREN은 링크-아웃으로 폴백한다 - 임베드 미지원은 정상 상태다 (§3.2). */
  resolveEmbedUploadUrl(svc: ArtifactServiceDocument, externalArtifactId: string | null): string | null {
    if (!svc.embedUploadUrlTemplate || !externalArtifactId) return null;
    return svc.embedUploadUrlTemplate.replace('{artifactId}', encodeURIComponent(externalArtifactId));
  }
}
