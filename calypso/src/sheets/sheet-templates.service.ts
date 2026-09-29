import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Actor } from '../common/actor';
import { StorageService } from '../storage/storage.service';
import { SheetTemplate, SheetTemplateDocument, SheetTemplateRevision } from './schemas/sheet-template.schema';
import { BUILTIN_SHEET_TEMPLATES } from './builtin-sheet-templates';
import { SheetSeed, parseSheetDocument, parseSheetSeed } from './sheet-format';

/** 편집기(sheet-host)에 넘길 시작 시트 — document가 있으면 그걸, 없으면 seed로 만든다. */
export interface SheetStart {
  document: Record<string, unknown> | null;
  seed: SheetSeed | null;
}

const EMPTY_SEED: SheetSeed = { sheets: [{ name: 'Sheet1', rows: [], merges: [], headerRowCount: 0 }] };

export function toTemplateDto(t: SheetTemplateDocument) {
  const current = (t.revisions ?? []).find((r) => r.revision === t.currentRevision) ?? null;
  return {
    key: t.key,
    name: t.name,
    description: t.description ?? '',
    currentRevision: t.currentRevision,
    revisions: [...(t.revisions ?? [])]
      .sort((a, b) => b.revision - a.revision)
      .map((r) => ({
        revision: r.revision,
        kind: r.documentKey ? 'document' : 'seed',
        note: r.note ?? '',
        createdBy: r.createdBy,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      })),
    updatedBy: t.updatedBy,
    updatedAt: current?.createdAt instanceof Date ? current.createdAt.toISOString() : null,
  };
}

@Injectable()
export class SheetTemplatesService implements OnModuleInit {
  private readonly logger = new Logger(SheetTemplatesService.name);

  constructor(
    @InjectModel(SheetTemplate.name) private readonly model: Model<SheetTemplateDocument>,
    private readonly storage: StorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedBuiltins();
  }

  /**
   * 기본 template이 없을 때만 만든다 — Admin이 고친 내용을 부팅마다 덮지 않는다. Admin이 **삭제한**
   * 기본 template도 다시 만들지 않는다(삭제 기록이 originalKey로 남아 있다).
   */
  async seedBuiltins(): Promise<void> {
    for (const def of BUILTIN_SHEET_TEMPLATES) {
      const exists = await this.model.findOne({ key: def.key }).exec();
      if (exists) continue;
      const deleted = await this.model.findOne({ originalKey: def.key }).exec();
      if (deleted) continue;
      await this.model.create({
        key: def.key,
        name: def.name,
        description: def.description,
        currentRevision: 1,
        revisions: [{
          revision: 1, seed: parseSheetSeed(def.seed), documentKey: null, note: 'Built-in', createdBy: 'system', createdAt: new Date(),
        }],
        createdBy: 'system',
        updatedBy: 'system',
        updatedAt: new Date(),
      });
      this.logger.log(`seeded built-in sheet template ${def.key}`);
    }
  }

  private assertAdmin(actor: Actor): void {
    if (!actor.isAdmin) throw new ForbiddenException('Only admins can change sheet templates.');
  }

  async list(): Promise<SheetTemplateDocument[]> {
    const all = await this.model.find({}).exec();
    return all.filter((t) => !t.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** 살아 있는 template만. 삭제된 것은 key가 바뀌어 여기서 찾히지 않는다. */
  async findOrThrow(key: string): Promise<SheetTemplateDocument> {
    const t = await this.model.findOne({ key }).exec();
    if (!t || t.deletedAt) throw new NotFoundException(`Sheet template "${key}" not found.`);
    return t;
  }

  private revisionOf(t: SheetTemplateDocument, revision?: number): SheetTemplateRevision {
    const want = revision ?? t.currentRevision;
    const rev = (t.revisions ?? []).find((r) => r.revision === want);
    if (!rev) throw new NotFoundException(`Sheet template "${t.key}" has no revision ${want}.`);
    return rev;
  }

  /** 새 artifact가 받을 시작 시트. revision을 생략하면 지금 개정본. */
  async start(key: string, revision?: number): Promise<SheetStart & { key: string; name: string; revision: number }> {
    const t = await this.findOrThrow(key);
    const rev = this.revisionOf(t, revision);
    return { key: t.key, name: t.name, revision: rev.revision, ...(await this.readRevision(rev)) };
  }

  private async readRevision(rev: SheetTemplateRevision): Promise<SheetStart> {
    if (rev.documentKey) {
      const body = await this.storage.download(rev.documentKey);
      if (!body) throw new NotFoundException('The stored template sheet could not be found.');
      return { document: parseSheetDocument(body), seed: null };
    }
    return { document: null, seed: rev.seed ?? EMPTY_SEED };
  }

  /** artifact를 만들 때 — 쓸 수 있는 template인지 보고, 그 순간의 template id와 개정본 번호를 돌려준다. */
  async pinForNewArtifact(key: string): Promise<{ templateId: string; revision: number }> {
    const t = await this.findOrThrow(key);
    return { templateId: t._id.toString(), revision: t.currentRevision };
  }

  /**
   * artifact의 첫 편집 시작 시트 — 삭제된 template이어도 고정된 개정본을 그대로 연다. templateId가
   * 없는 예전 artifact는 key로, 그 key가 이미 삭제됐으면 originalKey로 찾는다.
   */
  async startForArtifact(pin: { templateId: string | null; templateKey: string; revision: number }): Promise<SheetStart & { key: string; revision: number }> {
    let t: SheetTemplateDocument | null = null;
    if (pin.templateId) t = await this.model.findById(pin.templateId).exec();
    if (!t) t = await this.model.findOne({ key: pin.templateKey }).exec();
    if (!t) t = await this.model.findOne({ originalKey: pin.templateKey }).exec();
    if (!t) throw new NotFoundException(`Sheet template "${pin.templateKey}" not found.`);
    const rev = this.revisionOf(t, pin.revision);
    return { key: t.originalKey ?? t.key, revision: rev.revision, ...(await this.readRevision(rev)) };
  }

  /**
   * 삭제 — 목록·생성 화면에서 사라지고 되살릴 수 없다. 문서와 개정본은 남기고(첫 저장 전 artifact용)
   * key를 비워 같은 key로 새 template을 만들 수 있게 한다.
   */
  async remove(key: string, actor: Actor): Promise<void> {
    this.assertAdmin(actor);
    const t = await this.findOrThrow(key);
    t.originalKey = t.key;
    t.key = `deleted~${t._id.toString()}~${t.key}`;
    t.deletedAt = new Date();
    t.deletedBy = actor.knoxId;
    await t.save();
  }

  /**
   * 새 template. `fromKey`를 주면 그 template의 지금 개정본을 시작점으로 복사한다(스토리지 객체는
   * 개정본마다 불변이라 키를 그대로 공유해도 된다). 없으면 빈 시트 하나.
   */
  async create(input: { key: string; name: string; description?: string; fromKey?: string }, actor: Actor) {
    this.assertAdmin(actor);
    const key = input.key.trim();
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(key)) {
      throw new BadRequestException('Key must be 2-63 characters of lowercase letters, digits and dashes.');
    }
    if (await this.model.findOne({ key }).exec()) throw new ConflictException(`Sheet template "${key}" already exists.`);

    let seed: SheetSeed | null = EMPTY_SEED;
    let documentKey: string | null = null;
    if (input.fromKey) {
      const from = await this.findOrThrow(input.fromKey);
      const rev = this.revisionOf(from);
      seed = rev.seed ?? null;
      documentKey = rev.documentKey ?? null;
      if (!seed && !documentKey) seed = EMPTY_SEED;
    }
    return this.model.create({
      key,
      name: input.name.trim(),
      description: input.description ?? '',
      currentRevision: 1,
      revisions: [{
        revision: 1, seed, documentKey, note: input.fromKey ? `Copied from ${input.fromKey}` : 'Created', createdBy: actor.knoxId, createdAt: new Date(),
      }],
      createdBy: actor.knoxId,
      updatedBy: actor.knoxId,
      updatedAt: new Date(),
    });
  }

  async updateMeta(key: string, input: { name?: string; description?: string }, actor: Actor) {
    this.assertAdmin(actor);
    const t = await this.findOrThrow(key);
    if (input.name !== undefined) t.name = input.name.trim();
    if (input.description !== undefined) t.description = input.description;
    t.updatedBy = actor.knoxId;
    t.updatedAt = new Date();
    await t.save();
    return t;
  }

  /** Admin이 편집기로 저장한 시트를 새 개정본으로 쌓는다 — 이미 만든 artifact에는 영향이 없다. */
  async addRevision(key: string, document: Buffer, note: string, actor: Actor) {
    this.assertAdmin(actor);
    const t = await this.findOrThrow(key);
    parseSheetDocument(document);
    const revision = Math.max(0, ...(t.revisions ?? []).map((r) => r.revision)) + 1;
    const documentKey = this.storage.buildStorageKey('sheet-templates', t.key, `r${revision}`, 'template.ssjson');
    await this.storage.upload(documentKey, document, { originalname: 'template.ssjson', uploader: actor.knoxId });
    t.revisions.push({
      revision, seed: null, documentKey, note: note ?? '', createdBy: actor.knoxId, createdAt: new Date(),
    } as SheetTemplateRevision);
    t.currentRevision = revision;
    t.updatedBy = actor.knoxId;
    t.updatedAt = new Date();
    await t.save();
    return t;
  }
}
