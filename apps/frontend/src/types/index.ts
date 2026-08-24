import type { CurrencyCode } from '@/lib/currency';
export type { CurrencyCode };
export type Role = 'ADMIN' | 'LEASING_EXECUTIVE' | 'LEASING_MANAGER' | 'MALL_DIRECTOR' | 'FINANCE' | 'LEGAL' | 'OPERATION' | 'TENANT' | 'CEO';
export type UnitStatus = 'VACANT' | 'BOOKING' | 'NEGOTIATING' | 'CONTRACTED' | 'UNDER_FITOUT' | 'OCCUPIED';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';
export type LeadPriority = 'HOT' | 'WARM' | 'COLD';
export type CustomerStatus = 'PROSPECT' | 'NEGOTIATING' | 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED';
export type ActivityType = 'CALL' | 'EMAIL' | 'MEETING' | 'SITE_VISIT' | 'PROPOSAL_SENT' | 'NOTE' | 'OTHER';
export type LeadSource = 'BROKER' | 'WEBSITE' | 'REFERRAL' | 'WALK_IN' | 'EXISTING_TENANT';
export type ContractStatus = 'DRAFT' | 'PENDING_LEGAL' | 'PENDING_SIGNATURE' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'TERMINATING' | 'TERMINATED';
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type TicketStatus = 'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'WAITING_TENANT' | 'RESOLVED' | 'CLOSED';
// Stage code — FK to FitoutStageConfig.code, configurable via admin UI (not a fixed union).
export type FitoutStatus = string;
export type PriceApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  phone?: string;
  department?: string;
  avatar?: string;
  isActive: boolean;
  tenantId?: string | null;
  mallAccess?: { mall: { id: string; name: string } }[];
}

export interface AuthState {
  user: User | null;
  token: string | null;
}

export interface Mall {
  id: string;
  name: string;
  code: string;
  address?: string;
  totalArea?: number;
  isActive: boolean;
}

export interface Floor {
  id: string;
  mallId?: string;
  name: string;
  level: string;
  sortOrder?: number;
  // Digital Map
  floorPlanUrl?: string;
  floorPlanRatio?: number;
}

export interface Zone {
  id: string;
  name: string;
  code?: string;
}

export interface Category {
  id: string;
  code: string;
  name: string;
  description?: string;
  parentId?: string;
  parent?: Category;
  children?: Category[];
  sortOrder: number;
  isActive: boolean;
  _count?: {
    units?: number;
    categoryPricings?: number;
  };
}

export interface CategoryMallPricing {
  id: string;
  mallId: string;
  mall?: Mall;
  categoryId: string;
  category?: Category;
  floorId?: string;
  floor?: Floor;
  zoneId?: string;
  zone?: Zone;
  minRentPerSqm: number | null;
  maxRentPerSqm: number | null;
  suggestedRent?: number | null;
  camPerSqm: number | null;
  effectiveFrom: string;
  effectiveTo?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: User;
}

export interface PriceValidationResult {
  isValid: boolean;
  categoryPricing: CategoryMallPricing | null;
  proposedRentPerSqm: number;
  minRentPerSqm: number;
  maxRentPerSqm: number;
  deviationPercent: number;
  requiresApproval: boolean;
  approvalLevel: 'NONE' | 'MANAGER' | 'DIRECTOR' | 'CEO';
  message: string;
  sources?: Record<string, { ruleId: string; categoryId: string; scope: string } | null>;
}

export interface Tenant {
  id: string;
  companyName: string;
  brandName: string;
  taxCode?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  category?: string;
  isActive: boolean;
}

export interface Unit {
  id: string;
  mallId: string;
  floorId?: string;
  zoneId?: string;
  code: string;
  name?: string;
  areaGFA: number;
  areaNLA: number;
  category?: string;
  categoryId?: string;
  categoryRef?: Category;
  baseRentPerSqm: number;
  camPerSqm: number;
  status: UnitStatus;
  spaceType?: string;
  tier?: string;
  leaseTermType?: string;
  isFlexibleArea?: boolean;
  minFlexArea?: number;
  maxFlexArea?: number;
  tenant?: Tenant;
  floor?: Floor;
  zone?: Zone;
  mall?: Mall;
  leaseStartDate?: string;
  leaseEndDate?: string;
  // Phase 1 & 2: New fields
  marketRentPerSqm?: number;
  askingRentPerSqm?: number;
  escalationRate?: number;
  minLeaseTerm?: number;
  maxLeaseTerm?: number;
  vacantSince?: string;
  lastRenovation?: string;
  condition?: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'NEEDS_RENOVATION';
  features?: {
    ac?: boolean;
    water?: boolean;
    electricity?: boolean;
    facing?: string;
    corner?: boolean;
  };
  virtualTourUrl?: string;
  // Digital Map — position on floor plan (% of image size, 0–100)
  mapPosX?: number;
  mapPosY?: number;
  mapPosW?: number;
  mapPosH?: number;
  mapPolygon?: [number, number][];  // polygon vertices [[x%, y%], ...]
  // Computed fields
  daysVacant?: number;
  daysUntilExpiry?: number;
  totalMonthlyRent?: number;
  // Included relations (for map data)
  media?: UnitMedia[];
}

export type UnitCondition = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'NEEDS_RENOVATION';

export interface FloorMapData extends Floor {
  mall: Mall;
  units: (Unit & {
    zone?: Zone;
    tenant?: Tenant;
    media: UnitMedia[];
  })[];
}

export type UnitHistoryType = 'STATUS_CHANGE' | 'RENT_CHANGE' | 'TENANT_CHANGE' | 'INFO_UPDATE' | 'CONDITION_CHANGE';

export interface UnitHistory {
  id: string;
  unitId: string;
  changeType: UnitHistoryType;
  fieldName?: string;
  oldValue?: unknown;
  newValue?: unknown;
  changedBy?: User;
  notes?: string;
  createdAt: string;
}

export type UnitMediaType = 'PHOTO' | 'FLOOR_PLAN' | 'VIDEO' | 'RENDER_3D' | 'BROCHURE' | 'SITE_MAP';

export interface UnitMedia {
  id: string;
  unitId: string;
  type: UnitMediaType;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  caption?: string;
  sortOrder: number;
  isCover: boolean;
  uploadedBy?: User;
  createdAt: string;
  updatedAt: string;
}

export type BookingStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'CONVERTED';

export interface UnitBooking {
  id: string;
  bookingNumber: string;
  unitId: string;
  unit?: Unit;
  leadId?: string;
  lead?: Lead;
  customerId?: string;
  customer?: Customer;
  status: BookingStatus;
  priority: number;
  requestedArea?: number;
  requestedTerm?: number;
  expectedRent?: number;
  currencyCode?: CurrencyCode;
  proposedRentPerSqm?: number;
  proposedCamPerSqm?: number;
  pricingSnapshot?: Record<string, unknown>;
  priceApprovalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  holdDays: number;
  expiresAt?: string;
  activatedAt?: string;
  convertedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  notes?: string;
  createdBy?: User;
  assignedTo?: User;
  proposal?: Proposal;
  createdAt: string;
  updatedAt: string;
}

export type SlotType = 'KIOSK' | 'PUSHCART' | 'POPUP' | 'EVENT' | 'ADVERTISING' | 'SHORT_TERM' | 'LONG_TERM' | 'FLEXIBLE';

export interface UnitSlot {
  id: string;
  unitId: string;
  slotCode: string;
  code?: string;
  name?: string;
  area: number;
  areaSqm?: number;
  description?: string;
  slotType?: SlotType;
  pricePerDaySqm?: number;
  pricePerHour?: number;
  pricePerSqmMonth?: number;
  fillColor?: string;
  posX: number;
  posY: number;
  posW: number;
  posH: number;
  positionData?: unknown;
  isActive: boolean;
  bookings?: SlotBooking[];
  createdAt: string;
  updatedAt: string;
}

export type SlotBookingType = 'DAY' | 'HOUR' | 'MONTH';
export type SlotBookingStatus = 'PENDING' | 'ACTIVE' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';

export interface SlotBooking {
  id: string;
  slotId: string;
  slot?: UnitSlot;
  bookingRef?: string;
  type: SlotBookingType;
  startDatetime: string;
  endDatetime?: string;
  totalPrice?: number;
  totalAmount?: number;
  leadId?: string;
  lead?: Lead;
  customerId?: string;
  customer?: Customer;
  status: SlotBookingStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UnitSlotSummary {
  unitId: string;
  totalSlots: number;
  vacantSlots: number;
  pendingSlots: number;
  confirmedSlots: number;
  totalSlotArea: number;
  bookedArea: number;
  pendingArea: number;
  vacantArea: number;
}

export interface Lead {
  id: string;
  brandName: string;
  company?: string;
  contactName: string;
  phone?: string;
  email?: string;
  category?: string;
  source: string;
  status: LeadStatus;
  priority: LeadPriority;
  leaseTermType: 'LONG' | 'SHORT';
  assignedTo?: User & { avatar?: string };
  customer?: { id: string; customerCode: string; companyName: string };
  customerId?: string;
  notes?: string;
  expectedArea?: number;
  expectedRent?: number;
  estimatedValue?: number;
  expectedCloseDate?: string;
  position?: number;
  lastActivityAt?: string;
  lostReason?: string;
  _count?: { activities: number; proposals: number };
  createdAt: string;
}

export interface CustomerActivity {
  id: string;
  type: ActivityType;
  subject?: string;
  note: string;
  scheduledAt?: string;
  completedAt?: string;
  outcome?: string;
  createdBy: { id: string; fullName: string };
  createdAt: string;
}

export interface Customer {
  id: string;
  customerCode: string;
  companyName: string;
  brandName?: string;
  taxCode?: string;
  industry?: string;
  contactName: string;
  contactTitle?: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
  source: LeadSource;
  status: CustomerStatus;
  preferredCategory?: string;
  expectedArea?: number;
  budgetMin?: number;
  budgetMax?: number;
  rating?: number;
  assignedTo?: User;
  tenant?: { id: string; brandName: string; companyName: string };
  tenantId?: string;
  notes?: string;
  wonAt?: string;
  lostAt?: string;
  lostReason?: string;
  leads?: Lead[];
  activities?: CustomerActivity[];
  _count?: { leads: number; activities: number };
  createdAt: string;
  updatedAt: string;
}

export interface Proposal {
  id: string;
  proposalNumber: string;
  unit: Unit;
  tenant?: Tenant;
  lead?: { id: string; brandName?: string; contactName?: string };
  booking?: {
    lead?: { id: string; brandName?: string; contactName?: string };
    customer?: { id: string; brandName?: string; companyName?: string };
  };
  area: number;
  term: number;
  startDate: string;
  rentPerSqm: number;
  camPerSqm: number;
  deposit: number;
  monthlyRent: number;
  monthlyCAM: number;
  depositAmount: number;
  totalContractValue: number;
  status: string;
  discount: number;
  // Tờ Trình fields
  businessModel?: string;
  serviceFeeSqm: number;
  businessSupportFeeSqm: number;
  rentCurrency: CurrencyCode;
  fitoutDays: number;
  handoverDate?: string;
  openingDate?: string;
  specialConditions?: string;
  exchangeRate?: number;
  exchangeRateSource?: string;
  // GAP #91–94
  utilityFee: number;
  operatingHours?: string;
  afterHoursFee: number;
  paymentTermDays: number;
  // GAP #41
  depositLease?: number;
  depositFitout: number;
  fitoutFee: number;
  createdAt: string;
  contract?: { id: string; contractNumber: string; status: string };
}

export interface Contract {
  id: string;
  contractNumber: string;
  tenant: Tenant;
  unit: Unit;
  type: string;
  status: ContractStatus;
  startDate: string;
  endDate: string;
  rent: number;
  cam: number;
  deposit: number;
  currencyCode: CurrencyCode;
  // GAP #41
  depositLease?: number;
  depositFitout: number;
  fitoutFee: number;
  // GAP #91, #93
  utilityFee: number;
  afterHoursFee: number;
  operatingHours?: string;
  managedBy?: User;
  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  tenant?: Tenant;
  contract?: Contract;
  serviceContractPayment?: {
    milestone?: string;
    contract?: { id: string; contractNumber: string; title?: string };
  };
  billingParty?: { id: string; name: string; taxCode?: string };
  sourceType?: string;
  sourceId?: string;
  counterpartyName?: string;
  counterpartyTaxCode?: string;
  period: string;
  type: string;
  status: InvoiceStatus;
  totalAmount: number;
  currencyCode?: CurrencyCode;
  dueDate: string;
  issuedAt?: string;
  paidAt?: string;
  totalPaid?: number;
  balance?: number;
  daysOverdue?: number;
  sourceContractNumber?: string;
  sourceContractType?: string;
  sourceStatus?: string;
  sourcePaidAmount?: number;
  sourceTotalAmount?: number;
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  tenant: Tenant;
  unit: Unit;
  type: string;
  priority: string;
  status: TicketStatus;
  subject: string;
  assignedTo?: User;
  createdAt: string;
  slaDueAt?: string;
}

export interface SalesTurnover {
  id: string;
  tenant: Tenant;
  unit: Unit;
  period: string;
  grossSales: number;
  netSales: number;
  transactions: number;
}

export interface DashboardData {
  mallId: string | null;
  focusAreas: string[];
  occupancyRate?: number;
  totalArea?: number;
  vacantArea?: number;
  leasedArea?: number;
  totalTenants?: number;
  monthlyRevenue?: number;
  collectedRevenue?: number;
  overdueAmount?: number;
  overdueCount?: number;
  expiringIn30?: number;
  expiringIn90?: number;
  pendingApprovals?: number;
  openTickets?: number;
  bookingStats?: {
    active: number;
    pending: number;
    expiringSoon: number;
  };
  fromCache?: boolean;
}

export interface Fitout {
  id: string;
  unit: Unit;
  tenant: Tenant;
  status: FitoutStatus;
  permitNumber?: string;
  startDate?: string;
  deadline?: string;
  completedSteps: number;
  totalSteps: number;
}

export interface TicketComment {
  id: string;
  text: string;
  author: User;
  createdAt: string;
}

export interface SapLog {
  id: string;
  type: string;
  entity: string;
  direction: string;
  status: string;
  message?: string;
  requestPayload?: string;
  responsePayload?: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  type?: string;
}

export interface ArAgingRow {
  tenant?: Tenant;
  billingParty?: { id: string; name: string; taxCode?: string };
  counterpartyName?: string;
  currencyCode?: CurrencyCode;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days90plus: number;
  total: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
