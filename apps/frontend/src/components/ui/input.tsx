import * as React from 'react';
import { NumericFormat } from 'react-number-format';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const BASE_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50';

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
              const target = {
                name: props.name,
                type: 'text',
                value: values.value,
              } as HTMLInputElement;
              const syntheticEvent = {
                target,
                currentTarget: target,
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
