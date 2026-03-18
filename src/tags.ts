/**
 * Tag validation and normalization.
 *
 * Valid tag format (canonical regex):
 * ^(?=.{1,50}$)[a-z0-9]+(?:[ -][a-z0-9]+)*(?:/[a-z0-9]+(?:[ -][a-z0-9]+)*)*$
 *
 * Examples of valid tags: `rust`, `distributed systems`, `distributed-systems`, `language/rust`
 */

export interface TagValidation {
  valid: boolean;
  normalized: string;
  errors: string[];
}

/**
 * Normalizes raw user input into tag form:
 * - trims leading/trailing whitespace
 * - lowercases
 * - strips leading `#`
 * - preserves `/` hierarchy
 */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#/, "").toLowerCase();
}

/**
 * Returns true if `tag` is already in canonical valid form.
 */
export function isValidTag(tag: string): boolean {
  if (!tag || tag.length > 50) return false;
  if (tag.startsWith("/") || tag.endsWith("/")) return false;
  if (/[^a-z0-9\- /]/.test(tag)) return false;
  if (tag.includes("--") || tag.includes("//")) return false;
  if (tag.includes("  ")) return false;

  for (const segment of tag.split("/")) {
    if (!segment) return false;
    if (segment.startsWith("-") || segment.endsWith("-")) return false;
    if (segment.startsWith(" ") || segment.endsWith(" ")) return false;
  }

  return true;
}

/**
 * Normalizes `raw`, then validates against all tag rules.
 * Returns specific error messages for each violated rule.
 */
export function validateTag(raw: string): TagValidation {
  const normalized = normalizeTag(raw);
  const errors: string[] = [];

  if (!normalized) {
    errors.push("tag is empty");
    return { valid: false, normalized, errors };
  }

  if (normalized.length > 50) {
    errors.push("tag exceeds 50 characters");
  }

  if (normalized.startsWith("/") || normalized.endsWith("/")) {
    errors.push("tag cannot start or end with a separator");
  }

  if (/[^a-z0-9\- /]/.test(normalized)) {
    errors.push("only lowercase letters, numbers, hyphens, spaces, and / are allowed");
  }

  if (normalized.includes("--")) {
    errors.push("consecutive hyphens are not allowed");
  }

  if (normalized.includes("  ")) {
    errors.push("consecutive spaces are not allowed");
  }

  if (normalized.includes("//")) {
    errors.push("empty namespace segment");
  }

  for (const segment of normalized.split("/")) {
    if (!segment) {
      if (!errors.includes("empty namespace segment")) {
        errors.push("empty namespace segment");
      }
      continue;
    }
    if (segment.startsWith("-") || segment.endsWith("-")) {
      if (!errors.includes("tag cannot start or end with a separator")) {
        errors.push("tag cannot start or end with a separator");
      }
    }
    if (segment.startsWith(" ") || segment.endsWith(" ")) {
      if (!errors.includes("tag cannot start or end with a separator")) {
        errors.push("tag cannot start or end with a separator");
      }
    }
  }

  return { valid: errors.length === 0, normalized, errors };
}
