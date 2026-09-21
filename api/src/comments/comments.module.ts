import { Module } from '@nestjs/common';
import { ArtifactComment, ArtifactCommentSchema } from './schemas/artifact-comment.schema';
import { registerModels } from '../database/model-registration';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { NodesModule } from '../nodes/nodes.module';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { CommonAccessModule } from '../common/common-access.module';

@Module({
  imports: [
    registerModels([{ name: ArtifactComment.name, schema: ArtifactCommentSchema }]),
    NodesModule,
    ArtifactsModule,
    CommonAccessModule,
  ],
  providers: [CommentsService],
  controllers: [CommentsController],
  exports: [CommentsService],
})
export class CommentsModule {}
