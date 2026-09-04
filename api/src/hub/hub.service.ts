import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ArtifactService, ArtifactServiceDocument } from './schemas/artifact-service.schema';
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

  async register(dto: RegisterServiceDto, actor: Actor) {
    assertAdmin(actor);
    const key = dto.key.trim();
    if (await this.model.findOne({ key }).exec()) {
      throw new BadRequestException(`Service key "${key}" is already registered.`);
    }
    const svc = await this.model.create({
      key,
      name: dto.name.trim(),
      description: dto.description?.trim() || '',
      icon: dto.icon?.trim() || '',
      contractVersion: dto.contractVersion?.trim() || '1.0',
      defaultTier: dto.defaultTier ?? 'C',
      transport: dto.transport ?? 'none',
      baseUrl: dto.baseUrl?.trim() || null,
      viewUrlTemplate: dto.viewUrlTemplate?.trim() || null,
      embedUploadUrlTemplate: dto.embedUploadUrlTemplate?.trim() || null,
      isBuiltIn: false,
      enabled: dto.enabled ?? true,
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
    if (dto.transport !== undefined) svc.transport = dto.transport;
    if (dto.baseUrl !== undefined) svc.baseUrl = dto.baseUrl.trim() || null;
    if (dto.viewUrlTemplate !== undefined) svc.viewUrlTemplate = dto.viewUrlTemplate.trim() || null;
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
