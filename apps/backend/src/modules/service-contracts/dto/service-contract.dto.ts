import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ServiceContractStatus, ServiceContractType } from '@prisma/client';

const PAYMENT_DIRECTIONS = ['PAYABLE', 'RECEIVABLE'] as const;
const PAYMENT_STATUSES = ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'] as const;
const MILESTONE_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
const RECURRING_FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'ANNUALLY'] as const;

export class CreateServiceContractDto {
  @IsOptional() @IsString() @MaxLength(100) contractNumber?: string;
  @IsString() @MaxLength(250) title: string;
  @IsString() mallId: string;
  @IsString() @MaxLength(250) counterpartyName: string;
  @IsOptional() @IsString() @MaxLength(100) counterpartyTax?: string;
  @IsOptional() @IsEmail() counterpartyEmail?: string;
  @IsOptional() @IsString() @MaxLength(50) counterpartyPhone?: string;
  @IsOptional() @IsString() @MaxLength(500) counterpartyAddress?: string;
  @IsOptional() @IsEnum(ServiceContractType) type?: ServiceContractType;
  @IsOptional() @IsDateString() signedDate?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) totalValue?: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsIn(PAYMENT_DIRECTIONS) paymentDirection?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) invoiceLeadDays?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) defaultVatRate?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) paymentTermDays?: number;
  @IsOptional() @IsString() @MaxLength(250) productName?: string;
  @IsOptional() @IsString() @MaxLength(100) workflowStage?: string;
  @IsOptional() @IsString() @MaxLength(30) workflowColor?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsString() @MaxLength(1000) tags?: string;
}

export class UpdateServiceContractDto {
  @IsOptional() @IsString() @MaxLength(100) contractNumber?: string;
  @IsOptional() @IsString() @MaxLength(250) title?: string;
  @IsOptional() @IsString() @MaxLength(250) counterpartyName?: string;
  @IsOptional() @IsString() @MaxLength(100) counterpartyTax?: string;
  @IsOptional() @IsEmail() counterpartyEmail?: string;
  @IsOptional() @IsString() @MaxLength(50) counterpartyPhone?: string;
  @IsOptional() @IsString() @MaxLength(500) counterpartyAddress?: string;
  @IsOptional() @IsEnum(ServiceContractType) type?: ServiceContractType;
  @IsOptional() @IsDateString() signedDate?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) totalValue?: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsIn(PAYMENT_DIRECTIONS) paymentDirection?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) invoiceLeadDays?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) defaultVatRate?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) paymentTermDays?: number;
  @IsOptional() @IsString() @MaxLength(250) productName?: string;
  @IsOptional() @IsString() @MaxLength(100) workflowStage?: string;
  @IsOptional() @IsString() @MaxLength(30) workflowColor?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsString() @MaxLength(1000) tags?: string;
}

export class UpdateServiceContractStatusDto {
  @IsEnum(ServiceContractStatus) status: ServiceContractStatus;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

export class CreateServiceContractPaymentDto {
  @IsString() @MaxLength(250) milestone: string;
  @IsDateString() dueDate: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subtotal?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) vatRate?: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) reminderDays?: number;
  @IsOptional() @IsString() @MaxLength(30) periodType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) periodNumber?: number;
  @IsOptional() @IsDateString() periodStart?: string;
  @IsOptional() @IsDateString() periodEnd?: string;
  @IsOptional() @IsDateString() invoicePlannedDate?: string;
  @IsOptional() @IsString() @MaxLength(100) invoiceNumber?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateServiceContractPaymentDto {
  @IsOptional() @IsString() @MaxLength(250) milestone?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) paidAmount?: number;
  @IsOptional() @IsDateString() paidDate?: string;
  @IsOptional() @IsIn(PAYMENT_STATUSES) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) reminderDays?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreateRecurringPaymentsDto {
  @IsDateString() startDate: string;
  @IsIn(RECURRING_FREQUENCIES) frequency: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(120) count: number;
  @IsString() @MaxLength(200) milestonePrefix: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subtotal?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) vatRate?: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) reminderDays?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreateChecklistItemDto {
  @IsString() @MaxLength(250) title: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) order?: number;
}

export class UpdateChecklistItemDto {
  @IsOptional() @IsString() @MaxLength(250) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) order?: number;
  @IsOptional() @IsBoolean() isCompleted?: boolean;
}

export class CreateMilestoneDto extends CreateChecklistItemDto {}

export class UpdateMilestoneDto {
  @IsOptional() @IsString() @MaxLength(250) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) order?: number;
  @IsOptional() @IsIn(MILESTONE_STATUSES) status?: string;
}

export class RenewServiceContractDto {
  @IsOptional() @IsString() @MaxLength(100) contractNumber?: string;
  @IsOptional() @IsString() @MaxLength(250) title?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsDateString() endDate: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) totalValue?: number;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}
