export type Status = 'ordered' | 'in_progress' | 'completed';
export const STATUSES: Status[] = ['ordered', 'in_progress', 'completed'];
export const STATUS_LABEL: Record<Status, string> = { ordered: 'Ordered', in_progress: 'In Progress', completed: 'Completed' };

export interface RequestOption { key: string; name: string; description: string; accent: string }

export interface SubmitPayload {
  fullName: string; gmail: string; contactEmail: string; servicePassword: string; dueDate: string; optionKey: string;
}
export interface SubmitResult {
  ticketReference: string; optionName: string; dueDate: string; status: Status; trackingToken: string; emailSent: boolean;
}
export interface TrackResult {
  ticketReference: string; optionName: string; accent: string; status: Status; dueDate: string; createdAt: string; updatedAt: string;
  issueReason: string | null; issueReportedAt: string | null;
}

export interface AdminRequest {
  id: string; ticket_reference: string; customer_name: string; gmail_email: string; contact_email: string;
  due_date: string; status: Status; admin_notes: string; issue_reason: string | null; issue_reported_at: string | null;
  created_at: string; updated_at: string;
  request_options: { name: string } | null;
}
export interface HistoryRow { id: string; previous_status: Status | null; new_status: Status; changed_at: string }
export interface EmailLog {
  id: string; email_type: string; recipient: string; delivery_status: 'sent' | 'failed'; error_message: string | null;
  attempts: number; created_at: string;
}
