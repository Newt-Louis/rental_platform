import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ServiceContractStatus, ServiceContractType } from '@prisma/client';

export class CreateServiceContractDto {
  @IsOptional() @IsString() @MaxLength(100) contractNumber?: string;
  @IsString() @MaxLength(250) title: string;
  @IsString() mallId: string;
  @IsString() @MaxLength(250) counterpartyName: string;
  @IsOptional() @IsString() counterpartyTax?: string;
  @IsOptional() @IsEmail() counterpartyEmail?: string;
  @IsOptional() @IsString() counterpartyPhone?: string;
  @IsOptional() @IsString() counterpartyAddress?: string;
  @IsOptional() @IsEnum(ServiceContractType) type?: ServiceContractType;
  @IsOptional() @IsEnum(ServiceContractStatus) status?: ServiceContractStatus;
  @IsOptional() @IsDateString() signedDate?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) totalValue?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() paymentDirection?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) invoiceLeadDays?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) defaultVatRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) paymentTermDays?: number;
  @IsOptional() @IsString() productName?: string;
  @IsOptional() @IsString() workflowStage?: string;
  @IsOptional() @IsString() workflowColor?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() parentContractId?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() tags?: string;
}

export class UpdateServiceContractStatusDto {
  @IsEnum(ServiceContractStatus) status: ServiceContractStatus;
  @IsOptional() @IsString() description?: string;
}
