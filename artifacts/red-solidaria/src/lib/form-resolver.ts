import { zodResolver as resolveZod } from "@hookform/resolvers/zod";
import type { FieldValues, Resolver } from "react-hook-form";
import type { ZodType } from "zod";

/**
 * Existing controlled forms model parsed values (numbers and defaulted booleans).
 * Keep that form model while Zod 4 parses/coerces raw HTML input at runtime.
 * The current resolver understands Zod 4's `issues`, including invalid submits.
 */
export function zodResolver<T extends FieldValues>(schema: ZodType<T, FieldValues>): Resolver<T> {
  return resolveZod(schema) as unknown as Resolver<T>;
}
