import axios from 'axios';

export type EmployeeResponse = {
  result?: string;
  totalPage?: number;
  currentPage?: number;
  totalCount?: number;
  employees: Employee[];
};

export type Employee = {
  userId: string;
  sirName?: string;
  enDiscription?: string;
  enGradeName?: string;
  companyName?: string;
  departmentCode?: string;
  description?: string;
  epId?: string;
  employeeStatus?: string;
  enFullName?: string;
  titleCode?: string;
  employeeNumber?: string;
  securityLevel?: string;
  emailAddress?: string;
  titleSortOrder?: string;
  companyCode?: string;
  departmentName?: string;
  enCompanyName?: string;
  enSirName?: string;
  jobName?: string;
  gradeTitleIndiCode?: string;
  gradeName?: string;
  givenName?: string;
  fullName?: string;
  serverLocation?: string;
  enTitleName?: string;
  titleName?: string;
  enGivenName?: string;
  realNameYn?: string;
  enDepartmentName?: string;
};

const endPoint = 'knox';

export async function getEmployeesByIDs(userId: string): Promise<EmployeeResponse> {
  const url = `${import.meta.env.SDP_COMMON_API}/${endPoint}/employees/id/${userId}`;
  const response = await axios.get<EmployeeResponse>(url);
  return response.data;
}

export async function getEmployeesByName(userName: string): Promise<EmployeeResponse> {
  const url = `${import.meta.env.SDP_COMMON_API}/${endPoint}/employees/name/${userName}`;
  const response = await axios.get<EmployeeResponse>(url);
  return response.data;
}

export async function updateUserInfo(userId: string, field: string, value: string): Promise<boolean> {
  try {
    const updatedParam: Record<string, string> = { [field]: value };
    const url = `${import.meta.env.USER_GROUP_API}/user/${userId}/update`;
    const response = await axios.put<boolean>(url, updatedParam);
    return !!response.data;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('user-service', error);
    return false;
  }
}
