import { DeliverableDocument, DeliverableVersion } from '../schemas/deliverable.schema';
import { IpDocument } from '../../ips/schemas/ip.schema';
import { UserDocument } from '../../users/schemas/user.schema';
import { pick } from '../../common/utils/pick';

const VERSION_FIELDS = [
  'major',
  'minor',
  'kind',
  'fileName',
  'storageKey',
  'hpcPath',
  'note',
  'createdBy',
  'createdAt',
] as const;

function isEditor(ip: IpDocument, me: UserDocument): boolean {
  const meId = me._id.toString();
  return ip.owners.some((o) => o.toString() === meId);
}

/**
 * 산출물 응답의 단일 통로 (설계서 6.1). 컨트롤러는 이 함수를 거치지 않은
 * 엔티티를 절대 직접 반환하지 않는다. Edit 권한자만 작업중(minor) 버전을 본다.
 */
export function toDeliverableDto(d: DeliverableDocument, ip: IpDocument, me: UserDocument) {
  const isEdit = isEditor(ip, me);
  const versions = d.versions ?? [];
  const latest = versions[0];
  const released = versions.find((v) => v.kind === 'major');

  return {
    ...pick(d.toObject(), [
      '_id',
      'projectId',
      'ipId',
      'phaseKey',
      'name',
      'docType',
      'network',
      'series',
      'seriesIdx',
      'seriesTotal',
      'layout',
      'recvDept',
      'recvContact',
      'createdBy',
      'createdAt',
      'updatedAt',
    ]),
    id: d._id.toString(),
    releasedVersion: released ? pick(released as DeliverableVersion, [...VERSION_FIELDS]) : null,
    workingVersion: isEdit && latest?.kind === 'minor' ? pick(latest, [...VERSION_FIELDS]) : null,
    canEdit: isEdit,
  };
}

/** GET /deliverables/:id/versions - 가시성 규칙 적용된 버전 이력 (설계서 5.1, 3.5). */
export function toVisibleVersions(d: DeliverableDocument, ip: IpDocument, me: UserDocument) {
  const isEdit = isEditor(ip, me);
  const versions = isEdit ? d.versions : d.versions.filter((v) => v.kind === 'major');
  return versions.map((v) => pick(v, [...VERSION_FIELDS]));
}
