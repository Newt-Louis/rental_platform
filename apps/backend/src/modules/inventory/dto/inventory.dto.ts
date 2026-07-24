import { InventoryItemType, InventoryTransactionType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class CreateInventoryCategoryDto {
  @IsString() mallId: string;
  @IsString() code: string;
  @IsString() name: string;
  @IsEnum(InventoryItemType) itemType: InventoryItemType;
  @IsOptional() @IsString() description?: string;
}

export class CreateInventoryItemDto {
  @IsString() mallId: string;
  @IsString() categoryId: string;
  @IsString() sku: string;
  @IsString() name: string;
  @IsEnum(InventoryItemType) itemType: InventoryItemType;
  @IsString() unit: string;
  @IsOptional() @IsString() specification?: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minStock?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateInventoryTransactionDto {
  @IsString() itemId: string;
  @IsEnum(InventoryTransactionType) type: InventoryTransactionType;
  @Type(() => Number) @IsNumber() @IsPositive() quantity: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitCost?: number;
  @IsOptional() @IsDateString() transactionAt?: string;
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsString() recipient?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() referenceNo?: string;
  @IsOptional() @IsString() purpose?: string;
  @IsOptional() @IsString() notes?: string;
}
