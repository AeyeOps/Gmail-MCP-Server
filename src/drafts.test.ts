import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateDraft, deleteDraft } from './drafts.js';

function createMockGmail() {
    return {
        users: {
            threads: { get: vi.fn() },
            messages: { get: vi.fn() },
            drafts: { update: vi.fn(), delete: vi.fn() },
        },
    };
}

function msg(headers: Array<{ name: string; value: string }>) {
    return { payload: { headers } };
}

function decodeRaw(raw: string): string {
    const base64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
}

describe('updateDraft', () => {
    let gmail: ReturnType<typeof createMockGmail>;

    beforeEach(() => {
        gmail = createMockGmail();
    });

    it('calls gmail.users.drafts.update with the exact expected argument shape', async () => {
        gmail.users.drafts.update.mockResolvedValue({ data: { id: 'draft-123' } });

        await updateDraft(gmail, {
            draftId: 'draft-123',
            to: ['recipient@example.com'],
            subject: 'Hello',
            body: 'World',
        });

        expect(gmail.users.drafts.update).toHaveBeenCalledTimes(1);
        const call = gmail.users.drafts.update.mock.calls[0][0];
        expect(call.userId).toBe('me');
        expect(call.id).toBe('draft-123');
        expect(call.requestBody.message.raw).toEqual(expect.any(String));
        expect(call.requestBody.message.raw.length).toBeGreaterThan(0);
        expect(call.requestBody.message.threadId).toBeUndefined();
    });

    it('returns response.data.id', async () => {
        gmail.users.drafts.update.mockResolvedValue({ data: { id: 'returned-id-42' } });

        const result = await updateDraft(gmail, {
            draftId: 'draft-123',
            to: ['recipient@example.com'],
            subject: 'Hi',
            body: 'Body',
        });

        expect(result).toBe('returned-id-42');
    });

    it('includes threadId in messageRequest when threadId is provided', async () => {
        gmail.users.drafts.update.mockResolvedValue({ data: { id: 'draft-123' } });
        // Empty thread → resolveThreadHeaders returns null, threadId flows through untouched.
        gmail.users.threads.get.mockResolvedValue({ data: { messages: [] } });

        await updateDraft(gmail, {
            draftId: 'draft-123',
            to: ['recipient@example.com'],
            subject: 'Hi',
            body: 'Body',
            threadId: 'thread-abc',
        });

        const call = gmail.users.drafts.update.mock.calls[0][0];
        expect(call.requestBody.message.threadId).toBe('thread-abc');
    });

    it('resolves threadId into In-Reply-To / References via resolveThreadHeaders', async () => {
        gmail.users.drafts.update.mockResolvedValue({ data: { id: 'draft-123' } });
        gmail.users.threads.get.mockResolvedValue({
            data: {
                messages: [
                    msg([{ name: 'Message-ID', value: '<first@mail.com>' }]),
                    msg([{ name: 'Message-ID', value: '<second@mail.com>' }]),
                ],
            },
        });
        // resolveReplyHeaders will be called after resolveThreadHeaders populates inReplyTo;
        // return null so createEmailMessage uses the thread-resolved values as-is.
        gmail.users.messages.get.mockRejectedValue(new Error('skip reply resolution'));

        await updateDraft(gmail, {
            draftId: 'draft-123',
            to: ['recipient@example.com'],
            subject: 'Re: thread',
            body: 'reply body',
            threadId: 'thread-abc',
        });

        expect(gmail.users.threads.get).toHaveBeenCalledTimes(1);
        const call = gmail.users.drafts.update.mock.calls[0][0];
        const decoded = decodeRaw(call.requestBody.message.raw);
        expect(decoded).toContain('In-Reply-To: <second@mail.com>');
        expect(decoded).toContain('References: <first@mail.com> <second@mail.com>');
    });

    it('resolves inReplyTo into _resolvedReferences via resolveReplyHeaders', async () => {
        gmail.users.drafts.update.mockResolvedValue({ data: { id: 'draft-123' } });
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

        await updateDraft(gmail, {
            draftId: 'draft-123',
            to: ['recipient@example.com'],
            subject: 'Re: chain',
            body: 'reply',
            inReplyTo: 'gmail-internal-id',
        });

        expect(gmail.users.messages.get).toHaveBeenCalledTimes(1);
        const call = gmail.users.drafts.update.mock.calls[0][0];
        const decoded = decodeRaw(call.requestBody.message.raw);
        expect(decoded).toContain('In-Reply-To: <current@mail.com>');
        expect(decoded).toContain('References: <root@mail.com> <prev@mail.com> <current@mail.com>');
    });

    it('propagates errors from gmail.users.drafts.update', async () => {
        gmail.users.drafts.update.mockRejectedValue(new Error('draft not found'));

        await expect(updateDraft(gmail, {
            draftId: 'missing-draft',
            to: ['recipient@example.com'],
            subject: 'x',
            body: 'y',
        })).rejects.toThrow('draft not found');
    });
});

describe('deleteDraft', () => {
    let gmail: ReturnType<typeof createMockGmail>;

    beforeEach(() => {
        gmail = createMockGmail();
    });

    it('calls gmail.users.drafts.delete with the exact expected argument shape', async () => {
        gmail.users.drafts.delete.mockResolvedValue({});

        await deleteDraft(gmail, 'r-123456789');

        expect(gmail.users.drafts.delete).toHaveBeenCalledTimes(1);
        expect(gmail.users.drafts.delete).toHaveBeenCalledWith({
            userId: 'me',
            id: 'r-123456789',
        });
    });

    it('propagates errors from gmail.users.drafts.delete', async () => {
        gmail.users.drafts.delete.mockRejectedValue(new Error('draft not found'));

        await expect(deleteDraft(gmail, 'missing-draft')).rejects.toThrow('draft not found');
    });
});
