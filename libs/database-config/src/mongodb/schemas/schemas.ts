import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Message Schema for individual chat messages
@Schema({ timestamps: true })
export class Message {
  @Prop({ required: true })
  messageId!: string;

  @Prop({ required: true })
  sessionId!: string;

  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true, enum: ['user', 'assistant', 'system'] })
  sender!: string;

  @Prop({ required: true })
  content!: string;

  @Prop({ default: 'text', enum: ['text', 'image', 'audio', 'file'] })
  messageType!: string;

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, any>;

  @Prop({ default: Date.now })
  timestamp!: Date;

  @Prop({ default: false })
  isDeleted!: boolean;
}

export type MessageDocument = Message & Document;
export const MessageSchema = SchemaFactory.createForClass(Message);

// Indexes for Message collection
MessageSchema.index({ sessionId: 1, timestamp: 1 }); // For session-based queries
MessageSchema.index({ userId: 1, timestamp: -1 }); // For user message history
MessageSchema.index({ messageId: 1 }, { unique: true }); // Unique constraint
MessageSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 }); // TTL: 30 days
MessageSchema.index({ sender: 1, timestamp: -1 }); // For filtering by sender
MessageSchema.index({ messageType: 1 }); // For filtering by message type
MessageSchema.index({ 'metadata.platform': 1 }); // For platform-specific queries
MessageSchema.index({ isDeleted: 1 }); // For soft delete queries
MessageSchema.index({ sessionId: 1, sender: 1 }); // Compound for session + sender
MessageSchema.index({ userId: 1, messageType: 1 }); // For user content type analysis
MessageSchema.index({ content: 'text' }); // Text search index
MessageSchema.index({ sessionId: 1, messageId: 1 }); // For message lookup within session

// Chat Session Schema for conversation sessions
@Schema({ timestamps: true })
export class ChatSession {
  @Prop({ required: true })
  sessionId!: string;

  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true, enum: ['whatsapp', 'telegram', 'instagram', 'web'] })
  platform!: string;

  @Prop({ required: true, enum: ['active', 'inactive', 'completed', 'abandoned'] })
  status!: string;

  @Prop({ default: Date.now })
  startTime!: Date;

  @Prop()
  endTime?: Date;

  @Prop({ default: 0 })
  messageCount!: number;

  @Prop({ type: Object, default: {} })
  context!: Record<string, any>;

  @Prop({ type: Object, default: {} })
  userProfile!: Record<string, any>;

  @Prop({ default: 'hi' })
  language!: string;

  @Prop({ type: Object, default: {} })
  sessionMetadata!: Record<string, any>;

  @Prop({ default: false })
  isArchived!: boolean;

  @Prop()
  expiresAt?: Date;
}

export type ChatSessionDocument = ChatSession & Document;
export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);

// Indexes for ChatSession collection
ChatSessionSchema.index({ sessionId: 1 }, { unique: true }); // Unique constraint
ChatSessionSchema.index({ userId: 1, startTime: -1 }); // For user session history
ChatSessionSchema.index({ platform: 1, status: 1 }); // For platform analytics
ChatSessionSchema.index({ status: 1, startTime: -1 }); // For status-based queries
ChatSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
ChatSessionSchema.index({ isArchived: 1 }); // For archive queries
ChatSessionSchema.index({ language: 1 }); // For language-based analytics
ChatSessionSchema.index({ userId: 1, platform: 1 }); // User platform sessions

// Conversation History Schema for processed conversations
@Schema({ timestamps: true })
export class ConversationHistory {
  @Prop({ required: true })
  historyId!: string;

  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  sessionId!: string;

  @Prop({ type: [String], default: [] })
  messages!: string[];

  @Prop({ required: true })
  conversationSummary!: string;

  @Prop({ type: Object, default: {} })
  analytics!: Record<string, any>;

  @Prop({ default: Date.now })
  summarizedAt!: Date;

  @Prop({ default: false })
  isProcessed!: boolean;

  @Prop()
  expiresAt?: Date;
}

export type ConversationHistoryDocument = ConversationHistory & Document;
export const ConversationHistorySchema = SchemaFactory.createForClass(ConversationHistory);

// Indexes for ConversationHistory collection
ConversationHistorySchema.index({ historyId: 1 }, { unique: true }); // Unique constraint
ConversationHistorySchema.index({ userId: 1, summarizedAt: -1 }); // For user history
ConversationHistorySchema.index({ sessionId: 1 }); // For session lookup
ConversationHistorySchema.index({ isProcessed: 1 }); // For processing queue
ConversationHistorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index