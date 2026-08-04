export type TicketStatus =
  | 'open'
  | 'in_progress'
  | 'waiting_on_merchant'
  | 'resolved'
  | 'closed'

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'

export type TicketScope = 'merchant' | 'hq_internal'

export type TicketCategory =
  | 'general'
  | 'billing'
  | 'hardware'
  | 'pos_app'
  | 'menu'
  | 'payments'
  | 'kitchen'
  | 'feature_request'
  | 'onboarding'

export type MessageSenderRole = 'merchant' | 'carrier' | 'admin'

export interface SupportTicket {
  id: string
  ticket_number: string
  ticket_scope: TicketScope
  merchant_id: string | null
  location_id: string | null
  submitted_by: string
  submitted_by_name: string
  submitted_by_email: string | null
  carrier_id: string | null
  subject: string
  description: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  assigned_to: string | null
  assigned_to_emails: string[]
  assigned_to_name: string | null
  assigned_at: string | null
  resolved_at: string | null
  resolved_by: string | null
  resolution_notes: string | null
  created_at: string
  updated_at: string
  last_message_at: string
  first_response_at: string | null
  metadata: Record<string, unknown>
  tags: string[]
}

export interface SupportTicketAttachment {
  id: string
  ticket_id: string
  message_id: string | null
  uploaded_by: string
  file_name: string
  file_path: string
  file_size: number
  file_type: string
  created_at: string
}

export interface SupportTicketAttachmentWithUrl extends SupportTicketAttachment {
  signed_url?: string
}

/** Passed from the client after direct-upload to Supabase Storage */
export interface AttachmentInput {
  file_name: string
  file_path: string
  file_size: number
  file_type: string
}

export interface SupportTicketMessage {
  id: string
  ticket_id: string
  sender_id: string
  sender_name: string
  sender_role: MessageSenderRole
  message: string
  is_internal: boolean
  created_at: string
  edited_at: string | null
  read_by_merchant: boolean
  read_by_admin: boolean
  attachments?: SupportTicketAttachmentWithUrl[]
}

export interface SupportTicketWithMessages extends SupportTicket {
  messages: SupportTicketMessage[]
  attachments?: SupportTicketAttachment[]
  location?: { id: string; name: string } | null
  merchant?: { id: string; name: string; clerk_org_id: string } | null
}

export interface SupportDashboardStats {
  open_count: number
  unassigned_count: number
  avg_first_response_hours: number
  avg_resolution_hours: number
  tickets_today: number
}

export interface TicketFilters {
  status?: TicketStatus | 'all'
  ticket_scope?: TicketScope | 'all'
  category?: TicketCategory | 'all'
  priority?: TicketPriority | 'all'
  assigned_to?: string | 'unassigned' | 'all'
  merchant_id?: string
  location_id?: string
  date_from?: string
  date_to?: string
  search?: string
}

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  general: 'General Question',
  billing: 'Billing & Account',
  hardware: 'Hardware & Devices',
  pos_app: 'POS App Issue',
  menu: 'Menu & Products',
  payments: 'Payment Processing',
  kitchen: 'Kitchen Display',
  feature_request: 'Feature Request',
  onboarding: 'Setup & Onboarding',
}

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  waiting_on_merchant: 'Waiting on Merchant',
  resolved: 'Resolved',
  closed: 'Closed',
}

export function getTicketStatusLabel(
  status: TicketStatus,
  scope: TicketScope,
): string {
  if (scope === 'hq_internal' && status === 'waiting_on_merchant') {
    return 'Waiting on Reporter'
  }

  return TICKET_STATUS_LABELS[status]
}

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

export const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  open: 'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-green-100 text-green-700 border-green-200',
  waiting_on_merchant: 'bg-amber-100 text-amber-700 border-amber-200',
  resolved: 'bg-gray-100 text-gray-600 border-gray-200',
  closed: 'bg-gray-100 text-gray-500 border-gray-200',
}

export const TICKET_PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: 'bg-gray-100 text-gray-600',
  normal: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}
