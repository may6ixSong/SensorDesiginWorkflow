import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ArtifactComment, ArtifactCommentDocument } from './schemas/artifact-comment.schema';
import { CreateCommentDto, toCommentDto, CommentDto } from './dto/comment.dto';
import { Actor } from '../common/actor';
import { BlocksService } from '../blocks/blocks.service';
import { ArtifactsService } from '../artifacts/artifacts.service';
import { ArtifactDocument } from '../artifacts/schemas/artifact.schema';

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(ArtifactComment.name) private readonly model: Model<ArtifactCommentDocument>,
    private readonly blocks: BlocksService,
    private readonly artifacts: ArtifactsService,
  ) {}

  /**
   * Comments 탭의 접근 판정(workflow Edit Access)은 컨트롤러의 `@WorkflowAccess('edit')`
   * 가드가 이미 끝냈다(설계서 01장 §3.8 확장) — 여기서는 그 block에 artifact가 매핑돼
   * 있는지만 확인하고 실제 문서를 가져온다. artifact 자체의 view/edit 권한(canView/
   * canEdit)이나 block.recipients 소속은 더 이상 이 판정에 관여하지 않는다.
   */
  private async resolveArtifact(blockId: string): Promise<ArtifactDocument> {
    const block = await this.blocks.findOrThrow(blockId);
    if (!block.artifactId) {
      throw new BadRequestException('This block has no artifact mapped yet.');
    }
    return this.artifacts.findOrThrow(block.artifactId.toString());
  }

  async listForBlock(blockId: string): Promise<CommentDto[]> {
    const artifact = await this.resolveArtifact(blockId);
    const docs = await this.model
      .find({ artifactId: artifact._id })
      .sort({ createdAt: 1 })
      .exec();
    return docs.map(toCommentDto);
  }

  async createForBlock(
    blockId: string,
    dto: CreateCommentDto,
    actor: Actor,
  ): Promise<CommentDto> {
    const artifact = await this.resolveArtifact(blockId);
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
