import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Actor } from '../common/actor';
import { TableTemplate, TableTemplateDocument } from './schemas/template.schema';
import { BUILTIN_TEMPLATES } from './builtin-templates';
import { TableTemplateDef, TemplateColumn, templateProblems } from './table-validation';

export interface TemplateInput {
  key: string;
  name: string;
  description?: string;
  sheetName: string;
  columns: TemplateColumn[];
  archived?: boolean;
}

/** 정의만 남긴 모양 — 표 버전 검증·화면 렌더에 그대로 쓴다. */
export function toTemplateDef(t: TableTemplateDocument, version?: number): TableTemplateDef | null {
  if (version === undefined || version === t.version) {
    return {
      key: t.key, name: t.name, description: t.description ?? '', sheetName: t.sheetName,
      version: t.version, columns: t.columns ?? [],
    };
  }
  const rev = (t.revisions ?? []).find((r) => r.version === version);
  if (!rev) return null;
  return {
    key: t.key, name: t.name, description: t.description ?? '', sheetName: rev.sheetName,
    version: rev.version, columns: rev.columns ?? [],
  };
}

export function toTemplateDto(t: TableTemplateDocument) {
  return {
    ...(toTemplateDef(t) as TableTemplateDef),
    archived: t.archived === true,
    updatedBy: t.updatedBy,
    updatedAt: (t as unknown as { updatedAt?: Date }).updatedAt ?? t.revisions?.[t.revisions.length - 1]?.updatedAt ?? null,
    revisionCount: (t.revisions ?? []).length,
  };
}

/** 컬럼 정의에서 알려진 필드만 남긴다 — Mixed로 저장하므로 아무거나 쌓이지 않게. */
function cleanColumns(columns: TemplateColumn[]): TemplateColumn[] {
  const pick = <K extends keyof TemplateColumn>(c: TemplateColumn, k: K) => (c[k] === undefined || c[k] === null || c[k] === '' ? {} : { [k]: c[k] });
  return (columns ?? []).map((c) => ({
    key: String(c.key ?? '').trim(),
    label: String(c.label ?? '').trim(),
    type: c.type,
    ...pick(c, 'required'),
    ...(c.aliases?.length ? { aliases: c.aliases.map((a) => String(a).trim()).filter(Boolean) } : {}),
    ...(c.options?.length ? { options: c.options.map((o) => String(o).trim()).filter(Boolean) } : {}),
    ...pick(c, 'caseSensitive'),
    ...pick(c, 'allowUnit'),
    ...(typeof c.min === 'number' ? { min: c.min } : {}),
    ...(typeof c.max === 'number' ? { max: c.max } : {}),
    ...pick(c, 'pattern'),
    ...pick(c, 'patternMessage'),
    ...pick(c, 'unique'),
    ...(c.type === 'ref' && c.ref ? {
      ref: {
        column: String(c.ref.column ?? ''),
        ...(c.ref.where?.column ? { where: { column: String(c.ref.where.column), equals: String(c.ref.where.equals ?? '') } } : {}),
        ...(c.ref.stripBitRange ? { stripBitRange: true } : {}),
        severity: c.ref.severity === 'error' ? 'error' : 'warning',
      },
    } : {}),
    ...(c.emptyTokens?.length ? { emptyTokens: c.emptyTokens.map((t) => String(t).trim()).filter(Boolean) } : {}),
    ...pick(c, 'fillDown'),
    ...pick(c, 'mergeOnExport'),
    ...(typeof c.width === 'number' && c.width > 0 ? { width: c.width } : {}),
    ...pick(c, 'description'),
  })) as TemplateColumn[];
}

@Injectable()
export class TemplatesService implements OnModuleInit {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(@InjectModel(TableTemplate.name) private readonly model: Model<TableTemplateDocument>) {}

  async onModuleInit(): Promise<void> {
    await this.seedBuiltins();
  }

  /** 기본 template이 없을 때만 만든다 — Admin이 고친 내용을 부팅마다 덮지 않는다. */
  async seedBuiltins(): Promise<void> {
    for (const def of BUILTIN_TEMPLATES) {
      const exists = await this.model.findOne({ key: def.key }).exec();
      if (exists) continue;
      await this.model.create({
        ...def,
        version: 1,
        revisions: [{ version: 1, sheetName: def.sheetName, columns: def.columns, updatedBy: 'system', updatedAt: new Date() }],
        archived: false,
        createdBy: 'system',
        updatedBy: 'system',
      });
      this.logger.log(`seeded built-in template ${def.key}`);
    }
  }

  async list(includeArchived: boolean) {
    const all = await this.model.find(includeArchived ? {} : { archived: false }).sort({ name: 1 }).exec();
    return all;
  }

  async findOrThrow(key: string): Promise<TableTemplateDocument> {
    const t = await this.model.findOne({ key }).exec();
    if (!t) throw new NotFoundException(`Template "${key}" not found.`);
    return t;
  }

  async definition(key: string, version?: number): Promise<TableTemplateDef> {
    const t = await this.findOrThrow(key);
    const def = toTemplateDef(t, version);
    if (!def) throw new NotFoundException(`Template "${key}" has no version ${version}.`);
    return def;
  }

  private assertAdmin(actor: Actor): void {
    if (!actor.isAdmin) throw new ForbiddenException('Only Admin can change templates.');
  }

  private assertValid(input: TemplateInput, columns: TemplateColumn[]): void {
    if (!input.sheetName?.trim()) throw new BadRequestException('Sheet name is required.');
    const problems = templateProblems({ key: input.key, name: input.name, columns });
    if (problems.length) throw new BadRequestException(problems.join(' '));
  }

  async create(input: TemplateInput, actor: Actor): Promise<TableTemplateDocument> {
    this.assertAdmin(actor);
    const columns = cleanColumns(input.columns);
    this.assertValid(input, columns);
    if (await this.model.findOne({ key: input.key }).exec()) {
      throw new ConflictException(`Template "${input.key}" already exists.`);
    }
    return this.model.create({
      key: input.key,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      sheetName: input.sheetName.trim(),
      version: 1,
      columns,
      revisions: [{ version: 1, sheetName: input.sheetName.trim(), columns, updatedBy: actor.knoxId, updatedAt: new Date() }],
      archived: false,
      createdBy: actor.knoxId,
      updatedBy: actor.knoxId,
    });
  }

  /** 저장할 때마다 version +1, 그 정의를 revisions에 쌓는다. key는 바꿀 수 없다. */
  async update(key: string, input: TemplateInput, actor: Actor): Promise<TableTemplateDocument> {
    this.assertAdmin(actor);
    const t = await this.findOrThrow(key);
    const columns = cleanColumns(input.columns);
    this.assertValid({ ...input, key }, columns);
    const version = t.version + 1;
    t.name = input.name.trim();
    t.description = input.description?.trim() ?? '';
    t.sheetName = input.sheetName.trim();
    t.columns = columns;
    t.version = version;
    t.archived = input.archived === true;
    t.updatedBy = actor.knoxId;
    t.revisions = [...(t.revisions ?? []), { version, sheetName: t.sheetName, columns, updatedBy: actor.knoxId, updatedAt: new Date() }];
    t.markModified('columns');
    t.markModified('revisions');
    await t.save();
    return t;
  }
}
