import { useEffect, useState } from 'react';

import { formatCurrencyInput } from '../../lib/formatters';

const decimalFormatter = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
const formatInputValue = (value: string, allowDecimals: boolean): string => {
  if (!allowDecimals) return formatCurrencyInput(value);
  return value === '' ? '' : decimalFormatter.format(Number(value));
};

interface CurrencyInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  allowDecimals?: boolean;
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
  allowDecimals = false,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}: CurrencyInputProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const [displayValue, setDisplayValue] = useState(() => formatInputValue(value, allowDecimals));
  useEffect(() => {
    setDisplayValue(allowDecimals && isFocused ? value : formatInputValue(value, allowDecimals));
  }, [value, allowDecimals, isFocused]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    if (allowDecimals) {
      const input = event.target.value.trim();
      const normalized = input.includes(',') ? input.replace(/\./g, '').replace(',', '.') : input;
      if (!/^\d*(?:\.\d{0,2})?$/.test(normalized)) return;
      setDisplayValue(normalized);
      onChange(normalized);
      return;
    }
    const numericValue = event.target.value.replace(/\D/g, '');
    setDisplayValue(formatCurrencyInput(numericValue));
    onChange(numericValue);
  };

  const handleFocus = (): void => {
    setIsFocused(true);
    setDisplayValue(value);
  };

  const handleBlur = (): void => {
    setIsFocused(false);
    setDisplayValue(formatInputValue(value, allowDecimals));
  };

  return (
    <input
      type="text"
      inputMode={allowDecimals ? 'decimal' : 'numeric'}
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
