import * as React from 'react';
import { NumericFormat } from 'react-number-format';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const BASE_CLASS =
  'flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:border-gray-900 disabled:cursor-not-allowed disabled:opacity-50';

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, onChange, value, defaultValue, ...props }, ref) => {
    const cls = cn(BASE_CLASS, error && 'border-red-500 focus-visible:ring-red-500', className);

    if (type === 'number') {
      return (
        <NumericFormat
          thousandSeparator=","
          value={value as string | number | undefined}
          defaultValue={defaultValue as string | number | undefined}
          onValueChange={(values) => {
            if (onChange) {
              // bridge onValueChange → onChange with raw unformatted value
              const syntheticEvent = {
                target: { value: values.value },
              } as React.ChangeEvent<HTMLInputElement>;
              onChange(syntheticEvent);
            }
          }}
          className={cls}
          getInputRef={ref}
          {...props}
        />
      );
    }

    return (
      <input
        type={type}
        className={cls}
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
