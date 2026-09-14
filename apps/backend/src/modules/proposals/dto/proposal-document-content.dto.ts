import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEmail,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MAX_IMAGE_DATA_URL_LENGTH,
  PROPOSAL_DOCUMENT_ITEM_KEYS,
} from '../document/proposal-document.mapper';
import type { ProposalDocumentItemKey } from '../document/proposal-document.types';

/**
 * CR-PROPOSAL-DOCUMENT-SOURCE-001 — the only way content reaches
 * Proposal.editorContent.
 *
 * The endpoint this replaces took `{ editorContent: any }` and stored it
 * verbatim, so any field of a Tờ trình — rent, area, signatories — could be
 * typed over. This DTO names what an author may write; business facts are not
 * in it and are recomputed on every read.
 */

const IMAGE_DATA_URL = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

export class ProposalDocumentItemOverrideDto {
  @ApiProperty({ enum: PROPOSAL_DOCUMENT_ITEM_KEYS })
  @IsIn(PROPOSAL_DOCUMENT_ITEM_KEYS)
  key!: ProposalDocumentItemKey;

  /** null or absent keeps the template wording. Rejected on fact-only rows. */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  narrativeText?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ProposalDocumentEditableContentDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  docNumber?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '2026-09-14' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { message: 'documentDate phải có dạng YYYY-MM-DD' })
  documentDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  subject?: string | null;

  @ApiPropertyOptional({ type: [String], nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  preamble?: string[] | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  bodyIntro?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  closingLine?: string | null;

  @ApiPropertyOptional({ type: [ProposalDocumentItemOverrideDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PROPOSAL_DOCUMENT_ITEM_KEYS.length)
  @ValidateNested({ each: true })
  @Type(() => ProposalDocumentItemOverrideDto)
  items?: ProposalDocumentItemOverrideDto[];

  @ApiPropertyOptional({ enum: PROPOSAL_DOCUMENT_ITEM_KEYS, isArray: true, nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PROPOSAL_DOCUMENT_ITEM_KEYS.length)
  @IsIn(PROPOSAL_DOCUMENT_ITEM_KEYS, { each: true })
  itemOrder?: ProposalDocumentItemKey[] | null;

  /** PNG or JPEG only: pdfmake cannot embed other formats, and a WebP here
   *  used to break PDF generation for the whole Proposal. */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_IMAGE_DATA_URL_LENGTH)
  @Matches(IMAGE_DATA_URL, { message: 'Logo phải là ảnh PNG hoặc JPEG' })
  logoDataUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_IMAGE_DATA_URL_LENGTH)
  @Matches(IMAGE_DATA_URL, { message: 'Ảnh layout phải là PNG hoặc JPEG' })
  layoutImageDataUrl?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '#1a237e' })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'primaryColor phải có dạng #RRGGBB' })
  primaryColor?: string | null;
}

export class SaveProposalDocumentContentDto {
  /** contentVersion the author loaded; 0 when nothing v2 was saved yet. */
  @ApiProperty()
  @IsInt()
  @Min(0)
  expectedContentVersion!: number;

  /** sync.sourceFingerprint of the facts the author reviewed. */
  @ApiProperty()
  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  reviewedFingerprint!: string;

  @ApiProperty({ type: ProposalDocumentEditableContentDto })
  @ValidateNested()
  @Type(() => ProposalDocumentEditableContentDto)
  content!: ProposalDocumentEditableContentDto;
}

/**
 * Optional on submit. When the author submits from the document, this is the
 * fingerprint they reviewed; a Proposal that changed since is refused as stale.
 */
export class SubmitProposalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  reviewedFingerprint?: string;
}

/** CR-PROPOSAL-DOCUMENT-FINALIZATION — sending an approved Tờ trình outside the company. */
export class SendProposalDocumentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  documentVersionId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true, message: 'Email người nhận không hợp lệ' })
  to!: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true, message: 'Email CC không hợp lệ' })
  cc?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  message?: string;
}
