import { Module } from '@nestjs/common';
import { registerModels } from '../database/model-registration';
import { TableTemplate, TableTemplateSchema } from './schemas/template.schema';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';

@Module({
  imports: [registerModels([{ name: TableTemplate.name, schema: TableTemplateSchema }])],
  providers: [TemplatesService],
  controllers: [TemplatesController],
  exports: [TemplatesService],
})
export class TemplatesModule {}
