import { describe, expect, it } from 'vitest';

import { createEmailMessage, formatMessageId, formatReferences } from './utl.js';

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
