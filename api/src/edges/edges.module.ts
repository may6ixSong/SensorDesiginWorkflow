import { Module } from '@nestjs/common';
import { Edge, EdgeSchema } from './schemas/edge.schema';
import { registerModels } from '../database/model-registration';
import { EdgesService } from './edges.service';
import { EdgesController } from './edges.controller';
import { CommonAccessModule } from '../common/common-access.module';

@Module({
  imports: [registerModels([{ name: Edge.name, schema: EdgeSchema }]), CommonAccessModule],
  providers: [EdgesService],
  controllers: [EdgesController],
  exports: [EdgesService],
})
export class EdgesModule {}
