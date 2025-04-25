// src/client.ts
import axios from 'axios'
import {
    SendMessageOptions,
    WebhookPayload,
    MessageStore,
    TemplateVariables
} from './types'
import { createWhatsAppTemplatePayload } from './template'

export type WhatsAppSendOptions =
    | (TemplateSendOptions & { templateName: string })
    | SendMessageOptions

export interface TemplateSendOptions {
    senderUserId: string
    businessAccountId: string
    accessToken:   string
    to:            string
    templateName:  string
    language?:     string
    variables:     TemplateVariables
}

const phoneNumberCache = new Map<string,string>()

async function getBusinessPhoneNumber(
    phoneNumberId: string,
    accessToken?: string
): Promise<string> {
    if (phoneNumberCache.has(phoneNumberId)) {
        return phoneNumberCache.get(phoneNumberId)!
    }

    const token = accessToken || process.env.WABA_TOKEN!
    const url = `https://graph.facebook.com/v22.0/${phoneNumberId}`
    const resp = await axios.get(url, {
        params: {
            access_token:       token,
            fields:             'display_phone_number'
        }
    })

    const display = resp.data.display_phone_number as string
    phoneNumberCache.set(phoneNumberId, display)
    return display
}

export async function sendWhatsApp(
    opts: WhatsAppSendOptions,
    store: MessageStore
): Promise<{
    response: any
    warnings?: string[]
}> {
    // 1) build or pick the payload
    let payload: any
    let warnings: string[] = []

    if ('templateName' in opts) {
        const result = await createWhatsAppTemplatePayload({
            businessAccountId: opts.businessAccountId,
            accessToken:   opts.accessToken,
            to:            opts.to,
            templateName:  opts.templateName,
            language:      opts.language,
            variables:     opts.variables
        })
        payload  = result.payload
        warnings = result.warnings
    } else {
        payload = { ...opts.messagePayload }
    }

    // 2) inject messaging_product automatically
    payload.messaging_product = 'whatsapp'

    // 3) send to Graph API
    const url  = `https://graph.facebook.com/v22.0/${opts.senderUserId}/messages`
    const resp = await axios.post(url, payload, {
        headers: {Authorization: `Bearer ${opts.accessToken}`, 'Content-Type': 'application/json'}
    })

    let senderPhoneNumber = await getBusinessPhoneNumber(opts.senderUserId, opts.accessToken);

    // 4) persist outgoing
    if(store)
    await store.saveOutgoingMessage(
        opts.senderUserId,
        {
            senderUserId: opts.senderUserId,
            senderPhoneNumber,
            accessToken:   opts.accessToken,
            to:            opts.to,
            messagePayload: payload
        },
        resp.data
    )

    return { response: resp.data, warnings }
}

export async function handleWhatsAppWebhook(
    payload: WebhookPayload,
    store: MessageStore
) {
    for (const entry of payload.entry) {
        const accountId = entry.changes[0].value.metadata.phone_number_id
        if(store) {
            for (const msg of entry.changes[0].value.messages || []) {
                await store.saveIncomingMessage(accountId, msg)
            }
            if (store.saveMessageStatus) {
                for (const st of entry.changes[0].value.statuses || []) {
                    await store.saveMessageStatus(accountId, st)
                }
            }
        }
    }
}
