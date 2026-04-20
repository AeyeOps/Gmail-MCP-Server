import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateDraft, deleteDraft, listDrafts, getDraft } from './drafts.js';

function createMockGmail() {
    return {
        users: {
            threads: { get: vi.fn() },
            messages: { get: vi.fn() },
            drafts: {
                update: vi.fn(),
                delete: vi.fn(),
                list: vi.fn(),
                get: vi.fn(),
            },
        },
    };
}

function encodeBase64Url(s: string): string {
    return Buffer.from(s, 'utf-8').toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
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

describe('listDrafts', () => {
    let gmail: ReturnType<typeof createMockGmail>;

    beforeEach(() => {
        gmail = createMockGmail();
    });

    it('calls gmail.users.drafts.list with the expected argument shape', async () => {
        gmail.users.drafts.list.mockResolvedValue({ data: { drafts: [] } });

        await listDrafts(gmail, { maxResults: 50, q: 'subject:hello' });

        expect(gmail.users.drafts.list).toHaveBeenCalledTimes(1);
        expect(gmail.users.drafts.list).toHaveBeenCalledWith({
            userId: 'me',
            maxResults: 50,
            q: 'subject:hello',
        });
    });

    it('defaults maxResults to 20 and omits q when not provided', async () => {
        gmail.users.drafts.list.mockResolvedValue({ data: { drafts: [] } });

        await listDrafts(gmail, {});

        const call = gmail.users.drafts.list.mock.calls[0][0];
        expect(call.userId).toBe('me');
        expect(call.maxResults).toBe(20);
        expect('q' in call).toBe(false);
    });

    it('returns a simplified array mapping id/message.id/message.threadId', async () => {
        gmail.users.drafts.list.mockResolvedValue({
            data: {
                drafts: [
                    { id: 'r-1', message: { id: 'm-1', threadId: 't-1' } },
                    { id: 'r-2', message: { id: 'm-2', threadId: 't-2' } },
                ],
            },
        });

        const result = await listDrafts(gmail, {});

        expect(result).toEqual([
            { draftId: 'r-1', messageId: 'm-1', threadId: 't-1' },
            { draftId: 'r-2', messageId: 'm-2', threadId: 't-2' },
        ]);
    });

    it('propagates errors from gmail.users.drafts.list', async () => {
        gmail.users.drafts.list.mockRejectedValue(new Error('list failed'));

        await expect(listDrafts(gmail, {})).rejects.toThrow('list failed');
    });
});

describe('getDraft', () => {
    let gmail: ReturnType<typeof createMockGmail>;

    beforeEach(() => {
        gmail = createMockGmail();
    });

    it('calls gmail.users.drafts.get with the expected argument shape', async () => {
        gmail.users.drafts.get.mockResolvedValue({
            data: { id: 'r-1', message: { threadId: 't-1', payload: { headers: [] } } },
        });

        await getDraft(gmail, 'r-1');

        expect(gmail.users.drafts.get).toHaveBeenCalledTimes(1);
        expect(gmail.users.drafts.get).toHaveBeenCalledWith({
            userId: 'me',
            id: 'r-1',
            format: 'full',
        });
    });

    it('extracts headers, plain-text body, and attachments from a full payload', async () => {
        gmail.users.drafts.get.mockResolvedValue({
            data: {
                id: 'r-1',
                message: {
                    threadId: 't-1',
                    payload: {
                        headers: [
                            { name: 'From', value: 'sender@example.com' },
                            { name: 'To', value: 'recipient@example.com' },
                            { name: 'Cc', value: 'cc@example.com' },
                            { name: 'Subject', value: 'Draft subject' },
                            { name: 'Date', value: 'Mon, 01 Jan 2026 00:00:00 +0000' },
                            { name: 'X-Ignored', value: 'should be omitted' },
                        ],
                        parts: [
                            {
                                mimeType: 'text/plain',
                                body: { data: encodeBase64Url('Hello plain') },
                            },
                            {
                                mimeType: 'text/html',
                                body: { data: encodeBase64Url('<p>Hello html</p>') },
                            },
                            {
                                mimeType: 'application/pdf',
                                filename: 'report.pdf',
                                body: { attachmentId: 'att-1', size: 2048 },
                            },
                        ],
                    },
                },
            },
        });

        const result = await getDraft(gmail, 'r-1');

        expect(result.draftId).toBe('r-1');
        expect(result.threadId).toBe('t-1');
        expect(result.headers).toEqual({
            from: 'sender@example.com',
            to: 'recipient@example.com',
            cc: 'cc@example.com',
            subject: 'Draft subject',
            date: 'Mon, 01 Jan 2026 00:00:00 +0000',
        });
        expect(result.headers['x-ignored']).toBeUndefined();
        expect(result.body).toBe('Hello plain');
        expect(result.attachments).toEqual([
            {
                filename: 'report.pdf',
                mimeType: 'application/pdf',
                size: 2048,
                attachmentId: 'att-1',
            },
        ]);
    });

    it('falls back to HTML body when no plain-text part exists', async () => {
        gmail.users.drafts.get.mockResolvedValue({
            data: {
                id: 'r-2',
                message: {
                    threadId: 't-2',
                    payload: {
                        headers: [{ name: 'Subject', value: 'HTML only' }],
                        mimeType: 'text/html',
                        body: { data: encodeBase64Url('<p>html body</p>') },
                    },
                },
            },
        });

        const result = await getDraft(gmail, 'r-2');
        expect(result.body).toBe('<p>html body</p>');
    });

    it('propagates errors from gmail.users.drafts.get', async () => {
        gmail.users.drafts.get.mockRejectedValue(new Error('draft not found'));

        await expect(getDraft(gmail, 'missing')).rejects.toThrow('draft not found');
    });
});
