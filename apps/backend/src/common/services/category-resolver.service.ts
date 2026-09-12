import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * CR-CRM-CATEGORY-MASTER-001 — Category master is the single authoritative
 * source of category identity for CRM.
 *
 * Canonical identity is `Category.id`. The legacy free-text columns
 * (`Lead.category`, `Customer.preferredCategory`) are a DISPLAY SNAPSHOT only:
 * they are derived from the master record server-side and are never accepted as
 * identity from a client.
 *
 * Before this CR the CRM wrote only the free text, from three mutually
 * incompatible hard-coded vocabularies (create dialog used Category master
 * names, the edit dialog used codes such as `FB`/`FASHION`, the filter used
 * Vietnamese labels), so `Lead.categoryId` was null on every row and the edit
 * dialog rendered blank for every lead.
 */
export interface ResolvedCategory {
  id: string;
  code: string;
  name: string;
}

/**
 * Outcome of interpreting a category-bearing write.
 *
 * `undefined` for a field means "do not touch it" — this is what keeps an edit
 * to an unrelated field from erasing the category.
 */
export interface CategoryWriteResolution {
  categoryId?: string | null;
  categoryName?: string | null;
}

@Injectable()
export class CategoryResolverService {
  private readonly logger = new Logger(CategoryResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Load a Category by id and assert it is usable as a CRM classification.
   *
   * An unknown or inactive id is rejected outright so that a failed validation
   * produces ZERO mutation on the owning record (CRM-CAT-006).
   */
  async requireUsableCategory(categoryId: string): Promise<ResolvedCategory> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, code: true, name: true, isActive: true },
    });

    if (!category) {
      throw new BadRequestException(
        `Ngành hàng không tồn tại trong danh mục chuẩn (categoryId=${categoryId}).`,
      );
    }
    if (!category.isActive) {
      throw new BadRequestException(
        `Ngành hàng "${category.name}" đã ngừng sử dụng, không thể gán mới.`,
      );
    }

    return { id: category.id, code: category.code, name: category.name };
  }

  /**
   * Interpret the category portion of a create/update payload.
   *
   * PATCH semantics, per CR §7:
   *   categoryId === undefined  -> unchanged (legacy text may still be written
   *                                 ONLY while the record has no canonical id)
   *   categoryId === null       -> explicit clear of both id and snapshot
   *   categoryId === '<id>'     -> change to that master category; the snapshot
   *                                 is derived from the master, and any text
   *                                 sent alongside it is ignored
   *
   * `existingCategoryId` is the canonical id currently stored on the record
   * (null/undefined on create). Once a record is canonical, free text can no
   * longer move it — that is what stops the old drift from reappearing.
   */
  async resolveForWrite(input: {
    categoryId?: string | null;
    legacyText?: string | null;
    existingCategoryId?: string | null;
    subject?: string;
  }): Promise<CategoryWriteResolution> {
    const { categoryId, legacyText, existingCategoryId, subject = 'record' } = input;

    if (categoryId === null) {
      return { categoryId: null, categoryName: null };
    }

    if (typeof categoryId === 'string' && categoryId.trim() !== '') {
      const category = await this.requireUsableCategory(categoryId.trim());
      if (
        legacyText !== undefined &&
        legacyText !== null &&
        legacyText.trim() !== '' &&
        legacyText.trim() !== category.name
      ) {
        // Never trust a mismatching (categoryId, text) pair — the master wins
        // and the client's text is discarded rather than persisted (CR §15).
        this.logger.warn(
          `Ignoring category text "${legacyText}" on ${subject}: categoryId ${category.id} resolves to "${category.name}".`,
        );
      }
      return { categoryId: category.id, categoryName: category.name };
    }

    // categoryId omitted (or an empty string, which the UI never sends for a
    // real selection). Legacy text stays writable only while the record has no
    // canonical identity, so pre-backfill rows remain correctable by old
    // clients without ever overriding a mapped one.
    if (legacyText !== undefined) {
      if (existingCategoryId) {
        this.logger.warn(
          `Ignoring legacy category text on ${subject}: record is already linked to categoryId ${existingCategoryId}.`,
        );
        return {};
      }
      return { categoryName: legacyText === null || legacyText === '' ? null : legacyText };
    }

    return {};
  }
}
