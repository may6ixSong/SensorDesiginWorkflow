import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Memo, MemoSchema } from './schemas/memo.schema';
import { MemosService } from './memos.service';
import { MemosController } from './memos.controller';
import { CommonAccessModule } from '../common/common-access.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: Memo.name, schema: MemoSchema }]), CommonAccessModule],
  providers: [MemosService],
  controllers: [MemosController],
  exports: [MemosService],
})
export class MemosModule {}
