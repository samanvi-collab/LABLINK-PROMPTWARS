import { AI_MAX_USER_INPUT_CHARS } from '../../../shared/constants';

/**
 * Strips control characters and normalizes whitespace before placing
 * untrusted user text inside delimited prompt sections.
 */
export function sanitizeUserPromptText(raw: string, maxLength = AI_MAX_USER_INPUT_CHARS): string {
  const withoutControl = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return withoutControl.slice(0, maxLength);
}

/**
 * Wraps untrusted user-supplied content in explicit boundary markers so
 * the model systemInstruction can enforce strict data-vs-instruction separation.
 */
export function wrapUntrustedUserText(label: string, raw: string): string {
  const safeText = sanitizeUserPromptText(raw).replace(/<<</g, '< < <').replace(/>>>/g, '> > >');
  return [
    `<<<UNTRUSTED_USER_${label}_START>>>`,
    safeText,
    `<<<UNTRUSTED_USER_${label}_END>>>`,
  ].join('\n');
}

/**
 * Strips HTML markup, script/data/http URLs, and excessive whitespace from
 * model-generated text before returning it to the client.
 */
export function sanitizeModelText(raw: string, maxLength = 380): string {
  const cleaned = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/(?:https?|javascript|data):\/\/\S+|javascript:\S+|data:\S+/gi, '[link-removed]')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return 'Matches verified laboratory scheduling criteria.';
  }
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

export function sanitizeModelStringList(items: string[], maxItems = 4, maxLen = 240): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const cleaned = sanitizeModelText(item, maxLen);
    if (cleaned && !seen.has(cleaned.toLowerCase())) {
      seen.add(cleaned.toLowerCase());
      out.push(cleaned);
    }
    if (out.length >= maxItems) {
      break;
    }
  }
  return out;
}
