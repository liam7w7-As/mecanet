import { formatRut, normalizeRut } from '@unithor/shared';
import { useLayoutEffect, useRef } from 'react';

import type { InputHTMLAttributes } from 'react';

type RutInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
};

const caretPosition = (value: string, characters: number): number => {
  if (characters === 0) return 0;
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (!/[.\s-]/.test(value[index])) count += 1;
    if (count === characters) return index + 1;
  }
  return value.length;
};

export const RutInput = ({ value, onChange, ...props }: RutInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const formatted = formatRut(value);

  useLayoutEffect(() => {
    if (pendingCaret.current !== null) {
      inputRef.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  });

  const update = (next: string, charactersBeforeCaret: number): void => {
    const display = formatRut(next);
    const position = caretPosition(display, charactersBeforeCaret);
    pendingCaret.current = position;
    onChange(display);
    if (display === formatted) inputRef.current?.setSelectionRange(position, position);
  };

  return (
    <input
      {...props}
      ref={inputRef}
      type="text"
      autoCapitalize="characters"
      spellCheck={false}
      value={formatted}
      onChange={(event) => {
        const input = event.currentTarget;
        const beforeCaret = input.value.slice(0, input.selectionStart ?? input.value.length);
        update(input.value, normalizeRut(beforeCaret).length);
      }}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
        const input = event.currentTarget;
        const start = input.selectionStart ?? 0;
        if (start !== input.selectionEnd) return;
        const backward = event.key === 'Backspace';
        if (!backward && event.key !== 'Delete') return;
        const adjacent = formatted[backward ? start - 1 : start];
        if (adjacent !== '.' && adjacent !== '-') return;

        // Delete the adjacent digit too, so deleting an automatic separator never gets stuck.
        event.preventDefault();
        const count = normalizeRut(formatted.slice(0, start)).length;
        const index = backward ? count - 1 : count;
        const raw = normalizeRut(formatted);
        update(raw.slice(0, index) + raw.slice(index + 1), backward ? count - 1 : count);
      }}
    />
  );
};

export default RutInput;
