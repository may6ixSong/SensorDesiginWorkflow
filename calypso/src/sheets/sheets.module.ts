import { Module } from '@nestjs/common';
import { registerModels } from '../database/model-registration';
import { StorageModule } from '../storage/storage.module';
import { SheetTemplate, SheetTemplateSchema } from './schemas/sheet-template.schema';
import { SheetTemplatesService } from './sheet-templates.service';
import { SheetTemplatesController } from './sheet-templates.controller';

@Module({
  imports: [registerModels([{ name: SheetTemplate.name, schema: SheetTemplateSchema }]), StorageModule],
  providers: [SheetTemplatesService],
  controllers: [SheetTemplatesController],
  exports: [SheetTemplatesService],
})
export class SheetsModule {}
