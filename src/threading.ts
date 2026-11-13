/**
 * Reply-threading helpers extracted from index.ts so they can be unit-tested
 * with a mocked gmail client. See src/index.ts (send_email / read_email handlers).
 *
 * The gmail client is typed as `any` deliberately: googleapis types are
 * cumbersome and the goal here is testability with vi.fn() mocks.
 */

type HeaderLike = { name?: string | null; value?: string | null };
type PartLike = { mimeType?: string | null; parts?: PartLike[] | null };

const REACTION_MIME_TYPE = 'text/vnd.google.email-reaction+json';

function hasReactionPart(part: PartLike | null | undefined): boolean {
    if (!part) {
        return false;
    }
    return part.mimeType === REACTION_MIME_TYPE || (part.parts || []).some(hasReactionPart);
}

/**
 * True for a thread message a reply can answer. Gmail returns three kinds
 * that a reply cannot answer: an unsent draft, a trashed message, and an
 * emoji reaction, which is a message carrying a
 * `text/vnd.google.email-reaction+json` part that Gmail shows as an emoji on
 * the message it reacts to instead of as a message of its own.
 */
function isReplyTarget(msg: any): boolean {
    const labelIds: string[] = msg.labelIds || [];
    return !labelIds.includes('DRAFT') && !labelIds.includes('TRASH') && !hasReactionPart(msg.payload);
}

/**
 * Resolve In-Reply-To / References headers from a threadId alone.
 *
 * Fetches the thread in full, because only the full format carries the MIME
 * tree that marks a reaction. Keeps the messages a reply can answer (see
 * `isReplyTarget`), and returns the last of their Message-IDs as `inReplyTo`
 * plus their ordered list as `references`.
 *
 * Returns `null` when:
 *   - the thread has no message a reply can answer
 *   - no Message-ID header is found on any of them
 * A failed fetch rejects, so a reply never goes out silently unthreaded.
 */
export async function resolveThreadHeaders(
    gmail: any,
    threadId: string
): Promise<{ inReplyTo: string; references: string[] } | null> {
    const threadResponse = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
    });

    const threadMessages = (threadResponse.data.messages || []).filter(isReplyTarget);
    const threadMessageIds = threadMessages
        .map((msg: any) => msg.payload?.headers?.find((h: HeaderLike) => h.name?.toLowerCase() === 'message-id')?.value)
        .filter((value: string | undefined | null): value is string => Boolean(value));

    if (threadMessageIds.length > 0) {
        return {
            inReplyTo: threadMessageIds[threadMessageIds.length - 1],
            references: threadMessageIds,
        };
    }
    return null;
}

/**
 * Resolve the real RFC 5322 Message-ID for a reply target, plus the
 * concatenated References chain.
 *
 * When `inReplyTo` is the Gmail internal message id, fetches the message's
 * metadata (Message-ID + References headers) and returns:
 *   - `inReplyTo`: the RFC Message-ID header value
 *   - `resolvedReferences`: previous References header appended with the
 *     new Message-ID (space-separated), or just the Message-ID when no
 *     previous References exist
 *
 * Returns `null` when:
 *   - `inReplyTo` is already an RFC Message-ID (it contains `@`)
 *   - Message-ID header is missing
 * A failed fetch of a Gmail message id rejects.
 */
export async function resolveReplyHeaders(
    gmail: any,
    inReplyTo: string
): Promise<{ inReplyTo: string; resolvedReferences: string } | null> {
    if (inReplyTo.includes('@')) {
        return null;
    }

    const replyToMsg = await gmail.users.messages.get({
        userId: 'me',
        id: inReplyTo,
        format: 'metadata',
        metadataHeaders: ['Message-ID', 'References'],
    });

    const headers = replyToMsg.data.payload?.headers || [];
    const messageIdHeader = headers.find(
        (h: HeaderLike) => h.name?.toLowerCase() === 'message-id'
    )?.value;

    if (!messageIdHeader) {
        return null;
    }

    const prevReferences = headers.find(
        (h: HeaderLike) => h.name?.toLowerCase() === 'references'
    )?.value || '';

    return {
        inReplyTo: messageIdHeader,
        resolvedReferences: prevReferences
            ? `${prevReferences} ${messageIdHeader}`
            : messageIdHeader,
    };
}

/**
 * Case-insensitive lookup of the `Message-ID` header value.
 * Returns '' when not found — matches the inline behavior in read_email.
 */
export function extractMessageId(
    headers: Array<{ name?: string | null; value?: string | null }>
): string {
    return headers.find(h => h.name?.toLowerCase() === 'message-id')?.value || '';
}
