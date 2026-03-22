import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  Plus,
  Loader2,
  MessageSquare,
  Bot,
  User,
  Paperclip,
  X,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/axios';
import { useAuthStore } from '@/store/authStore';

// ── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'SYSTEM' | 'USER' | 'ASSISTANT' | 'TOOL_CALL' | 'TOOL_RESULT';
  content: string;
  tokenCount?: number | null;
  metadata?: { error?: boolean; errorMessage?: string } | null;
  createdAt: string;
}

interface Conversation {
  id: string;
  title?: string | null;
  status: string;
  lastMessageAt?: string | null;
  createdAt: string;
  _count?: { messages: number };
}

interface ConversationsResponse {
  success: boolean;
  data: Conversation[];
  pagination: { total: number };
}

interface ConversationDetailResponse {
  success: boolean;
  data: Conversation & { messages: Message[] };
}

interface AttachedFile {
  id: string;
  file: File;
  preview?: string; // data URL for images
}

interface ChatPlaygroundProps {
  agentId: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMessageTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-1 inline-flex items-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      title="Copy"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function isErrorMessage(msg: Message): boolean {
  return (
    msg.content === 'error' ||
    (msg.metadata as { error?: boolean } | null)?.error === true
  );
}

// ── Markdown-lite renderer (code blocks, bold, links) ────────────────────────

function renderContent(text: string): React.ReactNode {
  if (!text) return null;

  // Split by code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const inner = part.slice(3, -3);
      const newlineIdx = inner.indexOf('\n');
      const lang = newlineIdx > 0 ? inner.slice(0, newlineIdx).trim() : '';
      const code = newlineIdx > 0 ? inner.slice(newlineIdx + 1) : inner;
      return (
        <div key={i} className="my-2 rounded-md bg-zinc-900 dark:bg-zinc-950 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800 dark:bg-zinc-900 text-zinc-400 text-xs">
            <span>{lang || 'code'}</span>
            <CopyButton text={code} />
          </div>
          <pre className="p-3 overflow-x-auto text-xs text-zinc-100 leading-relaxed">
            <code>{code}</code>
          </pre>
        </div>
      );
    }

    // Inline formatting: **bold**, `inline code`
    const inlineParts = part.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return (
      <span key={i}>
        {inlineParts.map((ip, j) => {
          if (ip.startsWith('**') && ip.endsWith('**')) {
            return <strong key={j}>{ip.slice(2, -2)}</strong>;
          }
          if (ip.startsWith('`') && ip.endsWith('`')) {
            return (
              <code key={j} className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
                {ip.slice(1, -1)}
              </code>
            );
          }
          return <span key={j}>{ip}</span>;
        })}
      </span>
    );
  });
}

// ── User message with file indicators ────────────────────────────────────────

function UserMessageContent({ content }: { content: string }) {
  // Detect file references in content: [filename.ext] or [File: name] or [Image: name]
  const filePattern = /\[(File|Image|Attached file): ([^\]]+)\]/g;
  const hasFiles = filePattern.test(content);

  if (!hasFiles) {
    return <p className="whitespace-pre-wrap">{content}</p>;
  }

  // Split content into text before files and file indicators
  const textBeforeFiles = content.split(/\n\n\[(?:File|Image|Attached file):/)[0]?.trim();
  const fileMatches = [...content.matchAll(/\[(File|Image|Attached file): ([^\]]+)\]/g)];

  return (
    <div>
      {textBeforeFiles && <p className="whitespace-pre-wrap">{textBeforeFiles}</p>}
      {fileMatches.length > 0 && (
        <div className={`flex flex-wrap gap-1.5 ${textBeforeFiles ? 'mt-2' : ''}`}>
          {fileMatches.map((match, i) => {
            const type = match[1];
            const name = match[2]?.split('(')[0]?.trim() ?? 'file';
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded bg-primary-foreground/20 px-2 py-0.5 text-xs"
              >
                {type === 'Image' ? (
                  <ImageIcon className="h-3 w-3" />
                ) : (
                  <FileText className="h-3 w-3" />
                )}
                {name}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ChatPlayground({ agentId }: ChatPlaygroundProps) {
  const queryClient = useQueryClient();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch conversations for this agent, ordered by latest
  const { data: convData } = useQuery<ConversationsResponse>({
    queryKey: ['conversations', agentId],
    queryFn: () =>
      api
        .get('/conversations', {
          params: { agentId, limit: 30, sortBy: 'lastMessageAt', sortOrder: 'desc' },
        })
        .then((r) => r.data),
  });

  // Fetch active conversation messages
  const { data: activeConvData } = useQuery<ConversationDetailResponse>({
    queryKey: ['conversation', activeConversationId],
    queryFn: () =>
      api.get(`/conversations/${activeConversationId}`).then((r) => r.data),
    enabled: Boolean(activeConversationId),
  });

  const conversations = convData?.data ?? [];
  const serverMessages = activeConvData?.data?.messages ?? [];
  const displayMessages = activeConversationId
    ? [...serverMessages, ...localMessages]
    : localMessages;

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages.length, streamingContent]);

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const newAttachments: AttachedFile[] = files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));
    setAttachedFiles((prev) => [...prev, ...newAttachments]);
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    setAttachedFiles((prev) => {
      const removed = prev.find((f) => f.id === id);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  // ── File reader helpers ─────────────────────────────────────────────────────

  const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsText(file);
    });

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsDataURL(file);
    });

  const isTextFile = (file: File): boolean => {
    const textTypes = [
      'text/', 'application/json', 'application/xml', 'application/javascript',
      'application/typescript', 'application/csv', 'application/x-yaml',
    ];
    const textExtensions = ['.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml', '.js', '.ts', '.py', '.html', '.css', '.sql', '.sh', '.log', '.env'];
    if (textTypes.some((t) => file.type.startsWith(t))) return true;
    return textExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
  };

  // ── Send message ───────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = input.trim();
    const hasFiles = attachedFiles.length > 0;
    if ((!text && !hasFiles) || isStreaming) return;

    // Read file contents and build the full message
    let messageText = text;
    const fileInfoParts: string[] = [];

    if (hasFiles) {
      for (const af of attachedFiles) {
        try {
          if (af.file.type.startsWith('image/')) {
            // Convert image to base64 data URL and describe it
            const dataUrl = await readFileAsDataUrl(af.file);
            fileInfoParts.push(
              `[Image: ${af.file.name}]\n<image_data>${dataUrl}</image_data>`,
            );
          } else if (isTextFile(af.file)) {
            // Read text file contents directly
            const content = await readFileAsText(af.file);
            const truncated = content.length > 50000 ? content.slice(0, 50000) + '\n...(truncated)' : content;
            fileInfoParts.push(
              `[File: ${af.file.name}]\n\`\`\`\n${truncated}\n\`\`\``,
            );
          } else {
            // Binary files — describe them but can't send content
            fileInfoParts.push(
              `[Attached file: ${af.file.name} (${(af.file.size / 1024).toFixed(1)}KB, ${af.file.type || 'binary'})]`,
            );
          }
        } catch {
          fileInfoParts.push(`[Failed to read file: ${af.file.name}]`);
        }
      }

      const fileContent = fileInfoParts.join('\n\n');
      messageText = messageText
        ? `${messageText}\n\n${fileContent}`
        : fileContent;
    }

    // Save display text (shorter version for UI) and full text for API
    const displayText = text || attachedFiles.map((f) => `[${f.file.name}]`).join(' ');

    setInput('');
    setAttachedFiles([]);

    // Optimistic user message — show display-friendly version in UI
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'USER',
      content: displayText,
      createdAt: new Date().toISOString(),
    };
    setLocalMessages((prev) => [...prev, userMsg]);

    setIsStreaming(true);
    setStreamingContent('');

    try {
      const token = useAuthStore.getState().token;
      const response = await fetch(`/api/v1/agents/${agentId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: messageText,
          conversationId: activeConversationId || undefined,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error?.message ?? `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let convId = activeConversationId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) continue;
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            try {
              const parsed = JSON.parse(jsonStr);

              if (parsed.conversationId && !convId) {
                convId = parsed.conversationId;
                setActiveConversationId(convId);
              }

              if (parsed.content) {
                accumulated += parsed.content;
                setStreamingContent(accumulated);
              }

              if (parsed.error) {
                accumulated += accumulated ? `\n\n[Error: ${parsed.error}]` : `Error: ${parsed.error}`;
                setStreamingContent(accumulated);
              }
            } catch {
              // skip
            }
          }
        }
      }

      // Finalize
      if (accumulated) {
        setLocalMessages((prev) => [
          ...prev,
          {
            id: `temp-assistant-${Date.now()}`,
            role: 'ASSISTANT',
            content: accumulated,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message';
      setLocalMessages((prev) => [
        ...prev,
        {
          id: `temp-error-${Date.now()}`,
          role: 'ASSISTANT',
          content: message,
          metadata: { error: true, errorMessage: message },
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
      queryClient.invalidateQueries({ queryKey: ['conversations', agentId] });
      if (activeConversationId) {
        queryClient.invalidateQueries({ queryKey: ['conversation', activeConversationId] });
        setLocalMessages([]);
      }
    }
  }, [input, attachedFiles, isStreaming, agentId, activeConversationId, queryClient]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setLocalMessages([]);
    setStreamingContent('');
    setAttachedFiles([]);
    textareaRef.current?.focus();
  };

  const selectConversation = (convId: string) => {
    setActiveConversationId(convId);
    setLocalMessages([]);
    setStreamingContent('');
    setAttachedFiles([]);
  };

  // ── Group messages by date ─────────────────────────────────────────────────

  const visibleMessages = displayMessages.filter(
    (m) => m.role === 'USER' || m.role === 'ASSISTANT',
  );

  const groupedByDate: { date: string; messages: Message[] }[] = [];
  let lastDate = '';
  for (const msg of visibleMessages) {
    const dateKey = new Date(msg.createdAt).toDateString();
    if (dateKey !== lastDate) {
      groupedByDate.push({ date: msg.createdAt, messages: [] });
      lastDate = dateKey;
    }
    groupedByDate[groupedByDate.length - 1]!.messages.push(msg);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full rounded-lg border">
      {/* ── Sidebar — conversation list ── */}
      <div className="w-72 shrink-0 border-r flex flex-col bg-muted/20">
        <div className="flex items-center justify-between border-b p-3">
          <span className="text-sm font-medium">Conversations</span>
          <Button variant="ghost" size="sm" onClick={handleNewConversation} title="New conversation">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => selectConversation(conv.id)}
              className={`flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 ${
                activeConversationId === conv.id ? 'bg-muted' : ''
              }`}
            >
              <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium leading-tight">
                  {conv.title ?? 'New conversation'}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {conv._count?.messages ?? 0} msgs
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelativeDate(conv.lastMessageAt ?? conv.createdAt)}
                  </span>
                </div>
              </div>
            </button>
          ))}
          {conversations.length === 0 && (
            <div className="p-6 text-center">
              <MessageSquare className="mx-auto h-6 w-6 text-muted-foreground/50" />
              <p className="mt-2 text-xs text-muted-foreground">No conversations yet</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Main chat area ── */}
      <div className="flex flex-1 flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {visibleMessages.length === 0 && !streamingContent && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center max-w-xs">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm font-medium">Start a conversation</p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  Send a message to begin chatting. You can also attach files to include context.
                </p>
              </div>
            </div>
          )}

          {groupedByDate.map((group) => (
            <div key={group.date}>
              {/* Date separator */}
              <div className="flex items-center gap-3 my-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {formatDateHeader(group.date)}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {group.messages.map((msg) => {
                const isError = isErrorMessage(msg);
                const errorMessage = (msg.metadata as { errorMessage?: string } | null)?.errorMessage;

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 mb-4 ${msg.role === 'USER' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'ASSISTANT' && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
                        {isError ? (
                          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                        ) : (
                          <Bot className="h-3.5 w-3.5 text-primary" />
                        )}
                      </div>
                    )}
                    <div className="max-w-[75%] group">
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 text-sm ${
                          msg.role === 'USER'
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : isError
                              ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-bl-md'
                              : 'bg-muted rounded-bl-md'
                        }`}
                      >
                        {isError ? (
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-medium text-xs">Error</p>
                              <p className="text-xs mt-0.5 opacity-80">
                                {errorMessage || msg.content}
                              </p>
                            </div>
                          </div>
                        ) : msg.role === 'USER' ? (
                          <UserMessageContent content={msg.content} />
                        ) : (
                          <div className="whitespace-pre-wrap leading-relaxed">
                            {renderContent(msg.content)}
                          </div>
                        )}
                      </div>
                      <div className={`mt-1 flex items-center gap-1.5 ${
                        msg.role === 'USER' ? 'justify-end' : 'justify-start'
                      }`}>
                        <span className="text-[10px] text-muted-foreground">
                          {formatMessageTime(msg.createdAt)}
                        </span>
                        {msg.role === 'ASSISTANT' && !isError && msg.content && (
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <CopyButton text={msg.content} />
                          </span>
                        )}
                        {msg.tokenCount && (
                          <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                            {msg.tokenCount} tokens
                          </span>
                        )}
                      </div>
                    </div>
                    {msg.role === 'USER' && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary mt-0.5">
                        <User className="h-3.5 w-3.5 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Streaming response */}
          {isStreaming && (
            <div className="flex gap-3 mb-4">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="max-w-[75%]">
                <div className="rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-sm">
                  {streamingContent ? (
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {renderContent(streamingContent)}
                      <span className="inline-block h-4 w-0.5 ml-0.5 animate-pulse bg-foreground/60 align-middle" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:300ms]" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── File attachments preview ── */}
        {attachedFiles.length > 0 && (
          <div className="border-t px-3 pt-2 pb-1">
            <div className="flex flex-wrap gap-2">
              {attachedFiles.map((af) => (
                <div
                  key={af.id}
                  className="relative flex items-center gap-2 rounded-lg border bg-muted/50 px-2.5 py-1.5 text-xs"
                >
                  {af.preview ? (
                    <img
                      src={af.preview}
                      alt={af.file.name}
                      className="h-8 w-8 rounded object-cover"
                    />
                  ) : af.file.type.startsWith('image/') ? (
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="max-w-[120px] truncate">{af.file.name}</span>
                  <span className="text-muted-foreground">
                    {(af.file.size / 1024).toFixed(0)}KB
                  </span>
                  <button
                    onClick={() => removeFile(af.id)}
                    className="ml-1 rounded-full p-0.5 hover:bg-background transition-colors"
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Input area ── */}
        <div className="border-t p-3">
          <div className="flex items-end gap-2">
            {/* File upload button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 shrink-0 p-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              accept="image/*,.pdf,.txt,.csv,.json,.md,.doc,.docx,.xls,.xlsx"
            />

            {/* Text input */}
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
                rows={1}
                className="min-h-[40px] max-h-[140px] resize-none pr-2"
                disabled={isStreaming}
              />
            </div>

            {/* Send button */}
            <Button
              onClick={handleSend}
              disabled={(!input.trim() && attachedFiles.length === 0) || isStreaming}
              size="sm"
              className="h-10 w-10 shrink-0 p-0"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Responses stream in real-time. Attach files to provide context to the agent.
          </p>
        </div>
      </div>
    </div>
  );
}
