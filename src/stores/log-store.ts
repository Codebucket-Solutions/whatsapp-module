import {
    MessageStore,
    SendMessageOptions,
    WebhookMessage,
    WebhookStatus
} from '../types'

/**
 * A MessageStore that simply logs every call.
 * Useful for dev / debugging / local testing.
 */
export class LogMessageStore implements MessageStore {
    async saveIncomingMessage(
        accountId: string,
        msg:       WebhookMessage
    ): Promise<void> {
        console.log(`[WhatsApp][${msg.to}] ← incoming message`, {
            accountId: accountId,
            id:        msg.id,
            from:      msg.from,
            to:        msg.to,
            timestamp: new Date(msg.timestamp * 1000).toISOString(),
            text:      msg.text?.body ?? null,
            raw:       msg
        })
    }

    async saveOutgoingMessage(
        accountId: string,
        opts:      SendMessageOptions,
        response:  any
    ): Promise<void> {
        console.log(`[WhatsApp][${opts.senderPhoneNumber}] → outgoing message`, {
            accountId:accountId,
            from: opts.senderPhoneNumber,
            to:      opts.to,
            payload: opts.messagePayload,
            response
        })
    }

    async saveMessageStatus(
        accountId: string,
        status:    WebhookStatus
    ): Promise<void> {
        console.log(`[WhatsApp][${accountId}] ✔ status update`, {
            messageId: status.id,
            status:    status.status,
            timestamp: new Date(status.timestamp * 1000).toISOString(),
            raw:       status
        })
    }
}