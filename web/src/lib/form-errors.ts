import type { ZodIssue } from 'zod';

export type FieldErrors = Record<string, string>;

export const getFieldErrors = (issues: ZodIssue[]): FieldErrors => {
  const errors: FieldErrors = {};

  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && errors[field] === undefined) {
      errors[field] = issue.message;
    }
  }

  return errors;
};
