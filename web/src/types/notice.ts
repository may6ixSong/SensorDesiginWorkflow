/** Platform system notice (SYSTEM_API). Mirrors SSM_WEB's NoticeItem shape. */
export type NoticeItem = {
  nID: number;
  title: string;
  content: string;
  startDate: string;
  endDate?: string;
  emergencyFlag?: boolean;
};
