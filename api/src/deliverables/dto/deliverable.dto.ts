import { DeliverableDocument, DeliverableVersion } from '../schemas/deliverable.schema';
import { IpDocument } from '../../ips/schemas/ip.schema';
import { UserDocument } from '../../users/schemas/user.schema';

function isEditor(ip: IpDocument, me: UserDocument): boolean {
  const meId = me._id.toString();
  return ip.owners.some((o) => o.toString() === meId);
}

/** 목업의 MV(major,minor,kind,by,at,note,file) 형태로 내려준다. */
function toVersionDto(v: DeliverableVersion) {
  return {
    major: v.major,
    minor: v.minor,
    kind: v.kind,
    file: v.hpcPath ?? v.fileName ?? '',
    note: v.note ?? '',
    by: v.createdBy?.toString() ?? '',
    at: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
  };
}

/**
 * 산출물 응답의 단일 통로 (설계서 6.1). 컨트롤러는 이 함수를 거치지 않은
 * 엔티티를 절대 직접 반환하지 않는다.
 *
 * versions 배열 자체를 권한에 맞게 필터링해서 내려준다 - Edit 권한자는 전체,
 * 그 외에는 Released(major)만. FE는 이 배열로 목업의 latA()/latR()/hasW()를
 * 그대로 계산하므로, 권한 없는 사용자에게는 작업중 버전이 존재조차 하지 않는다.
 */
export function toDeliverableDto(d: DeliverableDocument, ip: IpDocument, me: UserDocument) {
  const isEdit = isEditor(ip, me);
  const all = d.versions ?? [];
  const visible = isEdit ? all : all.filter((v) => v.kind === 'major');
  const latest = visible[0] ?? null;
  const released = visible.find((v) => v.kind === 'major') ?? null;

  return {
    id: d._id.toString(),
    projectId: d.projectId.toString(),
    ipId: d.ipId.toString(),
    phaseKey: d.phaseKey,
    name: d.name,
    docType: d.docType,
    network: d.network,
    series: d.series ? d.series.toString() : null,
    seriesIdx: d.seriesIdx,
    seriesTotal: d.seriesTotal,
    layout: { x: d.layout.x, y: d.layout.y, w: d.layout.w, h: d.layout.h },
    recvDept: d.recvDept ?? null,
    recvContact: d.recvContact ? d.recvContact.toString() : null,
    recvIpId: d.recvIpId ? d.recvIpId.toString() : null,
    sourceDept: d.sourceDept ?? null,
    versions: visible.map(toVersionDto),
    releasedVersion: released ? toVersionDto(released) : null,
    workingVersion: isEdit && latest?.kind === 'minor' ? toVersionDto(latest) : null,
    canEdit: isEdit,
    sourceIp: null,
  };
}

/** GET /deliverables/:id/versions - 가시성 규칙 적용된 버전 이력 (설계서 5.1, 3.5). */
export function toVisibleVersions(d: DeliverableDocument, ip: IpDocument, me: UserDocument) {
  const isEdit = isEditor(ip, me);
  const versions = isEdit ? d.versions : d.versions.filter((v) => v.kind === 'major');
  return versions.map(toVersionDto);
}

/**
 * 다른 IP의 보드에 "Incoming from other IPs"로 노출되는 산출물 응답.
 * 주는 쪽(sourceIp)에서의 Edit 권한과 무관하게 항상 Release(major) 버전만 보이고,
 * Working copy는 절대 노출하지 않는다 — 받는 쪽은 Release 버전만 볼 수 있다는
 * 규칙은 조회자가 우연히 sourceIp의 owner여도 예외 없이 적용된다.
 */
export function toIncomingDeliverableDto(d: DeliverableDocument, sourceIp: IpDocument) {
  const released = (d.versions ?? []).find((v) => v.kind === 'major') ?? null;

  return {
    id: d._id.toString(),
    projectId: d.projectId.toString(),
    ipId: d.ipId.toString(),
    phaseKey: d.phaseKey,
    name: d.name,
    docType: d.docType,
    network: d.network,
    series: d.series ? d.series.toString() : null,
    seriesIdx: d.seriesIdx,
    seriesTotal: d.seriesTotal,
    layout: { x: d.layout.x, y: d.layout.y, w: d.layout.w, h: d.layout.h },
    recvDept: d.recvDept ?? null,
    recvContact: d.recvContact ? d.recvContact.toString() : null,
    recvIpId: d.recvIpId ? d.recvIpId.toString() : null,
    sourceDept: null,
    versions: released ? [toVersionDto(released)] : [],
    releasedVersion: released ? toVersionDto(released) : null,
    workingVersion: null,
    canEdit: false,
    sourceIp: { id: sourceIp._id.toString(), name: sourceIp.name, color: sourceIp.color },
  };
}
