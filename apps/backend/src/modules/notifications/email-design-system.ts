import { CurrencyCode } from '@prisma/client';
import { CURRENCIES } from '../../common/constants/currency.constants';

/**
 * THISO Leasing — email design system.
 *
 * Every transactional email in the platform renders through here. Before this,
 * each template carried its own <style> block, its own palette and its own idea
 * of hierarchy, and none of them escaped interpolated business strings.
 *
 * Constraints this file exists to hold in one place:
 *
 * - **Outlook.** Desktop Outlook renders through Word, so layout is tables with
 *   inline styles. The old templates used `display:flex` for every label/value
 *   row, which collapses to stacked full-width text there — the single biggest
 *   cause of the "raw system HTML" look being fixed.
 * - **Escaping.** Tenant names, unit codes, ticket subjects and contract numbers
 *   are business data that reached these templates unescaped. Everything now
 *   goes through `esc()`.
 * - **Currency.** No amount is ever labelled with a currency the caller did not
 *   supply. See `money()`.
 *
 * Documented in `docs/EMAIL_DESIGN_SYSTEM.md`.
 */

// ─── Tokens ──────────────────────────────────────────────────────────────────

/**
 * Taken from the application's own light theme (`apps/frontend/src/index.css`),
 * converted from HSL: `--primary: 221 83% 41%` is #1249BF, `--foreground` is
 * #171717, `--border` is #E6E6E6. Email cannot read CSS variables, so the values
 * are frozen here rather than re-invented per template.
 */
export const EMAIL_COLORS = {
  EMAIL_BG: '#F5F6F8',
  CARD_BG: '#FFFFFF',
  TEXT_PRIMARY: '#171717',
  TEXT_SECONDARY: '#5B6472',
  TEXT_MUTED: '#8A93A0',
  BORDER: '#E5E7EB',
  BORDER_SOFT: '#F0F1F4',
  SURFACE: '#F8F9FB',
  BRAND_PRIMARY: '#1249BF',
} as const;

export type EmailSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

/**
 * Severity is a presentation layer over business state, never a source of it.
 * A template maps its own domain rule (e.g. the contract-expiry day thresholds
 * that already live in `contract-expiry.scheduler.ts`) onto one of these; this
 * file does not decide what is urgent.
 *
 * `accent` is used for text and the CTA on light backgrounds; all four clear
 * 4.5:1 against #FFFFFF.
 */
export const SEVERITY: Record<EmailSeverity, { accent: string; tint: string; label: string }> = {
  INFO: { accent: '#1249BF', tint: '#EEF3FD', label: 'THÔNG TIN' },
  SUCCESS: { accent: '#04724D', tint: '#EBFBF3', label: 'HOÀN TẤT' },
  WARNING: { accent: '#9A5B06', tint: '#FEF6E7', label: 'CẦN XỬ LÝ' },
  CRITICAL: { accent: '#B3261E', tint: '#FDEDEC', label: 'KHẨN CẤP' },
};

const FONT = "Arial, Helvetica, 'Segoe UI', 'Helvetica Neue', sans-serif";

// ─── Primitives ──────────────────────────────────────────────────────────────

/**
 * Every interpolated business string goes through this. Tenant names, unit
 * codes and ticket subjects are user-controlled; an unescaped `<` in a brand
 * name was enough to break or inject markup in the previous templates.
 */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Vietnam-facing business email: DD/MM/YYYY, never a raw ISO timestamp. */
export function formatDateVN(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('day')}/${part('month')}/${part('year')}`;
}

/** Rendered when an amount reaches a template without a proven currency. */
export const UNKNOWN_CURRENCY_LABEL = 'chưa xác định đơn vị tiền tệ';

/**
 * Money in email, with the platform's standing rule enforced at the boundary:
 * **an absent currency is never rendered as VND.**
 *
 * The templates previously did
 * `formatMoneyWithCode(amount, currency ?? DEFAULT_CURRENCY_CODE)`.
 * `Invoice.currencyCode` and `Proposal.rentCurrency` are NOT NULL in the schema,
 * so that fallback could only ever fire when the *lookup* failed — meaning it
 * stamped "VND" on the strength of a failed query rather than on data. A tenant
 * holding a USD invoice would have been shown a dong figure.
 *
 * `currencyCode` is therefore a required parameter that may be explicitly null.
 * Null renders the number with the unit named as unknown, which is visibly wrong
 * to a human and cannot be mistaken for a correct dong amount.
 */
export function money(amount: number, currencyCode: CurrencyCode | null | undefined): string {
  const decimals = currencyCode ? CURRENCIES[currencyCode]?.decimalPlaces ?? 0 : 0;
  const formatted = new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
  if (!currencyCode) return `${formatted} (${UNKNOWN_CURRENCY_LABEL})`;
  return `${formatted} ${currencyCode}`;
}

// ─── Environment / subject / links ───────────────────────────────────────────

/**
 * The environment label comes from configuration, never from a template. A
 * template that hardcodes "[TEST]" leaks into production the moment someone
 * forgets to strip it.
 *
 * `APP_ENV` unset or `production` produces no prefix.
 */
export function environmentTag(): string | null {
  const env = (process.env.APP_ENV ?? '').trim().toLowerCase();
  if (!env || env === 'production' || env === 'prod') return null;
  return env.toUpperCase();
}

/** `[UAT][THISO Leasing] ...` in UAT, `[THISO Leasing] ...` in production. */
export function emailSubject(text: string): string {
  const tag = environmentTag();
  const safeText = text.replace(/[\r\n]+/g, ' ').trim();
  return `${tag ? `[${tag}]` : ''}[THISO Leasing] ${safeText}`;
}

/**
 * Deep-link base. `FRONTEND_URL` is already the platform's proven email link
 * strategy (tenant-portal activation uses it), so CTAs reuse it rather than
 * introducing a second convention.
 */
export function appUrl(path: string): string {
  const base = (process.env.FRONTEND_URL || 'http://localhost:8080').replace(/\/+$/, '');
  let origin: URL;
  try {
    origin = new URL(base);
  } catch {
    throw new Error('FRONTEND_URL must be an absolute HTTP(S) URL');
  }
  if (!['http:', 'https:'].includes(origin.protocol)) {
    throw new Error('FRONTEND_URL must be an absolute HTTP(S) URL');
  }
  // Gated on APP_ENV (via environmentTag()), not just NODE_ENV: UAT also runs
  // the production build (NODE_ENV=production) but is plain-HTTP-only, and
  // APP_ENV=uat is already how this file distinguishes UAT from real
  // production for the `[UAT]` subject prefix — reusing it here instead of a
  // second, redundant flag.
  if (process.env.NODE_ENV === 'production' && environmentTag() === null && origin.protocol !== 'https:') {
    throw new Error('FRONTEND_URL must use HTTPS in production email');
  }
  return new URL(path.startsWith('/') ? path : `/${path}`, `${base}/`).toString();
}

/**
 * The approved application logo, served from the same origin the CTA points at.
 * This is `apps/frontend/public/logo.png` — the mark used in the app shell, dark
 * on transparent, so it reads on the white card. No logo is drawn or invented
 * here, and the header degrades to the alt text when images are blocked.
 */
export function logoUrl(): string {
  return appUrl('/logo.png');
}

// ─── Components ──────────────────────────────────────────────────────────────

/** Inbox preview line. Hidden in the body; must add to the subject, not repeat it. */
function preheaderBlock(text?: string): string {
  if (!text) return '';
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${EMAIL_COLORS.CARD_BG};opacity:0;">${esc(text)}</div>`;
}

/**
 * Compact brand bar: logo left, product name right. Deliberately not a
 * full-width navy banner — the old header spent its whole colour budget on
 * branding the recipient already recognises, and put the severity badge inside
 * it, where it read as decoration rather than as urgency.
 */
export function brandHeader(): string {
  return `
      <tr>
        <td bgcolor="${EMAIL_COLORS.CARD_BG}" style="padding:20px 32px;border-bottom:1px solid ${EMAIL_COLORS.BORDER};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="left" valign="middle" style="font-family:${FONT};">
                <img src="${esc(logoUrl())}" width="112" height="41" alt="THISO" style="display:block;width:112px;height:41px;border:0;outline:none;text-decoration:none;" />
              </td>
              <td align="right" valign="middle" style="font-family:${FONT};font-size:11px;line-height:16px;letter-spacing:0.8px;text-transform:uppercase;color:${EMAIL_COLORS.TEXT_MUTED};font-weight:bold;">
                Leasing Platform
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
}

/** The severity rule at the top of the card: urgency before any reading. */
function severityRule(severity: EmailSeverity): string {
  return `
      <tr>
        <td bgcolor="${SEVERITY[severity].accent}" height="3" style="height:3px;line-height:3px;font-size:0;">&nbsp;</td>
      </tr>`;
}

/**
 * The badge lives with the event, not in the brand header, and always carries a
 * word as well as a colour — colour alone is not an accessible signal.
 */
export function severityBadge(severity: EmailSeverity, label?: string): string {
  const s = SEVERITY[severity];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;"><tr><td bgcolor="${s.tint}" style="padding:5px 12px;border-radius:4px;font-family:${FONT};font-size:11px;line-height:14px;font-weight:bold;letter-spacing:0.6px;color:${s.accent};text-transform:uppercase;">${esc(label ?? s.label)}</td></tr></table>`;
}

/** Eyebrow (module) → title (what happened) → one-line description. */
export function eventHeader(opts: {
  eyebrow: string;
  title: string;
  description?: string;
  severity: EmailSeverity;
  badgeLabel?: string;
}): string {
  return `
      <tr>
        <td class="email-pad" style="padding:28px 32px 0 32px;font-family:${FONT};">
          <div style="font-size:11px;line-height:16px;letter-spacing:1px;text-transform:uppercase;font-weight:bold;color:${EMAIL_COLORS.TEXT_MUTED};padding-bottom:10px;">${esc(opts.eyebrow)}</div>
          <div style="font-size:23px;line-height:31px;font-weight:bold;color:${EMAIL_COLORS.TEXT_PRIMARY};padding-bottom:12px;">${esc(opts.title)}</div>
          ${severityBadge(opts.severity, opts.badgeLabel)}
          ${opts.description ? `<div style="font-size:15px;line-height:23px;color:${EMAIL_COLORS.TEXT_SECONDARY};padding-top:14px;">${opts.description}</div>` : ''}
        </td>
      </tr>`;
}

/**
 * The single number the email is about. `unit` carries the meaning, so the
 * figure is never a bare digit floating in the layout.
 */
export function heroMetric(opts: { value: string; unit: string; severity: EmailSeverity }): string {
  const s = SEVERITY[opts.severity];
  return `
      <tr>
        <td class="email-pad" style="padding:22px 32px 4px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${s.tint}" style="border-radius:8px;">
            <tr>
              <td align="center" style="padding:20px 16px;font-family:${FONT};">
                <div style="font-size:38px;line-height:44px;font-weight:bold;color:${s.accent};">${esc(opts.value)}</div>
                <div style="font-size:12px;line-height:18px;letter-spacing:1px;text-transform:uppercase;font-weight:bold;color:${s.accent};padding-top:4px;">${esc(opts.unit)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
}

export interface InfoRow {
  label: string;
  value: string | null | undefined;
  /** Renders the value in the severity accent (e.g. an expiry date). */
  emphasis?: boolean;
}

/**
 * Label/value pairs as a real table.
 *
 * The rows the previous templates used were `display:flex`, which Outlook drops
 * entirely — the label and value stacked and the grouping disappeared. A row
 * whose value is null/empty is omitted rather than printed as "Mall: undefined";
 * callers pass what they have and nothing is invented to fill a gap.
 */
export function infoTable(opts: { title?: string; rows: InfoRow[]; severity: EmailSeverity }): string {
  const rows = opts.rows.filter(
    (r) => r.value !== null && r.value !== undefined && String(r.value).trim() !== '',
  );
  if (rows.length === 0) return '';
  const accent = SEVERITY[opts.severity].accent;

  const body = rows
    .map((row, i) => {
      const border = i === rows.length - 1 ? 'none' : `1px solid ${EMAIL_COLORS.BORDER_SOFT}`;
      const valueColor = row.emphasis ? accent : EMAIL_COLORS.TEXT_PRIMARY;
      return `
              <tr>
                <td class="info-label" width="38%" valign="top" style="padding:11px 12px 11px 16px;border-bottom:${border};font-family:${FONT};font-size:13px;line-height:20px;color:${EMAIL_COLORS.TEXT_SECONDARY};">${esc(row.label)}</td>
                <td class="info-value" align="right" valign="top" style="padding:11px 16px 11px 12px;border-bottom:${border};font-family:${FONT};font-size:14px;line-height:20px;font-weight:bold;word-break:break-word;color:${valueColor};">${esc(row.value)}</td>
              </tr>`;
    })
    .join('');

  return `
      <tr>
        <td class="email-pad" style="padding:22px 32px 0 32px;font-family:${FONT};">
          ${opts.title ? `<div style="font-size:11px;line-height:16px;letter-spacing:1px;text-transform:uppercase;font-weight:bold;color:${EMAIL_COLORS.TEXT_MUTED};padding-bottom:10px;">${esc(opts.title)}</div>` : ''}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_COLORS.SURFACE}" style="border:1px solid ${EMAIL_COLORS.BORDER};border-radius:8px;">
            ${body}
          </table>
        </td>
      </tr>`;
}

/**
 * Bulletproof-ish CTA: a table cell with a background colour, which is what
 * Outlook can actually paint. ~44px tall for touch. The literal URL is printed
 * underneath because a recipient whose client strips the link still needs to be
 * able to reach the page.
 */
export function ctaButton(opts: { label: string; url: string; severity: EmailSeverity }): string {
  const accent = SEVERITY[opts.severity].accent;
  const href = esc(opts.url);
  return `
      <tr>
        <td class="email-pad" style="padding:26px 32px 0 32px;font-family:${FONT};">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td bgcolor="${accent}" style="border-radius:6px;mso-padding-alt:14px 30px;">
                <a href="${href}" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:14px;line-height:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:6px;">${esc(opts.label)}</a>
              </td>
            </tr>
          </table>
          <div style="font-size:12px;line-height:18px;color:${EMAIL_COLORS.TEXT_MUTED};padding-top:12px;word-break:break-all;">${href}</div>
        </td>
      </tr>`;
}

/** Closing guidance under the CTA. Trusted copy only — never business strings. */
export function noteBlock(html: string): string {
  return `
      <tr>
        <td class="email-pad" style="padding:20px 32px 0 32px;font-family:${FONT};font-size:13px;line-height:21px;color:${EMAIL_COLORS.TEXT_SECONDARY};">${html}</td>
      </tr>`;
}

export function divider(): string {
  return `
      <tr>
        <td class="email-pad" style="padding:26px 32px 0 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="${EMAIL_COLORS.BORDER}" style="height:1px;line-height:1px;font-size:0;">&nbsp;</td></tr></table>
        </td>
      </tr>`;
}

/**
 * No invented postal address, legal text or support mailbox — the project holds
 * none, and inventing them would put false company information in front of
 * tenants. Replies are not invited because the sending mailbox is unmonitored.
 */
function footerBlock(): string {
  const tag = environmentTag();
  const envLine = tag
    ? `<br /><span style="color:${SEVERITY.WARNING.accent};font-weight:bold;">Môi trường ${esc(tag)} — dữ liệu không phải dữ liệu thật.</span>`
    : '';
  return `
      <tr>
        <td class="email-pad" style="padding:28px 32px 30px 32px;font-family:${FONT};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="${EMAIL_COLORS.BORDER}" style="height:1px;line-height:1px;font-size:0;">&nbsp;</td></tr></table>
          <div style="padding-top:18px;font-size:12px;line-height:19px;color:${EMAIL_COLORS.TEXT_MUTED};">
            <strong style="color:${EMAIL_COLORS.TEXT_SECONDARY};">THISO Leasing Platform</strong><br />
            Email được gửi tự động từ hệ thống. Vui lòng không trả lời email này.${envLine}
          </div>
        </td>
      </tr>`;
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export interface EmailDocument {
  /** Subject-adjacent inbox preview. Should add detail, not repeat the subject. */
  preheader?: string;
  severity: EmailSeverity;
  eyebrow: string;
  title: string;
  /** Trusted HTML — callers must `esc()` any business string they inline here. */
  description?: string;
  badgeLabel?: string;
  hero?: { value: string; unit: string };
  info?: { title?: string; rows: InfoRow[] };
  cta?: { label: string; url: string };
  /** Trusted HTML, same rule as `description`. */
  note?: string;
}

/**
 * The one entry point. Structure is fixed so that every email in the platform
 * answers the same five questions in the same order: what happened, how urgent,
 * which object, when, and what to do.
 *
 * `@media` is used only to improve narrow widths; the layout is already fluid
 * (`width:100%` + `max-width:640`), so a client that ignores the block — Outlook
 * does — still renders correctly.
 */
export function renderEmail(doc: EmailDocument): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="vi">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${esc(doc.title)}</title>
<style type="text/css">
  body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  img { -ms-interpolation-mode:bicubic; }
  @media only screen and (max-width:620px) {
    .email-card { width:100% !important; border-radius:0 !important; border-left:0 !important; border-right:0 !important; }
    .email-pad { padding-left:20px !important; padding-right:20px !important; }
    .info-label, .info-value { display:block !important; width:100% !important; text-align:left !important; padding-left:16px !important; padding-right:16px !important; }
    .info-label { padding-bottom:2px !important; border-bottom:0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${EMAIL_COLORS.EMAIL_BG};">
${preheaderBlock(doc.preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_COLORS.EMAIL_BG}" style="background-color:${EMAIL_COLORS.EMAIL_BG};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" class="email-card" width="640" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_COLORS.CARD_BG}" style="width:100%;max-width:640px;background-color:${EMAIL_COLORS.CARD_BG};border:1px solid ${EMAIL_COLORS.BORDER};border-radius:12px;">
${severityRule(doc.severity)}
${brandHeader()}
${eventHeader({ eyebrow: doc.eyebrow, title: doc.title, description: doc.description, severity: doc.severity, badgeLabel: doc.badgeLabel })}
${doc.hero ? heroMetric({ ...doc.hero, severity: doc.severity }) : ''}
${doc.info ? infoTable({ ...doc.info, severity: doc.severity }) : ''}
${doc.cta ? ctaButton({ ...doc.cta, severity: doc.severity }) : ''}
${doc.note ? noteBlock(doc.note) : ''}
${footerBlock()}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Plaintext companion used by both direct SMTP and persisted delivery paths so
 * templates do not need to maintain a second body by hand.
 */
export function toPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<div style="display:none[\s\S]*?<\/div>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(tr|div|p|h1|h2|h3)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n')
    .trim();
}
