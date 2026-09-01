import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WorkflowAccessGuard } from '../common/guards/workflow-access.guard';
import { WorkflowAccess } from '../common/decorators/workflow-access.decorator';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { CurrentWorkflow } from '../common/decorators/current-workflow.decorator';
import { Actor } from '../common/actor';
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { AuditService } from '../audit/audit.service';
import { DeliverablesService } from './deliverables.service';
import { StorageService } from '../storage/storage.service';
import { toDeliverableDto, toIncomingDeliverableDto, toVisibleVersions } from './dto/deliverable.dto';
import {
  AddVersionDto,
  CreateDeliverableDto,
  DownloadVersionDto,
  ReleaseDto,
  UpdateDeliverableDto,
  UpdateRecvDto,
  UpdateScheduleDto,
} from './dto/deliverable-crud.dto';

@UseGuards(WorkflowAccessGuard)
@Controller()
export class DeliverablesController {
  constructor(
    private readonly deliverables: DeliverablesService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /**
   * BE가 major/minor 가시성을 미리 필터링해서 응답 (설계서 5.1, 6.1).
   * `incoming`은 다른 workflow가 이 workflow를 recvWorkflowId로 지정한 산출물 — 항상 Release 버전만
   * 담겨 온다. 주는 쪽이 release()하면 이 목록도 즉시 그 결과를 반영한다.
   */
  @WorkflowAccess('view')
  @Get('workflows/:workflowId/deliverables')
  async listForWorkflow(@Param('workflowId') workflowId: string, @CurrentWorkflow() workflow: WorkflowDocument, @CurrentActor() me: Actor) {
    const [list, incoming] = await Promise.all([
      this.deliverables.listForWorkflow(workflowId),
      this.deliverables.listIncomingForWorkflow(workflowId),
    ]);
    return {
      data: list.map((d) => toDeliverableDto(d, workflow, me)),
      incoming: incoming.map(({ deliverable, sourceWorkflow }) => toIncomingDeliverableDto(deliverable, sourceWorkflow)),
    };
  }

  @WorkflowAccess('edit')
  @Post('workflows/:workflowId/deliverables')
  async create(
    @Param('workflowId') workflowId: string,
    @Body() dto: CreateDeliverableDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentActor() me: Actor,
  ) {
    const d = await this.deliverables.create(workflow, dto, me);
    return { data: toDeliverableDto(d, workflow, me) };
  }

  @WorkflowAccess('edit')
  @Patch('deliverables/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDeliverableDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentActor() me: Actor,
  ) {
    const d = await this.deliverables.update(id, dto);
    return { data: toDeliverableDto(d, workflow, me) };
  }

  @WorkflowAccess('edit')
  @Delete('deliverables/:id')
  async remove(@Param('id') id: string, @CurrentActor() me: Actor) {
    await this.deliverables.remove(id, me);
    return { data: { id } };
  }

  @WorkflowAccess('edit')
  @Patch('deliverables/:id/recv')
  async updateRecv(
    @Param('id') id: string,
    @Body() dto: UpdateRecvDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentActor() me: Actor,
  ) {
    const d = await this.deliverables.updateRecv(id, dto, me);
    return { data: toDeliverableDto(d, workflow, me) };
  }

  @WorkflowAccess('edit')
  @Patch('deliverables/:id/schedule')
  async updateSchedule(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentActor() me: Actor,
  ) {
    const list = await this.deliverables.updateSchedule(workflow, id, dto.phaseIds, me);
    return { data: list.map((d) => toDeliverableDto(d, workflow, me)) };
  }

  @WorkflowAccess('view')
  @Get('deliverables/:id/versions')
  async versions(@Param('id') id: string, @CurrentWorkflow() workflow: WorkflowDocument, @CurrentActor() me: Actor) {
    const d = await this.deliverables.findOrThrow(id);
    return { data: toVisibleVersions(d, workflow, me) };
  }

  /**
   * OA망 파일 업로드. API가 바이트를 직접 받아 S3에 올린다(SFM_API와 동일한 중계 방식).
   * 업로드만 하고 버전은 만들지 않는다 - FE는 반환된 storageKey로 이어서
   * POST /deliverables/:id/versions 를 호출한다.
   */
  @WorkflowAccess('edit')
  @Post('deliverables/:id/upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentActor() me: Actor,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required (multipart form field "file").');
    }
    const d = await this.deliverables.findOrThrow(id);
    if (d.intent === 'received') {
      throw new BadRequestException('This artifact is a placeholder for something you are waiting to receive — it cannot be uploaded here directly.');
    }
    const storageKey = this.storage.buildStorageKey(
      workflow._id.toString(),
      d._id.toString(),
      this.deliverables.nextVersionLabel(d),
      file.originalname,
    );
    await this.storage.upload(storageKey, file.buffer, {
      originalname: file.originalname,
      uploader: me.knoxId,
    });
    return { data: { storageKey, fileName: file.originalname } };
  }

  /**
   * OA망 파일 다운로드. Edit 권한이 없으면 Release(major) 버전만 받을 수 있다 (설계서 6.1).
   * HPC망 산출물은 파일이 아니라 경로(hpcPath)만 갖고 있으므로 다운로드 대상이 아니다.
   */
  @WorkflowAccess('view')
  @Get('deliverables/:id/download')
  async download(
    @Param('id') id: string,
    @Query() query: DownloadVersionDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentActor() me: Actor,
  ): Promise<StreamableFile> {
    const d = await this.deliverables.findOrThrow(id);
    const isEditor = workflow.owners.includes(me.knoxId);
    const version = this.deliverables.findVersionOrThrow(d, query.major, query.minor, isEditor);
    if (!version.storageKey) {
      throw new BadRequestException('This version has no stored file (HPC-network deliverables share a path only).');
    }

    const body = await this.storage.download(version.storageKey);
    if (!body) throw new NotFoundException('The stored file could not be found.');

    await this.audit.log(me.knoxId, 'FILE_DOWNLOAD', 'deliverable', d._id, {
      major: version.major,
      minor: version.minor,
    });

    return new StreamableFile(body, {
      type: 'application/octet-stream',
      disposition: `attachment; filename="${encodeURIComponent(version.fileName)}"`,
    });
  }

  @WorkflowAccess('edit')
  @Post('deliverables/:id/versions')
  async addVersion(
    @Param('id') id: string,
    @Body() dto: AddVersionDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentActor() me: Actor,
  ) {
    const d = await this.deliverables.addVersion(id, dto, me);
    return { data: toDeliverableDto(d, workflow, me) };
  }

  @WorkflowAccess('edit')
  @Post('deliverables/:id/release')
  async release(
    @Param('id') id: string,
    @Body() dto: ReleaseDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentActor() me: Actor,
  ) {
    const d = await this.deliverables.release(id, dto, me);
    return { data: toDeliverableDto(d, workflow, me) };
  }
}
