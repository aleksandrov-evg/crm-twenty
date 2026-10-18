export type StudioCalendarOperationState =
  | 'PENDING'
  | 'RUNNING'
  | 'RETRY'
  | 'SUCCEEDED'
  | 'CONFLICT'
  | 'FAILED'
  | 'SUPERSEDED';

export type StudioCalendarOperationAction =
  | 'IMPORT_EVENT'
  | 'EXPORT_EVENT'
  | 'RECONCILE_RESOURCE';

export type CalendarOperation = {
  id: string;
  workspaceId: string;
  connectionId: string;
  resourceKey: string;
  idempotencyKey: string;
  action: StudioCalendarOperationAction;
  payload: Record<string, unknown>;
  state: StudioCalendarOperationState;
  attempts: number;
  leaseGeneration: number;
  leaseUntil: Date | null;
  nextAttemptAt: Date;
  requiresReconciliation: boolean;
  errorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};
