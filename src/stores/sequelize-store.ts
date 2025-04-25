// src/sequelize-store.ts
import { Sequelize, Model, DataTypes } from 'sequelize';
import {
    MessageStore,
    SendMessageOptions,
    WebhookMessage,
    WebhookStatus
} from '../types';

// -- define your models once --
export class Message extends Model {}
export class MessageStatus extends Model {}

export function initModels(sequelize: Sequelize) {
    Message.init({
        accountId: { type: DataTypes.STRING,  allowNull: false },
        messageId: { type: DataTypes.STRING,  allowNull: false },
        from:      { type: DataTypes.STRING,  allowNull: false },
        to:        { type: DataTypes.STRING,  allowNull: false },
        direction: { type: DataTypes.ENUM('in','out'), allowNull: false },
        timestamp: { type: DataTypes.DATE,    allowNull: false },
        content:   { type: DataTypes.TEXT,    allowNull: false },
        raw:       { type: DataTypes.JSON,    allowNull: false },
    }, { sequelize, tableName: 'whatsapp_messages' });

    MessageStatus.init({
        accountId: { type: DataTypes.STRING, allowNull: false },
        messageId: { type: DataTypes.STRING, allowNull: false },
        status:    { type: DataTypes.STRING, allowNull: false },
        timestamp: { type: DataTypes.DATE,   allowNull: false },
        raw:       { type: DataTypes.JSON,   allowNull: false },
    }, {
        sequelize,
        tableName: 'whatsapp_message_statuses',
        // if you want upsert behavior, add:
        // indexes: [{ unique: true, fields: ['accountId','messageId'] }]
    });

    // make sure tables exist
    return sequelize.sync();
}



export class SequelizeMessageStore implements MessageStore {
    constructor(private sequelize: Sequelize) {
        initModels(this.sequelize);
    }

    async saveIncomingMessage(
        accountId: string,
        msg:       WebhookMessage
    ) {
        await Message.create({
            accountId,
            messageId: msg.id,
            from:      msg.from,
            to:        msg.to,
            direction: 'in',
            timestamp: new Date(msg.timestamp * 1000),
            content:   msg.text?.body ?? JSON.stringify(msg),
            raw:       msg
        });
    }

    async saveOutgoingMessage(
        accountId: string,
        opts:      SendMessageOptions,
        response:  any
    ) {
        await Message.create({
            accountId,
            messageId: response.messages?.[0]?.id ?? null,
            from:      opts.senderPhoneNumber,
            to:        opts.to,
            direction: 'out',
            timestamp: new Date(),
            content:   JSON.stringify(opts.messagePayload),
            raw:       response
        });
    }

    async saveMessageStatus(
        accountId: string,
        status:    WebhookStatus
    ) {
        await MessageStatus.create({
            accountId,
            messageId: status.id,
            status:    status.status,
            timestamp: new Date(status.timestamp * 1000),
            raw:       status
        });
    }
}
