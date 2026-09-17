/**
 * Uniform Server Action result. Actions never throw for expected failures —
 * they return a Georgian message the form can render inline.
 */

export type FieldErrors = Record<string, string>;

export type ActionSuccess<T> = { ok: true; data: T };

export type ActionFailure = {
  ok: false;
  /** Form-level message, already translated. */
  message: string;
  /** Per-field messages keyed by input name, already translated. */
  fields?: FieldErrors;
};

export type ActionResult<T = null> = ActionSuccess<T> | ActionFailure;

export function ok<T>(data: T): ActionSuccess<T> {
  return { ok: true, data };
}

export function fail(message: string, fields?: FieldErrors): ActionFailure {
  return fields ? { ok: false, message, fields } : { ok: false, message };
}

/** Collapse the `fieldErrors` of `z.flattenError()` into `FieldErrors`. */
export function fieldErrorsFrom(flattened: object): FieldErrors {
  const errors: FieldErrors = {};
  for (const [key, messages] of Object.entries(flattened)) {
    if (
      Array.isArray(messages) &&
      messages.length > 0 &&
      typeof messages[0] === "string"
    ) {
      errors[key] = messages[0];
    }
  }
  return errors;
}
