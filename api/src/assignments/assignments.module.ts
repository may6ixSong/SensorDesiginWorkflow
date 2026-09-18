import { Module } from '@nestjs/common';
import { CommonAccessModule } from '../common/common-access.module';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { ReleasesModule } from '../releases/releases.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { MyScopeService } from './my-scope.service';

/**
 * My Assignment (설계서 09장).
 *
 * 모델을 새로 등록하지 않는다 — Project/Workflow/Block은 CommonAccessModule이, Artifact와
 * Release는 각 모듈이 이미 등록해 export하고 있다. 이 화면은 **새 컬렉션을 만들지 않고**
 * 기존 컬렉션을 인덱스로 가로질러 읽는다(사용자 확정).
 */
@Module({
  imports: [CommonAccessModule, ArtifactsModule, ReleasesModule],
  providers: [AssignmentsService, MyScopeService],
  controllers: [AssignmentsController],
  exports: [MyScopeService],
})
export class AssignmentsModule {}
