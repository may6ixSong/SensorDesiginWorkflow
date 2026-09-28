import { Module } from '@nestjs/common';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { StorageModule } from '../storage/storage.module';
import { AutoRunSourceController } from './auto-run-source.controller';
import { AutoRunProbeController } from './auto-run-probe.controller';

/**
 * SIREN Auto Run(SIREN 설계서 10장)과 맞닿는 두 가지:
 *   - source 접근: trigger를 받은 서비스가 run별 토큰으로 Calypso source를 받아간다
 *   - probe: 개발/검증 전용 trigger 수신기(AUTO_RUN_PROBE_ENABLED=true일 때만)
 */
@Module({
  imports: [ArtifactsModule, StorageModule],
  controllers: [AutoRunSourceController, AutoRunProbeController],
})
export class AutoRunModule {}
