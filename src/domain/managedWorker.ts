export type ManagedWorker = {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  jobTitle: string;
  notes: string;
  employeeCode: string;
  suspended: boolean;
  accountStatus: string;
  bannedUntil: string | null;
  createdAt: string | null;
};

export function managedWorkerFromJson(j: Record<string, unknown>): ManagedWorker {
  return {
    id: String(j.id ?? ''),
    email: String(j.email ?? ''),
    fullName: String(j.full_name ?? ''),
    phone: String(j.phone ?? ''),
    jobTitle: String(j.job_title ?? ''),
    notes: String(j.notes ?? ''),
    employeeCode: String(j.employee_code ?? ''),
    suspended: j.suspended === true,
    accountStatus: String(j.account_status ?? ''),
    bannedUntil: j.banned_until != null ? String(j.banned_until) : null,
    createdAt: j.created_at != null ? String(j.created_at) : null,
  };
}

export function managedWorkerDisplayName(w: ManagedWorker): string {
  const n = w.fullName.trim();
  if (n.length > 0) return n;
  return w.email.length > 0 ? w.email : 'Trabajador';
}
