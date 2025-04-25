// src/composite-store.ts
import {
    MessageStore,
    SendMessageOptions,
    WebhookMessage,
    WebhookStatus
} from '../types'

type MessageStoreWithStatus = MessageStore & {
    saveMessageStatus(accountId: string, status: WebhookStatus): Promise<void>
}

/**
 * A MessageStore that writes to multiple underlying stores in parallel.
 */
export class CompositeMessageStore implements MessageStore {
    constructor(private stores: MessageStore[]) {}

    async saveIncomingMessage(
        accountId: string,
        msg:       WebhookMessage
    ): Promise<void> {
        await Promise.all(
            this.stores.map(s => s.saveIncomingMessage(accountId, msg))
        )
    }

    async saveOutgoingMessage(
        accountId: string,
        opts:      SendMessageOptions,
        response:  any
    ): Promise<void> {
        await Promise.all(
            this.stores.map(s => s.saveOutgoingMessage(accountId, opts, response))
        )
    }

    async saveMessageStatus(
        accountId: string,
        status:    WebhookStatus
    ): Promise<void> {
        // filter down to only those stores that implement saveMessageStatus
        const storesWithStatus = this.stores.filter(
            (s): s is MessageStoreWithStatus =>
                typeof (s as any).saveMessageStatus === 'function'
        )
        await Promise.all(
            storesWithStatus.map(s => s.saveMessageStatus(accountId, status))
        )
    }
}
