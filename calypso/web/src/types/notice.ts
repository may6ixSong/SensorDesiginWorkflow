/** Platform system notice (SYSTEM_API). */
export type Notice = {
  nID: number;
  title: string;
  content: string;
  startDate: string;
  endDate?: string;
  emergencyFlag?: boolean;
};
