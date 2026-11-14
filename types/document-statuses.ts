export const statuses = [
  { value: 'all', label: 'All Statuses', color: 'text-slate-300', dot: 'bg-slate-300' },
  { value: 'draft', label: 'Draft', color: 'text-gray-400', dot: 'bg-gray-400' },
  { value: 'saved', label: 'Saved', color: 'text-purple-400', dot: 'bg-purple-400' },
  { value: 'sent', label: 'Sent', color: 'text-indigo-500', dot: 'bg-indigo-500' },
  { value: 'viewed', label: 'Viewed', color: 'text-sky-400', dot: 'bg-sky-400' },
  { value: 'in_progress', label: 'In Progress', color: 'text-amber-500', dot: 'bg-amber-500' },
  { value: 'completed', label: 'Completed', color: 'text-green-600', dot: 'bg-green-600' },
  { value: 'rejected', label: 'Rejected', color: 'text-rose-500', dot: 'bg-rose-500' },
  { value: 'delivery_failed', label: 'Delivery Failed', color: 'text-red-500', dot: 'bg-red-500' },
  { value: 'expired', label: 'Expired', color: 'text-zinc-400', dot: 'bg-zinc-400' },
  { value: 'cancelled', label: 'Cancelled', color: 'text-neutral-400', dot: 'bg-neutral-400' },
  { value: 'voided', label: 'Voided', color: 'text-neutral-400', dot: 'bg-neutral-400' },
] as const;
