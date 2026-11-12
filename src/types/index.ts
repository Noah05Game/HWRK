export type Status = 'ordered' | 'in_progress' | 'completed' | 'cancelled';
export const STATUSES: Status[] = ['ordered', 'in_progress', 'completed', 'cancelled'];
export const STATUS_LABEL: Record<Status, string> = { ordered: 'Waiting', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' };

export interface RequestOption { key: string; name: string; description: string; accent: string }

export type SchoolLoginType = 'email' | 'google' | 'microsoft';
export interface UserProfile {
  user_id: string;
  full_name: string;
  school_email: string;
  school_password: string;
  school_name: string;
  school_login_type: SchoolLoginType;
  is_priority: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminAccount {
  user_id: string;
  account_email: string | null;
  school_email: string | null;
  full_name: string | null;
  is_priority: boolean;
  is_banned: boolean;
  has_direct_ban: boolean;
  created_at: string;
}

export interface SubmitPayload {
  dueDate: string; optionKey: string; acceptedTerms: boolean; termsVersion: number; termsText: string;
}
export interface SubmitResult {
  ticketReference: string; optionName: string; dueDate: string; status: Status; trackingToken: string; emailSent: boolean;
  queuePosition: number | null; estimatedSlotAt: string | null; slotReserved: boolean;
}
export interface TrackResult {
  ticketReference: string; optionName: string; accent: string; status: Status; dueDate: string; createdAt: string; updatedAt: string;
  issueReason: string | null; issueReportedAt: string | null;
  queuePosition: number | null; peopleAhead: number | null; estimatedSlotAt: string | null; slotReserved: boolean;
  slotNumber: number | null; slotReservedAt: string | null; processingStartedAt: string | null; slotExpiresAt: string | null;
}
export interface AdminRequest {
  id: string; option_id: string; auth_user_id: string | null; ticket_reference: string; customer_name: string; gmail_email: string; contact_email: string;
  school_name: string; school_login_type: string;
  due_date: string; status: Status; admin_notes: string; issue_reason: string | null; issue_reported_at: string | null;
  terms_version: number | null; terms_text: string | null;
  created_at: string; updated_at: string; slot_number: number | null; slot_reserved_at: string | null;
  processing_started_at: string | null; slot_expires_at: string | null;
  request_options: { key: string; name: string } | null;
}
export interface OptionCapacity {
  option_id: string; option_key: string; option_name: string; accent_colour: string; outstanding_count: number;
  waiting_count: number; reserved_count: number; in_progress_count: number; is_full: boolean;
}
export interface OptionSlot {
  id: string; option_id: string; slot_number: number; current_request_id: string | null;
  reserved_at: string | null; processing_started_at: string | null; expires_at: string | null;
  request?: Pick<AdminRequest, 'id' | 'customer_name' | 'ticket_reference' | 'status'> | null;
}
export interface TermsSettings { terms_text: string; version: number; updated_at: string }
export interface MaintenanceSettings { maintenance_mode: boolean; updated_at: string }
export interface AnnouncementSettings {
  announcement_enabled: boolean;
  announcement_title: string;
  announcement_body: string;
  announcement_background_color: string;
  announcement_text_color: string;
  updated_at: string;
}
export interface HistoryRow { id: string; previous_status: Status | null; new_status: Status; changed_at: string }
export interface EmailLog {
  id: string; email_type: string; recipient: string; delivery_status: 'sent' | 'failed'; error_message: string | null;
  attempts: number; created_at: string;
}
