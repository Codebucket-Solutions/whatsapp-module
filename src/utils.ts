/**
 * Cleans a template variable text by removing disallowed characters,
 * trimming excessive whitespace, escaping unsupported patterns,
 * and stripping newlines (which are not allowed).
 */
export function cleanTemplateText(input: string): string {
    let text = input
        .replace(/[\x00-\x1F\x7F]/g, '')  // remove control chars
        .replace(/\r?\n/g, ' ')             // strip newlines
        .replace(/\s{2,}/g, ' ')             // collapse spaces
        .trim();
    // escape stray braces
    text = text.replace(/\{([^{}]+)\}/g, '{{$1}}');
    return text;
}

/**
 * Validates template text against WhatsApp Business API rules.
 * Returns an array of warnings (no errors are thrown).
 */
export function validateTemplateText(input: string): string[] {
    const warnings: string[] = [];
    if (/\r?\n/.test(input)) {
        warnings.push('Template text contained newline characters which have been stripped.');
    }
    if (input.length > 1024) {
        warnings.push(`Template text exceeds 1024 characters (${input.length}).`);
    }
    if (/\p{Emoji}/u.test(input)) {
        warnings.push('Text contains emoji characters which may be disallowed.');
    }
    const open = (input.match(/\{\{/g) || []).length;
    const close = (input.match(/\}\}/g) || []).length;
    if (open !== close) {
        warnings.push('Detected unbalanced placeholder braces.');
    }
    return warnings;
}
