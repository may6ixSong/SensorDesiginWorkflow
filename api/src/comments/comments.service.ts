import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ArtifactComment, ArtifactCommentDocument } from './schemas/artifact-comment.schema';
import { CreateCommentDto, toCommentDto, CommentDto } from './dto/comment.dto';
import { Actor } from '../common/actor';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { BlocksService } from '../blocks/blocks.service';
import { ArtifactsService } from '../artifacts/artifacts.service';
import { ArtifactAccessService } from '../artifacts/artifact-access.service';
import { ArtifactDocument } from '../artifacts/schemas/artifact.schema';

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(ArtifactComment.name) private readonly model: Model<ArtifactCommentDocument>,
    private readonly blocks: BlocksService,
    private readonly artifacts: ArtifactsService,
    private readonly artifactAccess: ArtifactAccessService,
  ) {}

  /**
   * Artifact 상세 열람 권한(assertCanOpen)은 block 컨텍스트(recipients)가 필요해서 artifact
   * 단독으로 판정할 수 없다 - CanvasViewService.liveVersions와 동일한 3단계로 판정한다.
   * null이 아니면(view/edit 무관) 댓글 읽기·쓰기 모두 허용한다.
   */
  private async resolveArtifact(blockId: string, project: ProjectDocument | null, actor: Actor): Promise<ArtifactDocument> {
    const block = await this.blocks.findOrThrow(blockId);
    if (!block.artifactId) {
      throw new BadRequestException('This block has no artifact mapped yet.');
    }
    const artifact = await this.artifacts.findOrThrow(block.artifactId.toString());
    await this.artifactAccess.assertCanOpen(actor, artifact, block, project);
    return artifact;
  }

  async listForBlock(blockId: string, project: ProjectDocument | null, actor: Actor): Promise<CommentDto[]> {
    const artifact = await this.resolveArtifact(blockId, project, actor);
    const docs = await this.model
      .find({ artifactId: artifact._id })
      .sort({ createdAt: 1 })
      .exec();
    return docs.map(toCommentDto);
  }

  async createForBlock(
    blockId: string,
    dto: CreateCommentDto,
    project: ProjectDocument | null,
    actor: Actor,
  ): Promise<CommentDto> {
    const artifact = await this.resolveArtifact(blockId, project, actor);
    const text = dto.text?.trim();
    if (!text) throw new BadRequestException('text is required.');

    let versionId: Types.ObjectId | null = null;
    let versionLabelSnapshot = '';
    let parentCommentId: Types.ObjectId | null = null;

    if (dto.parentCommentId) {
      const parent = await this.model.findById(dto.parentCommentId).exec();
      if (!parent || parent.artifactId.toString() !== artifact._id.toString()) {
        throw new BadRequestException('parentCommentId does not belong to this artifact.');
      }
      parentCommentId = parent._id;
      versionId = parent.versionId;
      versionLabelSnapshot = parent.versionLabelSnapshot;
    } else {
      // 최상위 댓글은 "General(버전 없음)"을 지원하지 않는다 - 항상 실제 등록된 버전을
      // 하나 가리켜야 한다(답글은 부모의 버전을 그대로 물려받으므로 예외). 그리고 그
      // 버전은 publish된 것이어야 한다 - working(미발행) 버전에는 달 수 없다.
      if (!dto.versionId) throw new BadRequestException('versionId is required.');
      const version = (artifact.versions ?? []).find((v) => v._id?.toString() === dto.versionId);
      if (!version) throw new BadRequestException('versionId does not belong to this artifact.');
      if (!version.isPublished) {
        throw new BadRequestException('Comments can only be added to a published version.');
      }
      versionId = version._id;
      versionLabelSnapshot = version.versionLabel;
    }

    const created = await this.model.create({
      artifactId: artifact._id,
      versionId,
      versionLabelSnapshot,
      parentCommentId,
      text,
      createdBy: actor.knoxId,
      isMock: false,
    });
    return toCommentDto(created);
  }
}
