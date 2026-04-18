import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createEmailMessage, formatMessageId, formatReferences } from './utl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexSource = fs.readFileSync(path.join(__dirname, 'index.ts'), 'utf8');

function getHeader(raw: string, headerName: string): string | null {
  const match = raw.match(new RegExp(`^${headerName}:\\s*(.+)$`, 'mi'));
  return match ? match[1].trim() : null;
}

describe('threading header formatting', () => {
  it('formats a bare message id with angle brackets', () => {
    expect(formatMessageId('abc123@mail.com')).toBe('<abc123@mail.com>');
  });

  it('preserves an already bracketed message id', () => {
    expect(formatMessageId('<abc123@mail.com>')).toBe('<abc123@mail.com>');
  });

  it('formats a full references chain', () => {
    expect(formatReferences(['a@mail.com', '<b@mail.com>', 'c@mail.com'])).toBe(
      '<a@mail.com> <b@mail.com> <c@mail.com>'
    );
  });

  it('prefers explicit references in createEmailMessage', () => {
    const raw = createEmailMessage({
      to: ['test@example.com'],
      subject: 'Re: Explicit references',
      body: 'Body',
      inReplyTo: 'reply@mail.com',
      references: ['root@mail.com', 'reply@mail.com'],
    });

    expect(getHeader(raw, 'In-Reply-To')).toBe('<reply@mail.com>');
    expect(getHeader(raw, 'References')).toBe('<root@mail.com> <reply@mail.com>');
  });

  it('falls back to resolved references chain', () => {
    const raw = createEmailMessage({
      to: ['test@example.com'],
      subject: 'Re: Resolved references',
      body: 'Body',
      inReplyTo: '<reply@mail.com>',
      _resolvedReferences: '<root@mail.com> <reply@mail.com>',
    });

    expect(getHeader(raw, 'In-Reply-To')).toBe('<reply@mail.com>');
    expect(getHeader(raw, 'References')).toBe('<root@mail.com> <reply@mail.com>');
  });

  it('falls back to inReplyTo when no references chain exists', () => {
    const raw = createEmailMessage({
      to: ['test@example.com'],
      subject: 'Re: Single reference',
      body: 'Body',
      inReplyTo: 'reply@mail.com',
    });

    expect(getHeader(raw, 'In-Reply-To')).toBe('<reply@mail.com>');
    expect(getHeader(raw, 'References')).toBe('<reply@mail.com>');
  });
});

describe('index.ts reply threading flow', () => {
  it('contains threadId-only auto resolution logic', () => {
    expect(indexSource).toContain("if (validatedArgs.threadId && !validatedArgs.inReplyTo)");
    expect(indexSource).toContain("metadataHeaders: ['Message-ID']");
    expect(indexSource).toContain('validatedArgs.references = threadMessageIds');
  });

  it('contains Gmail id to RFC Message-ID resolution logic', () => {
    expect(indexSource).toContain("metadataHeaders: ['Message-ID', 'References']");
    expect(indexSource).toContain('validatedArgs._resolvedReferences = prevReferences');
    expect(indexSource).toContain('validatedArgs.inReplyTo = messageIdHeader');
  });

  it('returns Message-ID in read_email output', () => {
    expect(indexSource).toContain("const messageId = headers.find(h => h.name?.toLowerCase() === 'message-id')?.value || '';");
    expect(indexSource).toContain('Message-ID: ${messageId}');
  });
});
