import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes, randomUUID } from 'crypto';
import { ArtifactService, ArtifactServiceDocument, ArtifactType } from './schemas/artifact-service.schema';
import { Actor, assertAdmin } from '../common/actor';
import { AuditService } from '../audit/audit.service';
import { RegisterArtifactTypeDto, UpdateServiceDto } from './dto/artifact-service.dto';

/**
 * Hub 레지스트리 (설계서 07장 §3).
 *
 * 등록·수정은 Admin 전용이다(§13.4) - 판정 기준은 ADSSO User.Group이며, 그 값은 항상
 * 실제 호출자(realKnoxId) 기준으로 본다. 사용자 시뮬레이션 중이어도 시뮬레이션 대상의
 * 권한으로 레지스트리를 고칠 수는 없다.
 *
 * ★ 등록 UX가 바뀌었다 — Service Manage는 이제 OA Service/HPC Service 두 공간으로 나뉘고,
 *   한 번의 등록 호출은 **artifact 종류 하나**를 추가한다(구 "서비스 하나 만들고 그 안에
 *   artifact type을 추가"하던 방식 폐지). 같은 baseURL로 다시 등록하면 새 서비스를 만들지
 *   않고 기존 서비스에 종류만 추가하며, **토큰은 baseURL당 1개**를 그대로 재사용한다(§3.3).
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

  /** 인바운드 version 이벤트의 Bearer token으로 서비스를 찾는다(설계서 07장 §3.4, §4.2). */
  async findByTokenOrThrow(token: string) {
    const svc = await this.model.findOne({ token }).exec();
    if (!svc) throw new NotFoundException('Unknown or revoked token.');
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
   * `artifactTypeKey`도 같은 방식으로 SIREN이 발급한다(설계서 07장 §3.2) — 그 서비스가
   * event에 실어 보내는 값이라, key가 전역에서(다른 서비스의 artifactTypes까지 포함해)
   * 유일해야 event 수신 시 애매함이 없다.
   */
  private async generateArtifactTypeKey(name: string): Promise<string> {
    const slug = this.slugify(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const unique = randomUUID().replace(/-/g, '').slice(0, 8);
      const key = `${unique}_${slug}`;
      // eslint-disable-next-line no-await-in-loop
      if (!(await this.model.findOne({ 'artifactTypes.key': key }).exec())) return key;
    }
    throw new BadRequestException('Could not generate a unique artifact type key. Try again.');
  }

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /** scheme+host, 끝 슬래시 제거 — 토큰 dedup 키로 쓰기 위한 정규화(설계서 07장 §3.3). */
  private normalizeBaseUrl(raw: string): string {
    const trimmed = raw.trim();
    try {
      const u = new URL(trimmed);
      return `${u.protocol}//${u.host}${u.pathname}`.replace(/\/+$/, '');
    } catch {
      return trimmed.replace(/\/+$/, '');
    }
  }

  /**
   * 등록 — OA Service/HPC Service 화면 공통(§3). 이미 등록된 baseURL이면 **기존 서비스에
   * artifact 종류만 추가**하고 기존 Service명·토큰을 그대로 쓴다. 처음 보는 baseURL이면
   * 새 서비스 + 새 토큰을 만든다.
   */
  async registerArtifactType(
    dto: RegisterArtifactTypeDto,
    actor: Actor,
  ): Promise<{ service: ArtifactServiceDocument; artifactTypeKey: string; reusedExisting: boolean }> {
    assertAdmin(actor);
    const baseUrl = this.normalizeBaseUrl(dto.baseUrl);
    const artifactTypeKey = await this.generateArtifactTypeKey(dto.artifactName);
    const newType: ArtifactType = {
      key: artifactTypeKey,
      name: dto.artifactName.trim(),
      description: dto.description?.trim() || '',
    };

    const existing = await this.model.findOne({ baseUrl }).exec();
    if (existing) {
      existing.artifactTypes.push(newType);
      await existing.save();
      await this.audit.log(actor.realKnoxId, 'ARTIFACT_SERVICE_ADD_TYPE', 'artifactService', existing._id, {
        key: existing.key,
        artifactTypeKey,
      });
      return { service: existing, artifactTypeKey, reusedExisting: true };
    }

    const key = await this.generateKey(dto.name);
    const svc = await this.model.create({
      key,
      name: dto.name.trim(),
      description: dto.description?.trim() || '',
      icon: dto.icon?.trim() || '',
      defaultTier: dto.tier,
      transport: 'http',
      baseUrl,
      token: this.generateToken(),
      isBuiltIn: false,
      // 등록만 하고 못 쓰게 잠가두는 별도 활성화 단계는 두지 않는다(사용자 요청) -
      // 등록 즉시 워크플로우의 출처 선택지에 뜬다.
      enabled: true,
      isMock: false,
      artifactTypes: [newType],
    });
    await this.audit.log(actor.realKnoxId, 'ARTIFACT_SERVICE_REGISTER', 'artifactService', svc._id, {
      key: svc.key,
      tier: svc.defaultTier,
    });
    return { service: svc, artifactTypeKey, reusedExisting: false };
  }

  /**
   * key는 생성 후 바꿀 수 없다 - 산출물이 그 값으로 서비스를 참조하므로, 이름이 바뀌어도
   * key는 유지한다. tier/transport/artifactTypes도 여기서 바꾸지 않는다 — tier는 등록
   * 시점에 고정, artifactTypes는 registerArtifactType() 재호출로만 늘어난다.
   */
  async update(key: string, dto: UpdateServiceDto, actor: Actor) {
    assertAdmin(actor);
    const svc = await this.findByKeyOrThrow(key);
    if (dto.name !== undefined) svc.name = dto.name.trim();
    if (dto.description !== undefined) svc.description = dto.description.trim();
    if (dto.icon !== undefined) svc.icon = dto.icon.trim();
    if (dto.baseUrl !== undefined) svc.baseUrl = this.normalizeBaseUrl(dto.baseUrl);

    if (dto.enabled !== undefined && dto.enabled !== svc.enabled) {
      if (dto.enabled === false) {
        // 비활성화 시 토큰을 즉시 폐기한다(설계서 07장 §3.4) — 재활성화하면 새로 발급한다.
        svc.token = null;
      } else if (!svc.token) {
        svc.token = this.generateToken();
      }
      svc.enabled = dto.enabled;
    }
    await svc.save();

    await this.audit.log(actor.realKnoxId, 'ARTIFACT_SERVICE_UPDATE', 'artifactService', svc._id, {
      key: svc.key,
      enabled: svc.enabled,
    });
    return svc;
  }

  /** `https://ssm.local/spec/{artifactId}` 같은 템플릿을 실제 링크로 바꾼다 — 레거시, 지금은 등록 폼에서 입력받지 않는다. */
  resolveViewUrl(svc: ArtifactServiceDocument, externalArtifactId: string | null): string | null {
    if (!svc.viewUrlTemplate || !externalArtifactId) return null;
    return svc.viewUrlTemplate.replace('{artifactId}', encodeURIComponent(externalArtifactId));
  }

  /** null이면 SIREN은 링크-아웃으로 폴백한다 - 임베드 미지원은 정상 상태다. 레거시, 등록 폼에서 입력받지 않는다. */
  resolveEmbedUploadUrl(svc: ArtifactServiceDocument, externalArtifactId: string | null): string | null {
    if (!svc.embedUploadUrlTemplate || !externalArtifactId) return null;
    return svc.embedUploadUrlTemplate.replace('{artifactId}', encodeURIComponent(externalArtifactId));
  }
}
