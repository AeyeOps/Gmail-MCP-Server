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
