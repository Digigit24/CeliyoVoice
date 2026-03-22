import { z } from 'zod';

export const ChatMessageSchema = z.object({
  message: z.string().min(1).max(32000),
  conversationId: z.string().uuid().optional(),
  stream: z.boolean().optional().default(false),
  metadata: z.record(z.unknown()).optional(),
});

export const ListConversationsQuerySchema = z.object({
  page: z.string().optional().transform((v) => Math.max(1, parseInt(v ?? '1', 10) || 1)),
  limit: z.string().optional().transform((v) => Math.min(100, Math.max(1, parseInt(v ?? '20', 10) || 20))),
  agentId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'DELETED']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'lastMessageAt']).optional().default('lastMessageAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const ListMessagesQuerySchema = z.object({
  page: z.string().optional().transform((v) => Math.max(1, parseInt(v ?? '1', 10) || 1)),
  limit: z.string().optional().transform((v) => Math.min(100, Math.max(1, parseInt(v ?? '50', 10) || 50))),
});

export const UpdateConversationSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});

export type ChatMessageInput = z.infer<typeof ChatMessageSchema>;
export type ListConversationsQuery = z.infer<typeof ListConversationsQuerySchema>;
export type UpdateConversationInput = z.infer<typeof UpdateConversationSchema>;
