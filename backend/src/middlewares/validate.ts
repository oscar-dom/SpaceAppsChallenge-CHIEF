import type { z } from 'zod';
import { ValidationError } from '../errors/app-error.js';

/**
 * Parses request input (params, query or body) with a zod schema and returns it typed,
 * or throws a 400 with the first problem found.
 */
export function parseInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    throw new ValidationError(`${where}${issue?.message ?? 'Invalid input'}`);
  }
  return result.data;
}
