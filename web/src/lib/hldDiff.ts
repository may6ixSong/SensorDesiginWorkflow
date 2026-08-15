import { DeliverableDto, HldReleaseDto } from '@/types/domain';

export interface HldDiffRow {
  deliverableId: string;
  name: string;
  docType: string;
  network: 'OA' | 'HPC';
  version: string | null;
  file: string | null;
  releasedAt: string | null;
  comment: string;
  /** 이전 HLD 대비 버전이 달라졌는지 (신규/제외 구분 없이 단일 플래그, 설계서 3.10). */
  changed: boolean;
}

/**
 * HLD 행 조인은 FE에서 수행한다 (설계서 3.10, 4.9).
 * 행 구성 기준은 "현재 IP에 설정된 산출물 전체" - 스냅샷에 없던 산출물도
 * 항상 행으로 나오며, 그 시점에 릴리스되지 않았던 셀은 공란(null)으로 표시된다.
 */
export function computeHldDiffRows(
  currentDeliverables: DeliverableDto[],
  current: HldReleaseDto,
  previous: HldReleaseDto | null,
): HldDiffRow[] {
  return currentDeliverables.map((d) => {
    const item = current.items[d.id];
    const prevItem = previous?.items[d.id];
    const version = item?.version ?? null;
    const prevVersion = prevItem?.version ?? null;

    return {
      deliverableId: d.id,
      name: d.name,
      docType: d.docType,
      network: d.network,
      version,
      file: item?.file ?? null,
      releasedAt: item?.at ?? null,
      comment: item?.comment ?? '',
      changed: version !== prevVersion,
    };
  });
}
