import { Module } from '@nestjs/common';
import { Ip, IpSchema } from '../ips/schemas/ip.schema';
import { Deliverable, DeliverableSchema } from '../deliverables/schemas/deliverable.schema';
import { registerModels } from '../database/model-registration';
import { IpAccessGuard } from './guards/ip-access.guard';

/**
 * IpAccessGuard가 필요로 하는 Ip/Deliverable 모델과 가드 자체를 묶어 export한다.
 * 권한 재검증 가드(설계서 6.2)를 쓰는 모든 모듈(ips, deliverables, canvas, hld, memos, edges)이 import한다.
 *
 * populateRefs는 인메모리(DB 미연결) 모드에서만 쓰인다 - 실제 DB에서는 스키마의 ref로 populate된다.
 */
const modelsModule = registerModels([
  { name: Ip.name, schema: IpSchema, populateRefs: { owners: 'User', 'viewGrants.userId': 'User' } },
  { name: Deliverable.name, schema: DeliverableSchema },
]);

@Module({
  imports: [modelsModule],
  providers: [IpAccessGuard],
  exports: [IpAccessGuard, modelsModule],
})
export class CommonAccessModule {}
