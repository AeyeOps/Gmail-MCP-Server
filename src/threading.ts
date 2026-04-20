/**
 * Reply-threading helpers extracted from index.ts so they can be unit-tested
 * with a mocked gmail client. Behavior must match the original inline logic
 * exactly — see src/index.ts (send_email / read_email handlers).
 *
 * The gmail client is typed as `any` deliberately: googleapis types are
 * cumbersome and the goal here is testability with vi.fn() mocks.
 */

type HeaderLike = { name?: string | null; value?: string | null };

/**
 * Resolve In-Reply-To / References headers from a threadId alone.
 *
 * Fetches the thread metadata (Message-ID headers only), collects every
 * Message-ID in order, and returns the last one as `inReplyTo` plus the
 * full ordered list as `references`.
 *
 * Returns `null` when:
 *   - the thread has no messages
 *   - no Message-ID header is found on any message
 *   - the fetch throws (a warning is logged, matching prior behavior)
 */
export async function resolveThreadHeaders(
    gmail: any,
    threadId: string
): Promise<{ inReplyTo: string; references: string[] } | null> {
    try {
        const threadResponse = await gmail.users.threads.get({
            userId: 'me',
            id: threadId,
            format: 'metadata',
            metadataHeaders: ['Message-ID'],
        });

        const threadMessages = threadResponse.data.messages || [];
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
    } catch (threadError: any) {
        console.warn(`Warning: Could not fetch thread ${threadId} for header resolution: ${threadError.message}`);
        return null;
    }
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
 *   - Message-ID header is missing
 *   - the fetch throws (silently — matches prior behavior where a failed
 *     fetch is assumed to mean the caller already passed an RFC Message-ID)
 */
export async function resolveReplyHeaders(
    gmail: any,
    inReplyTo: string
): Promise<{ inReplyTo: string; resolvedReferences: string } | null> {
    try {
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
    } catch (e) {
        // If fetch fails, inReplyTo might already be a Message-ID — continue as-is
        return null;
    }
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
