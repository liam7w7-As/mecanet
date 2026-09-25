import { useEffect, useState } from 'react';

import { formatCurrencyInput } from '../../lib/formatters';

interface CurrencyInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
}

export const CurrencyInput = ({
  value,
  onChange,
  className,
  placeholder,
  autoFocus,
  disabled,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}: CurrencyInputProps) => {
  const [displayValue, setDisplayValue] = useState(() => formatCurrencyInput(value));
  useEffect(() => {
    setDisplayValue(formatCurrencyInput(value));
  }, [value]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const numericValue = event.target.value.replace(/\D/g, '');
    setDisplayValue(formatCurrencyInput(numericValue));
    onChange(numericValue);
  };

  const handleFocus = (): void => {
    setDisplayValue(value);
  };

  const handleBlur = (): void => {
    setDisplayValue(formatCurrencyInput(value));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid}
    />
  );
};

export default CurrencyInput;
