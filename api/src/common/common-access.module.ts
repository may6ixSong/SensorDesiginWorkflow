import { Module } from '@nestjs/common';
import { Ip, IpSchema } from '../ips/schemas/ip.schema';
import { Deliverable, DeliverableSchema } from '../deliverables/schemas/deliverable.schema';
import { registerModels } from '../database/model-registration';
import { IpAccessGuard } from './guards/ip-access.guard';

const Models = registerModels([
  { name: Ip.name, schema: IpSchema },
  { name: Deliverable.name, schema: DeliverableSchema },
]);

/**
 * Ip/Deliverable 모델과 IpAccessGuard를 한 곳에서 등록해 공유한다 - 이 둘을 쓰는
 * 모듈(ips, deliverables, hld, edges, memos, canvas)이 각자 다시 등록하지 않고
 * CommonAccessModule만 import한다. IpAccessGuard가 두 모델을 모두 필요로 하기 때문에
 * (src/common/guards/ip-access.guard.ts) 모델 등록과 가드 제공을 함께 묶는다.
 */
@Module({
  imports: [Models],
  providers: [IpAccessGuard],
  exports: [Models, IpAccessGuard],
})
export class CommonAccessModule {}
