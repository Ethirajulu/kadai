import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// Message Document
@Schema({ timestamps: true })
export class Message {
  @Prop({ required: true })
  messageId!: string;

  @Prop({ required: true })
  sessionId!: string;

  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true, enum: ['user', 'assistant', 'system'] })
  sender!: 'user' | 'assistant' | 'system';

  @Prop({ required: true })
  content!: string;

  @Prop({ default: 'text', enum: ['text', 'image', 'audio', 'file'] })
  messageType!: 'text' | 'image' | 'audio' | 'file';

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, any>;

  @Prop({ default: Date.now })
  timestamp!: Date;

  @Prop({ default: false })
  isDeleted!: boolean;
}

export type MessageDocument = Message & Document;
export const MessageSchema = SchemaFactory.createForClass(Message);

// Chat Session Document
@Schema({ timestamps: true })
export class ChatSession {
  @Prop({ required: true })
  sessionId!: string;

  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true, enum: ['whatsapp', 'telegram', 'instagram', 'web'] })
  platform!: 'whatsapp' | 'telegram' | 'instagram' | 'web';

  @Prop({
    required: true,
    enum: ['active', 'inactive', 'completed', 'abandoned'],
  })
  status!: 'active' | 'inactive' | 'completed' | 'abandoned';

  @Prop({ default: Date.now })
  startTime!: Date;

  @Prop()
  endTime!: Date;

  @Prop({ default: 0 })
  messageCount!: number;

  @Prop({ type: Object, default: {} })
  context!: Record<string, any>;

  @Prop({ type: Object, default: {} })
  userProfile!: Record<string, any>;

  @Prop({
    default: 'hi',
    enum: [
      'hi',
      'en',
      'bn',
      'ta',
      'te',
      'ml',
      'kn',
      'gu',
      'pa',
      'or',
      'as',
      'mr',
    ],
  })
  language!: string;

  @Prop({ type: Object, default: {} })
  sessionMetadata!: Record<string, any>;

  @Prop({ default: false })
  isArchived!: boolean;

  // TTL index for automatic cleanup (30 days)
  @Prop({ default: Date.now, expires: '30d' })
  expiresAt!: Date;
}

export type ChatSessionDocument = ChatSession & Document;
export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);

// Conversation History Document
@Schema({ timestamps: true })
export class ConversationHistory {
  @Prop({ required: true })
  historyId!: string;

  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  sessionId!: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Message' }] })
  messages!: Types.ObjectId[];

  @Prop({ required: true })
  conversationSummary!: string;

  @Prop({ type: Object, default: {} })
  analytics!: Record<string, any>;

  @Prop({ default: Date.now })
  summarizedAt!: Date;

  @Prop({ default: false })
  isProcessed!: boolean;

  // TTL index for automatic cleanup (90 days)
  @Prop({ default: Date.now, expires: '90d' })
  expiresAt!: Date;
}

export type ConversationHistoryDocument = ConversationHistory & Document;
export const ConversationHistorySchema =
  SchemaFactory.createForClass(ConversationHistory);

// Index configurations
MessageSchema.index({ sessionId: 1, timestamp: 1 });
MessageSchema.index({ userId: 1, timestamp: -1 });
MessageSchema.index({ messageId: 1 }, { unique: true });
MessageSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 }); // 30 days TTL

ChatSessionSchema.index({ sessionId: 1 }, { unique: true });
ChatSessionSchema.index({ userId: 1, startTime: -1 });
ChatSessionSchema.index({ platform: 1, status: 1 });
ChatSessionSchema.index({ status: 1, startTime: -1 });

ConversationHistorySchema.index({ historyId: 1 }, { unique: true });
ConversationHistorySchema.index({ userId: 1, summarizedAt: -1 });
ConversationHistorySchema.index({ sessionId: 1 });
ConversationHistorySchema.index({ isProcessed: 1 });
