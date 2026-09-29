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
    archived: t.archived === true,
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

  /** 기본 template이 없을 때만 만든다 — Admin이 고친 내용을 부팅마다 덮지 않는다. */
  async seedBuiltins(): Promise<void> {
    for (const def of BUILTIN_SHEET_TEMPLATES) {
      const exists = await this.model.findOne({ key: def.key }).exec();
      if (exists) continue;
      await this.model.create({
        key: def.key,
        name: def.name,
        description: def.description,
        archived: false,
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

  async list(includeArchived: boolean): Promise<SheetTemplateDocument[]> {
    const all = await this.model.find(includeArchived ? {} : { archived: false }).exec();
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }

  async findOrThrow(key: string): Promise<SheetTemplateDocument> {
    const t = await this.model.findOne({ key }).exec();
    if (!t) throw new NotFoundException(`Sheet template "${key}" not found.`);
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

  /** artifact를 만들 때 — 쓸 수 있는 template인지 보고, 그 순간의 개정본 번호를 돌려준다. */
  async pinForNewArtifact(key: string): Promise<number> {
    const t = await this.findOrThrow(key);
    if (t.archived) throw new BadRequestException(`Sheet template "${key}" is archived.`);
    return t.currentRevision;
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
      archived: false,
      currentRevision: 1,
      revisions: [{
        revision: 1, seed, documentKey, note: input.fromKey ? `Copied from ${input.fromKey}` : 'Created', createdBy: actor.knoxId, createdAt: new Date(),
      }],
      createdBy: actor.knoxId,
      updatedBy: actor.knoxId,
      updatedAt: new Date(),
    });
  }

  async updateMeta(key: string, input: { name?: string; description?: string; archived?: boolean }, actor: Actor) {
    this.assertAdmin(actor);
    const t = await this.findOrThrow(key);
    if (input.name !== undefined) t.name = input.name.trim();
    if (input.description !== undefined) t.description = input.description;
    if (input.archived !== undefined) t.archived = input.archived;
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
