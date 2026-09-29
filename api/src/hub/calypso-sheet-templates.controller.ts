import {
  BadGatewayException, BadRequestException, Body, Controller, Get, HttpException, Param, Patch, Post, Query, UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { Actor, assertAdmin } from '../common/actor';
import { CalypsoClientService } from './calypso-client.service';
import {
  AddCalypsoSheetTemplateRevisionDto, CreateCalypsoSheetTemplateDto, UpdateCalypsoSheetTemplateDto,
} from './dto/calypso-proxy.dto';

/**
 * Sheet template 프록시(설계서 11장 §3). template은 Calypso가 소유하고, SIREN FE는 여기로만
 * 부른다(07장 §2 FE→BE 단일 경로).
 *
 * - 읽기: 로그인한 사용자 누구나 — sheet artifact를 만들 때 고른다. project와 무관한 전역
 *   데이터라 project 게이트가 없다.
 * - 쓰기: Admin만. SIREN이 실제 Admin(`actor.isAdmin`, 시뮬레이션 대상 기준)을 먼저 확인하고,
 *   Calypso도 같은 판정을 한 번 더 한다.
 */
@Controller('calypso-sheet-templates')
export class CalypsoSheetTemplatesController {
  constructor(private readonly calypso: CalypsoClientService) {}

  private relay(result: { status: number; body: any } | null): any {
    if (!result) throw new BadGatewayException('Could not reach the file service (Calypso). Check that it is running.');
    if (result.status >= 200 && result.status < 300) return result.body;
    throw new HttpException(result.body ?? { message: 'Sheet template request failed.' }, result.status);
  }

  private path(key: string, rest = ''): string {
    return `/sheet-templates/${encodeURIComponent(key)}${rest}`;
  }

  @Get()
  async list(@Query('includeArchived') includeArchived: string | undefined, @CurrentActor() me: Actor) {
    const q = includeArchived === 'true' && me.isAdmin ? '?includeArchived=true' : '';
    return this.relay(await this.calypso.forward('GET', `/sheet-templates${q}`, undefined, me.knoxId, [], me.isAdmin));
  }

  @Get(':key')
  async detail(@Param('key') key: string, @CurrentActor() me: Actor) {
    return this.relay(await this.calypso.forward('GET', this.path(key), undefined, me.knoxId, [], me.isAdmin));
  }

  @Get(':key/start')
  async start(@Param('key') key: string, @Query('revision') revision: string | undefined, @CurrentActor() me: Actor) {
    const q = revision && /^\d+$/.test(revision) ? `?revision=${revision}` : '';
    return this.relay(await this.calypso.forward('GET', this.path(key, `/start${q}`), undefined, me.knoxId, [], me.isAdmin));
  }

  @Post()
  async create(@Body() dto: CreateCalypsoSheetTemplateDto, @CurrentActor() me: Actor) {
    assertAdmin(me);
    return this.relay(await this.calypso.forward('POST', '/sheet-templates', dto, me.knoxId, [], true));
  }

  @Patch(':key')
  async update(@Param('key') key: string, @Body() dto: UpdateCalypsoSheetTemplateDto, @CurrentActor() me: Actor) {
    assertAdmin(me);
    return this.relay(await this.calypso.forward('PATCH', this.path(key), dto, me.knoxId, [], true));
  }

  /** Admin이 편집기로 저장한 시트(파일 필드 `document`)를 새 개정본으로 올린다. */
  @Post(':key/revisions')
  @UseInterceptors(FileInterceptor('document'))
  async addRevision(
    @Param('key') key: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: AddCalypsoSheetTemplateRevisionDto,
    @CurrentActor() me: Actor,
  ) {
    assertAdmin(me);
    if (!file) throw new BadRequestException('Attach the sheet document as the "document" file.');
    const form = new FormData();
    form.append('document', new Blob([file.buffer as unknown as BlobPart], { type: 'application/json' }), 'template.ssjson');
    if (dto.note) form.append('note', dto.note);
    return this.relay(await this.calypso.forward('POST', this.path(key, '/revisions'), form, me.knoxId, [], true));
  }
}
