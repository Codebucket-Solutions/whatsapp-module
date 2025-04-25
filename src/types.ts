export type Variables = string[] | Record<string, string>;

export interface ComponentDef {
    type:     'HEADER' | 'BODY' | 'BUTTON' | string;
    format?:  'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' | 'AUDIO';
    text?:    string;
    sub_type?:string;
    index?:   number;
}

export enum Mode { NUMERIC = 'numeric', NAMED = 'named', NONE = 'none' }

/**
 * You can now pass either:
 * 1) A positional array (old style)
 * 2) A structured object for mixed media+named+buttons:
 *    {
 *      header?: string,                    // URL or media ID
 *      body?:   Record<placeholder,string>,// named placeholders
 *      buttons?: string[]                  // button texts/URLs by index
 *    }
 */
export type TemplateVariables =
    | string[]
    | {
    header?:  string;
    body?:    Record<string,string>;
    buttons?: string[];
};

export interface TemplateDef {
    name: string;
    language: string;
    components: ComponentDef[];
}

export interface SendMessageOptions {
    senderUserId: string;
    senderPhoneNumber: string;
    accessToken: string;
    to: string;           // E.164 recipient
    messagePayload: any;  // full payload shape
}

export interface WebhookMessage {
    id: string;
    from: string;
    to: string;
    timestamp: number;
    text?: { body: string };
    image?: { id?: string; mime_type?: string; sha256?: string };
    document?: { id?: string; filename?: string; mime_type?: string };
    video?: { id?: string; mime_type?: string };
    audio?: { id?: string; mime_type?: string };
}

export interface WebhookStatus {
    id: string;
    status: string;
    timestamp: number;
    [key: string]: any;
}

export interface WebhookEntryChangeValue {
    messaging_product: 'whatsapp';
    metadata: { phone_number_id: string; display_phone_number: string };
    messages?: WebhookMessage[];
    statuses?: WebhookStatus[];
}

export interface WebhookEntryChange {
    field: string;
    value: WebhookEntryChangeValue;
}

export interface WebhookEntry {
    id: string;
    changes: WebhookEntryChange[];
}

export interface WebhookPayload {
    object: 'whatsapp_business_account';
    entry: WebhookEntry[];
}

// src/store.ts

export interface MessageStore {
    saveIncomingMessage(
        accountId: string,
        msg: WebhookMessage
    ): Promise<void>;

    saveOutgoingMessage(
        accountId: string,
        opts: SendMessageOptions,
        response: any
    ): Promise<void>;

    saveMessageStatus?(
        accountId: string,
        status: WebhookStatus
    ): Promise<void>;
}

