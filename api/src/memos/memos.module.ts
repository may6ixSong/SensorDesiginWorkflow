import { Module } from '@nestjs/common';
import { Memo, MemoSchema } from './schemas/memo.schema';
import { registerModels } from '../database/model-registration';
import { MemosService } from './memos.service';
import { MemosController } from './memos.controller';
import { CommonAccessModule } from '../common/common-access.module';

@Module({
  imports: [registerModels([{ name: Memo.name, schema: MemoSchema }]), CommonAccessModule],
  providers: [MemosService],
  controllers: [MemosController],
  exports: [MemosService],
})
export class MemosModule {}
