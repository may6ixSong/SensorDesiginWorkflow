import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Edge, EdgeSchema } from './schemas/edge.schema';
import { EdgesService } from './edges.service';
import { EdgesController } from './edges.controller';
import { CommonAccessModule } from '../common/common-access.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: Edge.name, schema: EdgeSchema }]), CommonAccessModule],
  providers: [EdgesService],
  controllers: [EdgesController],
  exports: [EdgesService],
})
export class EdgesModule {}
