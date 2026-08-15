import { SetMetadata } from '@nestjs/common';

export type IpAccessLevel = 'edit' | 'view';
export const IP_ACCESS_KEY = 'ipAccess';

/**
 * @IpAccess('edit')  → ip.owners만 통과
 * @IpAccess('view')  → ip.owners 또는 ip.viewGrants 통과
 * IpAccessGuard와 함께 사용한다 (설계서 6.2).
 */
export const IpAccess = (level: IpAccessLevel) => SetMetadata(IP_ACCESS_KEY, level);
