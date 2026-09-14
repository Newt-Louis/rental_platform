import { useId } from 'react';
import {
  useController,
  type Control,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { NumericFormat, type NumberFormatValues, type SourceInfo } from 'react-number-format';
import { cn } from '@/lib/utils';
import { INPUT_BASE_CLASS } from '@/components/ui/input';

/**
 * A numeric form field backed by NumericFormat and wired through react-hook-form
 * `useController`.
 *
 * WHY THIS EXISTS — `<Input type="number">` renders a *controlled*
 * `NumericFormat`, but RHF's `register()` returns only `{name, onChange, onBlur,
 * ref}` with **no `value`**. NumericFormat therefore keeps its own internal
 * state, and RHF's ref-based DOM write on `reset()` is overwritten on the next
 * render — so a registered numeric field silently fails to repopulate when the
 * form is reset or reopened with a different record. `useController` supplies
 * the value explicitly, which is the supported integration for a controlled
 * third-party input.
 *
 * SEMANTICS
 * - Form state holds a **number**, or `null` when the field is empty. `0` and
 *   `null` are therefore distinguishable: a zero the user typed survives, and an
 *   emptied field does not silently become 0.
 * - Thousand separators are display-only; the submitted payload carries numeric
 *   primitives.
 * - `decimalScale` follows the field's declared kind, so an integer field cannot
 *   accept a fractional value.
 */

export type NumericKind =
  | 'INTEGER'
  | 'DECIMAL'
  | 'CURRENCY_AMOUNT'
  | 'PERCENT'
  | 'MONTHS'
  | 'DAYS';

/** Decimal places permitted per field kind. Integer kinds refuse fractions. */
const DECIMAL_SCALE: Record<NumericKind, number> = {
  INTEGER: 0,
  MONTHS: 0,
  DAYS: 0,
  PERCENT: 2,
  DECIMAL: 2,
  CURRENCY_AMOUNT: 2,
};

export function NumericField<T extends FieldValues>({
  control,
  name,
  label,
  kind,
  required = false,
  placeholder,
  className,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  kind: NumericKind;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  const { field, fieldState } = useController({
    control,
    name,
    rules: required
      ? {
          validate: (value: unknown) =>
            value === null || value === undefined || value === ''
              ? 'Trường này là bắt buộc'
              : true,
        }
      : undefined,
  });

  const scale = DECIMAL_SCALE[kind];

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <NumericFormat
        id={id}
        name={field.name}
        getInputRef={field.ref}
        onBlur={field.onBlur}
        // `?? ''` rather than `|| ''` so a real 0 renders as "0" instead of blank.
        value={field.value ?? ''}
        onValueChange={(values: NumberFormatValues, sourceInfo: SourceInfo) => {
          // NumericFormat also fires this when its `value` prop changes (i.e.
          // when RHF resets us). Propagating that back would fight the reset and
          // can loop, so only real user edits are written to form state.
          if (sourceInfo.source === 'prop') return;
          field.onChange(values.floatValue ?? null);
        }}
        thousandSeparator=","
        decimalScale={scale}
        allowNegative={false}
        placeholder={placeholder}
        className={cn(
          INPUT_BASE_CLASS,
          fieldState.error && 'border-red-500 focus-visible:ring-red-500',
          className,
        )}
        aria-required={required || undefined}
        aria-invalid={fieldState.error ? true : undefined}
        aria-describedby={fieldState.error ? errorId : undefined}
      />
      {fieldState.error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-red-600">
          {fieldState.error.message}
        </p>
      )}
    </div>
  );
}
