import { getSupabaseClient } from '@fleet/shared-lib';
import type { ManagedWorker } from '@fleet/shared-domain';
import { managedWorkerFromJson } from '@fleet/shared-domain';

const FN = 'admin-manage-workers';

export class WorkerAdminRepository {
  async listWorkers(): Promise<ManagedWorker[]> {
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
    await this.invoke(body);
  }

  async setSuspended(userId: string, suspended: boolean): Promise<void> {
    await this.invoke({
      action: 'set_status',
      user_id: userId,
      suspended,
    });
  }

  async deleteWorker(userId: string): Promise<void> {
    await this.invoke({
      action: 'delete',
      user_id: userId,
    });
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
}
