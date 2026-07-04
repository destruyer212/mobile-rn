import { getSupabaseClient } from '@fleet/shared-lib';
import type { ManagedWorker } from '@fleet/shared-domain';
import { managedWorkerFromJson } from '@fleet/shared-domain';

const FN = 'admin-manage-workers';

export class WorkerAdminRepository {
  async listWorkers(): Promise<ManagedWorker[]> {
    try {
      const { data, error } = await getSupabaseClient().functions.invoke(FN, {
        body: { action: 'list' },
      });
      if (error) {
        throw new Error(error.message);
      }
      const payload = data as Record<string, unknown> | null;
      if (!payload || typeof payload !== 'object') {
        throw new Error('Respuesta invalida del servidor.');
      }
      if (payload.error) {
        throw new Error(String(payload.error));
      }
      const raw = payload.workers;
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
        .map(managedWorkerFromJson);
    } catch {
      return this.listWorkersFromProfiles();
    }
  }

  async createWorker(params: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    jobTitle?: string;
    notes?: string;
    employeeCode?: string;
  }): Promise<void> {
    await this.invoke({
      action: 'create',
      email: params.email.trim(),
      password: params.password,
      full_name: params.fullName.trim(),
      phone: (params.phone ?? '').trim(),
      job_title: (params.jobTitle ?? '').trim(),
      notes: (params.notes ?? '').trim(),
      employee_code: (params.employeeCode ?? '').trim(),
    });
  }

  async updateWorker(params: {
    userId: string;
    email: string;
    password?: string;
    fullName: string;
    phone?: string;
    jobTitle?: string;
    notes?: string;
    employeeCode?: string;
  }): Promise<void> {
    const body: Record<string, unknown> = {
      action: 'update',
      user_id: params.userId,
      email: params.email.trim(),
      full_name: params.fullName.trim(),
      phone: (params.phone ?? '').trim(),
      job_title: (params.jobTitle ?? '').trim(),
      notes: (params.notes ?? '').trim(),
      employee_code: (params.employeeCode ?? '').trim(),
    };
    if (params.password != null && params.password.length > 0) {
      body.password = params.password;
    }
    await this.invokeOrUpdateProfile(body, params);
  }

  async setSuspended(userId: string, suspended: boolean): Promise<void> {
    await this.invokeOrSetProfileStatus({
      action: 'set_status',
      user_id: userId,
      suspended,
    });
  }

  async deleteWorker(userId: string): Promise<void> {
    try {
      await this.invoke({
        action: 'delete',
        user_id: userId,
      });
      return;
    } catch {
      const { error } = await getSupabaseClient()
        .from('profiles')
        .update({
          account_status: 'deleted',
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', userId);
      if (error) throw error;
    }
  }

  private async invoke(body: Record<string, unknown>): Promise<void> {
    const { data, error } = await getSupabaseClient().functions.invoke(FN, { body });
    if (error) {
      throw new Error(error.message);
    }
    const payload = data as Record<string, unknown> | null;
    if (payload && payload.error) {
      throw new Error(String(payload.error));
    }
  }

  private async invokeOrUpdateProfile(
    body: Record<string, unknown>,
    params: {
      userId: string;
      email: string;
      fullName: string;
      phone?: string;
      jobTitle?: string;
      notes?: string;
      employeeCode?: string;
    },
  ): Promise<void> {
    try {
      await this.invoke(body);
      return;
    } catch {
      const { error } = await getSupabaseClient()
        .from('profiles')
        .update({
          email: params.email.trim(),
          full_name: params.fullName.trim(),
          phone: (params.phone ?? '').trim(),
          job_title: (params.jobTitle ?? '').trim(),
          notes: (params.notes ?? '').trim(),
          employee_code: (params.employeeCode ?? '').trim(),
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', params.userId);
      if (error) throw error;
    }
  }

  private async invokeOrSetProfileStatus(body: Record<string, unknown>): Promise<void> {
    try {
      await this.invoke(body);
      return;
    } catch {
      const userId = String(body.user_id ?? '');
      const suspended = body.suspended === true;
      const { error } = await getSupabaseClient()
        .from('profiles')
        .update({
          account_status: suspended ? 'suspended' : 'active',
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', userId);
      if (error) throw error;
    }
  }

  private async listWorkersFromProfiles(): Promise<ManagedWorker[]> {
    const { data, error } = await getSupabaseClient()
      .from('profiles')
      .select('id,email,full_name,phone,job_title,notes,employee_code,account_status,created_at')
      .eq('role', 'worker')
      .order('full_name', { ascending: true });
    if (error) {
      const retry = await getSupabaseClient()
        .from('profiles')
        .select('id,email,full_name,phone,job_title,notes,employee_code,created_at')
        .eq('role', 'worker')
        .order('full_name', { ascending: true });
      if (retry.error) throw retry.error;
      return this.mapProfileRowsToWorkers(retry.data ?? []);
    }

    return this.mapProfileRowsToWorkers(data ?? []);
  }

  private mapProfileRowsToWorkers(rows: unknown[]): ManagedWorker[] {
    return rows
      .map((raw) => {
        const row = raw as Record<string, unknown>;
        const accountStatus = String(row.account_status ?? 'active').trim().toLowerCase();
        return {
          id: String(row.id ?? ''),
          email: String(row.email ?? ''),
          fullName: String(row.full_name ?? ''),
          phone: String(row.phone ?? ''),
          jobTitle: String(row.job_title ?? ''),
          notes: String(row.notes ?? ''),
          employeeCode: String(row.employee_code ?? ''),
          suspended: accountStatus === 'suspended',
          accountStatus,
          bannedUntil: null,
          createdAt: row.created_at != null ? String(row.created_at) : null,
        };
      })
      .filter((worker) => worker.accountStatus !== 'deleted');
  }
}
