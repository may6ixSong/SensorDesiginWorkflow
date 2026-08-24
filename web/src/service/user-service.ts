import axios from 'axios';

/**
 * Common-platform employee directory (SDP_COMMON_API) and platform user
 * group/preferences service (USER_GROUP_API). Both are corporate-network-only
 * services with no dev-environment endpoint (see web/.env.development), so
 * every call here is expected to fail in dev — callers must treat that as a
 * normal, silent no-op rather than an error, so the rest of the app (which
 * runs entirely against SIREN's own mock backend) is never blocked by them.
 */

export type Employee = {
  userId: string;
  fullName?: string;
  enFullName?: string;
  emailAddress?: string;
  departmentName?: string;
  enDepartmentName?: string;
};

type EmployeeResponse = {
  employees: Employee[];
};

const KNOX_ENDPOINT = 'knox';

export async function getEmployeeByKnoxId(knoxId: string): Promise<Employee | undefined> {
  if (!import.meta.env.SDP_COMMON_API || !knoxId) return undefined;
  try {
    const url = `${import.meta.env.SDP_COMMON_API}/${KNOX_ENDPOINT}/employees/id/${knoxId}`;
    const res = await axios.get<EmployeeResponse>(url);
    return res.data.employees?.[0];
  } catch {
    return undefined;
  }
}

export type PlatformGroupInfo = {
  Group?: string;
  Language?: 'ko' | 'en';
  Theme?: 'light' | 'dark';
};

export async function getPlatformUserInfo(knoxId: string): Promise<PlatformGroupInfo | undefined> {
  if (!import.meta.env.USER_GROUP_API || !knoxId) return undefined;
  try {
    const url = `${import.meta.env.USER_GROUP_API}/user/Information/${knoxId}`;
    const res = await axios.get<PlatformGroupInfo>(url);
    return res.data;
  } catch {
    return undefined;
  }
}

export async function updatePlatformUserInfo(
  knoxId: string,
  field: string,
  value: string,
): Promise<boolean> {
  if (!import.meta.env.USER_GROUP_API || !knoxId) return false;
  try {
    const url = `${import.meta.env.USER_GROUP_API}/user/${knoxId}/update`;
    const res = await axios.put<boolean>(url, { [field]: value });
    return !!res.data;
  } catch {
    return false;
  }
}
