import { Module, forwardRef } from '@nestjs/common';
import { registerModels } from '../database/model-registration';
import { Block, BlockSchema } from './schemas/block.schema';
import { BlocksService } from './blocks.service';
import { BlocksController } from './blocks.controller';
import { CanvasViewService } from './canvas-view.service';
import { CommonAccessModule } from '../common/common-access.module';
import { AuditModule } from '../audit/audit.module';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { EdgesModule } from '../edges/edges.module';
import { ReleasesModule } from '../releases/releases.module';

const Models = registerModels([{ name: Block.name, schema: BlockSchema }]);

@Module({
  imports: [
    Models,
    CommonAccessModule,
    AuditModule,
    ArtifactsModule,
    EdgesModule,
    // 캔버스의 publish 배지가 "마지막 release 대비 major가 올라갔는가"를 물어봐야 하고,
    // release는 다시 블록 목록을 필요로 한다 — 둘이 서로를 참조하므로 forwardRef다.
    forwardRef(() => ReleasesModule),
  ],
  providers: [BlocksService, CanvasViewService],
  controllers: [BlocksController],
  exports: [BlocksService, CanvasViewService, Models],
})
export class BlocksModule {}
