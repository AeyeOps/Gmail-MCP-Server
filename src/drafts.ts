import { resolveThreadHeaders, resolveReplyHeaders } from './threading.js';
import { createEmailMessage, createEmailWithNodemailer } from './utl.js';

/**
 * Update an existing Gmail draft by ID. Replaces the draft content entirely
 * (Gmail's drafts.update uses PUT semantics). The caller must pass threadId
 * explicitly to preserve thread association; omitting it unthreads the draft.
 *
 * Returns the updated draft's id from the Gmail API response.
 */
export async function updateDraft(gmail: any, validatedArgs: any): Promise<string> {
    const { draftId } = validatedArgs;

    if (validatedArgs.threadId && !validatedArgs.inReplyTo) {
        const resolved = await resolveThreadHeaders(gmail, validatedArgs.threadId);
        if (resolved) {
            validatedArgs.inReplyTo = resolved.inReplyTo;
            validatedArgs.references = resolved.references;
        }
    }

    if (validatedArgs.inReplyTo) {
        const resolved = await resolveReplyHeaders(gmail, validatedArgs.inReplyTo);
        if (resolved) {
            validatedArgs.inReplyTo = resolved.inReplyTo;
            validatedArgs._resolvedReferences = resolved.resolvedReferences;
        }
    }

    let message: string;
    if (validatedArgs.attachments && validatedArgs.attachments.length > 0) {
        message = await createEmailWithNodemailer(validatedArgs);
    } else {
        message = createEmailMessage(validatedArgs);
    }

    const encodedMessage = Buffer.from(message).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    interface GmailMessageRequest {
        raw: string;
        threadId?: string;
    }

    const messageRequest: GmailMessageRequest = { raw: encodedMessage };
    if (validatedArgs.threadId) {
        messageRequest.threadId = validatedArgs.threadId;
    }

    const response = await gmail.users.drafts.update({
        userId: 'me',
        id: draftId,
        requestBody: { message: messageRequest },
    });

    return response.data.id;
}

/**
 * Permanently delete a Gmail draft by ID. Uses gmail.users.drafts.delete,
 * which requires only the gmail.modify scope (unlike messages.delete, which
 * requires full mail.google.com access for permanent message deletion).
 */
export async function deleteDraft(gmail: any, draftId: string): Promise<void> {
    await gmail.users.drafts.delete({
        userId: 'me',
        id: draftId,
    });
}

export interface DraftSummary {
    draftId: string;
    messageId: string;
    threadId: string;
}

/**
 * List Gmail drafts, returning a simplified array of ids. The caller can then
 * fetch details via getDraft or act on the draft via update_draft / delete_draft.
 *
 * `maxResults` defaults to 20 when omitted. `q` uses Gmail search syntax and
 * is passed through unchanged; omitting it lists all drafts (subject to
 * maxResults).
 */
export async function listDrafts(
    gmail: any,
    args: { maxResults?: number; q?: string }
): Promise<DraftSummary[]> {
    const requestParams: { userId: string; maxResults: number; q?: string } = {
        userId: 'me',
        maxResults: args.maxResults ?? 20,
    };
    if (args.q !== undefined) {
        requestParams.q = args.q;
    }

    const response = await gmail.users.drafts.list(requestParams);
    const drafts = response.data.drafts || [];

    return drafts.map((draft: any) => ({
        draftId: draft.id || '',
        messageId: draft.message?.id || '',
        threadId: draft.message?.threadId || '',
    }));
}

export interface DraftAttachmentMeta {
    filename: string;
    mimeType: string;
    size: number;
    attachmentId?: string;
}

export interface DraftDetail {
    draftId: string;
    threadId: string;
    headers: Record<string, string>;
    body: string;
    attachments: DraftAttachmentMeta[];
}

interface MessagePart {
    mimeType?: string;
    filename?: string;
    headers?: Array<{ name?: string; value?: string }>;
    body?: { attachmentId?: string; size?: number; data?: string };
    parts?: MessagePart[];
}

function decodeBase64Url(data: string): string {
    return Buffer.from(data, 'base64').toString('utf-8');
}

function extractBody(part: MessagePart | undefined): { text: string; html: string } {
    let text = '';
    let html = '';
    if (!part) return { text, html };

    if (part.body?.data) {
        const decoded = decodeBase64Url(part.body.data);
        if (part.mimeType === 'text/plain') {
            text += decoded;
        } else if (part.mimeType === 'text/html') {
            html += decoded;
        }
    }

    if (part.parts && part.parts.length > 0) {
        for (const sub of part.parts) {
            const nested = extractBody(sub);
            text += nested.text;
            html += nested.html;
        }
    }

    return { text, html };
}

function collectAttachments(part: MessagePart | undefined, out: DraftAttachmentMeta[]): void {
    if (!part) return;
    if (part.filename && part.filename.length > 0) {
        out.push({
            filename: part.filename,
            mimeType: part.mimeType || 'application/octet-stream',
            size: part.body?.size || 0,
            attachmentId: part.body?.attachmentId,
        });
    }
    if (part.parts) {
        for (const sub of part.parts) {
            collectAttachments(sub, out);
        }
    }
}

/**
 * Retrieve the full content of a Gmail draft by ID: headers (lowercase-keyed
 * subset), body (plain text preferred, HTML fallback), and attachment
 * metadata. Parallel to read_email but for unsent drafts.
 */
export async function getDraft(gmail: any, draftId: string): Promise<DraftDetail> {
    const response = await gmail.users.drafts.get({
        userId: 'me',
        id: draftId,
        format: 'full',
    });

    const draft = response.data || {};
    const message = draft.message || {};
    const payload: MessagePart = message.payload || {};

    const wantedHeaders = ['from', 'to', 'cc', 'bcc', 'subject', 'date'];
    const headerMap: Record<string, string> = {};
    const rawHeaders = payload.headers || [];
    for (const h of rawHeaders) {
        const name = (h.name || '').toLowerCase();
        if (wantedHeaders.includes(name) && h.value !== undefined) {
            headerMap[name] = h.value;
        }
    }

    const { text, html } = extractBody(payload);
    const body = text || html || '';

    const attachments: DraftAttachmentMeta[] = [];
    collectAttachments(payload, attachments);

    return {
        draftId: draft.id || draftId,
        threadId: message.threadId || '',
        headers: headerMap,
        body,
        attachments,
    };
}
