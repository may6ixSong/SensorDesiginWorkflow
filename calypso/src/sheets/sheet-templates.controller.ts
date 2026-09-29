import {
  BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentActor } from '../common/current-actor.decorator';
import { Actor } from '../common/actor';
import { SirenCallerGuard } from '../common/siren-caller.guard';
import { SheetTemplatesService, toTemplateDto } from './sheet-templates.service';
import { AddSheetTemplateRevisionDto, CreateSheetTemplateDto, UpdateSheetTemplateDto } from './sheet-templates.dto';

/**
 * Sheet template(SIREN 설계서 11장 §3). 읽기는 SIREN BE를 거친 로그인 사용자 누구나, 쓰기는
 * Admin만(`X-User-Group: Admin` — SIREN BE가 실제 Admin 판정 뒤에만 싣는다).
 */
@Controller('sheet-templates')
@UseGuards(SirenCallerGuard)
export class SheetTemplatesController {
  constructor(private readonly templates: SheetTemplatesService) {}

  @Get()
  async list() {
    const list = await this.templates.list();
    return { data: list.map(toTemplateDto) };
  }

  @Get(':key')
  async detail(@Param('key') key: string) {
    return { data: toTemplateDto(await this.templates.findOrThrow(key)) };
  }

  /** 편집기에 넘길 시작 시트. `?revision=`을 주면 그 개정본. */
  @Get(':key/start')
  async start(@Param('key') key: string, @Query('revision') revision: string | undefined) {
    const r = revision ? Number(revision) : undefined;
    return { data: await this.templates.start(key, Number.isInteger(r) ? r : undefined) };
  }

  @Post()
  async create(@Body() dto: CreateSheetTemplateDto, @CurrentActor() me: Actor) {
    return { data: toTemplateDto(await this.templates.create(dto, me)) };
  }

  @Patch(':key')
  async update(@Param('key') key: string, @Body() dto: UpdateSheetTemplateDto, @CurrentActor() me: Actor) {
    return { data: toTemplateDto(await this.templates.updateMeta(key, dto, me)) };
  }

  /** 삭제 — 되살릴 수 없다. 이미 만든 artifact는 영향이 없다. */
  @Delete(':key')
  async remove(@Param('key') key: string, @CurrentActor() me: Actor) {
    await this.templates.remove(key, me);
    return { data: { key, deleted: true } };
  }

  @Post(':key/revisions')
  @UseInterceptors(FileInterceptor('document'))
  async addRevision(
    @Param('key') key: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: AddSheetTemplateRevisionDto,
    @CurrentActor() me: Actor,
  ) {
    if (!file) throw new BadRequestException('Attach the sheet document as the "document" file.');
    return { data: toTemplateDto(await this.templates.addRevision(key, file.buffer, dto.note ?? '', me)) };
  }
}
