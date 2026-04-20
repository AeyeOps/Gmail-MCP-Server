import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    extractMessageId,
    resolveReplyHeaders,
    resolveThreadHeaders,
} from './threading.js';

function createMockGmail() {
    return {
        users: {
            threads: { get: vi.fn() },
            messages: { get: vi.fn() },
        },
    };
}

/**
 * Build a gmail-style payload for a single message, with optional headers.
 */
function msg(headers: Array<{ name: string; value: string }>) {
    return { payload: { headers } };
}

describe('resolveThreadHeaders', () => {
    let gmail: ReturnType<typeof createMockGmail>;

    beforeEach(() => {
        gmail = createMockGmail();
    });

    it('returns ordered references and last Message-ID as inReplyTo for a 3-message thread', async () => {
        gmail.users.threads.get.mockResolvedValue({
            data: {
                messages: [
                    msg([{ name: 'Message-ID', value: '<msg1@mail.com>' }]),
                    msg([{ name: 'Message-ID', value: '<msg2@mail.com>' }]),
                    msg([{ name: 'Message-ID', value: '<msg3@mail.com>' }]),
                ],
            },
        });

        const result = await resolveThreadHeaders(gmail, 'thread-abc');

        expect(result).toEqual({
            inReplyTo: '<msg3@mail.com>',
            references: ['<msg1@mail.com>', '<msg2@mail.com>', '<msg3@mail.com>'],
        });
    });

    it('calls gmail.users.threads.get with the exact expected argument shape', async () => {
        gmail.users.threads.get.mockResolvedValue({
            data: {
                messages: [msg([{ name: 'Message-ID', value: '<only@mail.com>' }])],
            },
        });

        await resolveThreadHeaders(gmail, 'thread-xyz');

        expect(gmail.users.threads.get).toHaveBeenCalledTimes(1);
        expect(gmail.users.threads.get).toHaveBeenCalledWith({
            userId: 'me',
            id: 'thread-xyz',
            format: 'metadata',
            metadataHeaders: ['Message-ID'],
        });
    });

    it('returns null when the thread has no messages (empty array)', async () => {
        gmail.users.threads.get.mockResolvedValue({ data: { messages: [] } });

        const result = await resolveThreadHeaders(gmail, 'thread-empty');

        expect(result).toBeNull();
    });

    it('returns null when data.messages is missing entirely', async () => {
        gmail.users.threads.get.mockResolvedValue({ data: {} });

        const result = await resolveThreadHeaders(gmail, 'thread-missing');

        expect(result).toBeNull();
    });

    it('filters out messages missing the Message-ID header and returns the found ones', async () => {
        gmail.users.threads.get.mockResolvedValue({
            data: {
                messages: [
                    msg([{ name: 'Subject', value: 'no id here' }]),
                    msg([{ name: 'Message-ID', value: '<found@mail.com>' }]),
                    msg([]),
                ],
            },
        });

        const result = await resolveThreadHeaders(gmail, 'thread-partial');

        expect(result).toEqual({
            inReplyTo: '<found@mail.com>',
            references: ['<found@mail.com>'],
        });
    });

    it('returns null when no message in the thread has a Message-ID header', async () => {
        gmail.users.threads.get.mockResolvedValue({
            data: {
                messages: [
                    msg([{ name: 'Subject', value: 'one' }]),
                    msg([{ name: 'From', value: 'a@b.com' }]),
                ],
            },
        });

        const result = await resolveThreadHeaders(gmail, 'thread-noids');

        expect(result).toBeNull();
    });

    it('returns null and logs a warning when the API call rejects', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        gmail.users.threads.get.mockRejectedValue(new Error('boom'));

        const result = await resolveThreadHeaders(gmail, 'thread-error');

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalled();

        warnSpy.mockRestore();
    });
});

describe('resolveReplyHeaders', () => {
    let gmail: ReturnType<typeof createMockGmail>;

    beforeEach(() => {
        gmail = createMockGmail();
    });

    it('returns inReplyTo and appended resolvedReferences when both headers exist', async () => {
        gmail.users.messages.get.mockResolvedValue({
            data: {
                payload: {
                    headers: [
                        { name: 'Message-ID', value: '<current@mail.com>' },
                        { name: 'References', value: '<root@mail.com> <prev@mail.com>' },
                    ],
                },
            },
        });

        const result = await resolveReplyHeaders(gmail, 'gmail-internal-id');

        expect(result).toEqual({
            inReplyTo: '<current@mail.com>',
            resolvedReferences: '<root@mail.com> <prev@mail.com> <current@mail.com>',
        });
    });

    it('returns just the Message-ID as resolvedReferences when References header is absent', async () => {
        gmail.users.messages.get.mockResolvedValue({
            data: {
                payload: {
                    headers: [
                        { name: 'Message-ID', value: '<lonely@mail.com>' },
                    ],
                },
            },
        });

        const result = await resolveReplyHeaders(gmail, 'gmail-internal-id');

        expect(result).toEqual({
            inReplyTo: '<lonely@mail.com>',
            resolvedReferences: '<lonely@mail.com>',
        });
        expect(result?.resolvedReferences.startsWith(' ')).toBe(false);
    });

    it('returns null when the message has no Message-ID header', async () => {
        gmail.users.messages.get.mockResolvedValue({
            data: {
                payload: {
                    headers: [
                        { name: 'Subject', value: 'no message id' },
                        { name: 'References', value: '<root@mail.com>' },
                    ],
                },
            },
        });

        const result = await resolveReplyHeaders(gmail, 'gmail-internal-id');

        expect(result).toBeNull();
    });

    it('returns null without logging when the API call rejects', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        gmail.users.messages.get.mockRejectedValue(new Error('fetch failed'));

        const result = await resolveReplyHeaders(gmail, 'gmail-internal-id');

        expect(result).toBeNull();
        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();

        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('calls gmail.users.messages.get with the exact expected argument shape', async () => {
        gmail.users.messages.get.mockResolvedValue({
            data: {
                payload: {
                    headers: [{ name: 'Message-ID', value: '<x@mail.com>' }],
                },
            },
        });

        await resolveReplyHeaders(gmail, 'internal-id-42');

        expect(gmail.users.messages.get).toHaveBeenCalledTimes(1);
        expect(gmail.users.messages.get).toHaveBeenCalledWith({
            userId: 'me',
            id: 'internal-id-42',
            format: 'metadata',
            metadataHeaders: ['Message-ID', 'References'],
        });
    });

    it('finds an uppercase MESSAGE-ID header (case-insensitive)', async () => {
        gmail.users.messages.get.mockResolvedValue({
            data: {
                payload: {
                    headers: [
                        { name: 'MESSAGE-ID', value: '<upper@mail.com>' },
                    ],
                },
            },
        });

        const result = await resolveReplyHeaders(gmail, 'any');

        expect(result).toEqual({
            inReplyTo: '<upper@mail.com>',
            resolvedReferences: '<upper@mail.com>',
        });
    });

    it('finds a lowercase message-id header (case-insensitive)', async () => {
        gmail.users.messages.get.mockResolvedValue({
            data: {
                payload: {
                    headers: [
                        { name: 'message-id', value: '<lower@mail.com>' },
                        { name: 'references', value: '<r1@mail.com>' },
                    ],
                },
            },
        });

        const result = await resolveReplyHeaders(gmail, 'any');

        expect(result).toEqual({
            inReplyTo: '<lower@mail.com>',
            resolvedReferences: '<r1@mail.com> <lower@mail.com>',
        });
    });
});

describe('extractMessageId', () => {
    it("finds a mixed-case 'Message-ID' header", () => {
        const headers = [
            { name: 'Subject', value: 'hi' },
            { name: 'Message-ID', value: '<mixed@mail.com>' },
        ];

        expect(extractMessageId(headers)).toBe('<mixed@mail.com>');
    });

    it("finds a lowercase 'message-id' header", () => {
        const headers = [
            { name: 'message-id', value: '<lower@mail.com>' },
        ];

        expect(extractMessageId(headers)).toBe('<lower@mail.com>');
    });

    it("finds an uppercase 'MESSAGE-ID' header", () => {
        const headers = [
            { name: 'MESSAGE-ID', value: '<upper@mail.com>' },
        ];

        expect(extractMessageId(headers)).toBe('<upper@mail.com>');
    });

    it('returns empty string when no Message-ID header is present', () => {
        const headers = [
            { name: 'Subject', value: 'hi' },
            { name: 'From', value: 'a@b.com' },
        ];

        expect(extractMessageId(headers)).toBe('');
    });

    it('returns empty string for an empty headers array', () => {
        expect(extractMessageId([])).toBe('');
    });

    it('skips headers with no name gracefully (does not crash)', () => {
        const headers = [
            { value: 'orphan-value' },
            { name: 'Message-ID', value: '<found@mail.com>' },
        ];

        expect(extractMessageId(headers)).toBe('<found@mail.com>');
    });

    it('returns empty string when the Message-ID header has a name but no value', () => {
        const headers = [
            { name: 'Message-ID' },
        ];

        expect(extractMessageId(headers)).toBe('');
    });
});
