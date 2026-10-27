import type { ScheduleStatus } from '@/types/domain';

export const scheduleLabels: Record<ScheduleStatus, string> = {
  COMPLETED: 'Complete', SCHEDULED: 'Scheduled', PAYMENT_BLOCKED: 'Payment blocked',
  READY_TO_PROMOTE: 'Ready to release', BLOCKED_BY_DEPENDENCY: 'Awaiting predecessor',
  REROUTED_ACTIVE: 'Rerouted · active', MATERIALS_ORDERED: 'Materials ordered',
};

export function statusTone(status: string) {
  if (['PAYMENT_BLOCKED', 'OVERDUE', 'BLOCK', 'BLOCKED'].includes(status)) return 'danger';
  if (['READY_TO_PROMOTE', 'PARTIALLY_PAID', 'REQUIRE_APPROVAL', 'PROPOSED'].includes(status)) return 'warning';
  if (['COMPLETED', 'PAID', 'ALLOW', 'EXECUTED', 'APPROVED'].includes(status)) return 'success';
  if (['REROUTED_ACTIVE', 'MATERIALS_ORDERED'].includes(status)) return 'info';
  return 'neutral';
}

export function humanize(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
}

export function Status({ value, label }: { value: string; label?: string }) {
  return <span className={`state-label tone-${statusTone(value)}`}><span aria-hidden="true" />{label ?? scheduleLabels[value as ScheduleStatus] ?? humanize(value)}</span>;
}

export function shortDate(value?: string) {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function phaseName(name: string) { return name.replace(/^Phase\s+\d+:\s*/i, ''); }
