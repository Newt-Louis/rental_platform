// Shared types between frontend and backend
// Used for API contracts

export type Role =
  | 'ADMIN'
  | 'LEASING_EXECUTIVE'
  | 'LEASING_MANAGER'
  | 'MALL_DIRECTOR'
  | 'FINANCE'
  | 'LEGAL'
  | 'OPERATION'
  | 'TENANT'
  | 'CEO';

export type UnitStatus = 'VACANT' | 'BOOKING' | 'NEGOTIATING' | 'CONTRACTED' | 'UNDER_FITOUT' | 'OCCUPIED';

export type LeadSource = 'BROKER' | 'WEBSITE' | 'REFERRAL' | 'WALK_IN' | 'EXISTING_TENANT';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';

export type ProposalStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'CONVERTED';

export type ContractType = 'LOI' | 'LEASE_AGREEMENT' | 'APPENDIX' | 'RENEWAL' | 'TERMINATION';
export type ContractStatus =
  | 'DRAFT'
  | 'PENDING_LEGAL'
  | 'PENDING_SIGNATURE'
  | 'ACTIVE'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'TERMINATED';

export type FitoutStatus =
  | 'CONTRACT_SIGNED'
  | 'SUBMIT_DESIGN'
  | 'DESIGN_REVIEW'
  | 'FIRE_SAFETY_REVIEW'
  | 'CONSTRUCTION_PERMIT'
  | 'FITOUT_IN_PROGRESS'
  | 'INSPECTION'
  | 'APPROVED_TO_OPEN'
  | 'OPENED';

export type TicketType =
  | 'ELECTRICAL'
  | 'WATER'
  | 'HVAC'
  | 'CLEANING'
  | 'SECURITY'
  | 'PARKING'
  | 'INTERNET'
  | 'DELIVERY'
  | 'MARKETING_EVENT'
  | 'OTHER';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TicketStatus = 'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'WAITING_TENANT' | 'RESOLVED' | 'CLOSED';

export type InvoiceType =
  | 'MONTHLY_RENT'
  | 'DEPOSIT'
  | 'UTILITY'
  | 'MARKETING_FEE'
  | 'PARKING'
  | 'PENALTY'
  | 'REVENUE_SHARE';

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type PaymentMethod = 'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | 'ONLINE';

// API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Discount approval rules
export const APPROVAL_RULES = {
  LEASING_MANAGER_MAX_DISCOUNT: 5,
  MALL_DIRECTOR_MAX_DISCOUNT: 10,
  MAX_RENT_FREE_WITHOUT_CEO: 60, // days
} as const;

// SLA by ticket priority (hours)
export const TICKET_SLA = {
  URGENT: 4,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 72,
} as const;

// Lease alert thresholds (days before expiry)
export const LEASE_ALERT_DAYS = [180, 90, 60, 30] as const;

// VAT rate
export const DEFAULT_VAT_RATE = 10; // %

// Billing
export const DEFAULT_PAYMENT_TERM = 30; // days
export const DEFAULT_DEPOSIT_MONTHS = 3;
