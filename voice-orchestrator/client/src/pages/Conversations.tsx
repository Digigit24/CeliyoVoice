import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Loader2, Trash2, Archive, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
// Card components available if needed for future enhancements
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/axios';
import { toast } from '@/hooks/useToast';

interface Conversation {
  id: string;
  title?: string | null;
  status: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  channel: string;
  lastMessageAt?: string | null;
  createdAt: string;
  _count?: { messages: number };
  agent?: { id: string; name: string; agentType: string };
}

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

interface ConversationsResponse {
  success: boolean;
  data: Conversation[];
  pagination: { total: number; page: number; limit: number };
}

interface ConversationDetailResponse {
  success: boolean;
  data: Conversation & { messages: Message[] };
}

const STATUS_VARIANTS: Record<string, 'success' | 'secondary' | 'destructive'> = {
  ACTIVE: 'success',
  ARCHIVED: 'secondary',
  DELETED: 'destructive',
};

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function Conversations() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [convToDelete, setConvToDelete] = useState<string | null>(null);

  const { data, isLoading } = useQuery<ConversationsResponse>({
    queryKey: ['conversations-page', search, statusFilter],
    queryFn: () =>
      api
        .get('/conversations', {
          params: {
            search: search || undefined,
            status: statusFilter || undefined,
            limit: 50,
          },
        })
        .then((r) => r.data),
  });

  const { data: detailData, isLoading: detailLoading } = useQuery<ConversationDetailResponse>({
    queryKey: ['conversation-detail', selectedConvId],
    queryFn: () => api.get(`/conversations/${selectedConvId}`).then((r) => r.data),
    enabled: Boolean(selectedConvId),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/conversations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations-page'] });
      setDeleteDialogOpen(false);
      if (selectedConvId === convToDelete) setSelectedConvId(null);
      toast({ title: 'Conversation deleted' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to delete' }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/conversations/${id}`, { status: 'ARCHIVED' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations-page'] });
      toast({ title: 'Conversation archived' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to archive' }),
  });

  const conversations = data?.data ?? [];
  const messages = detailData?.data?.messages ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Conversations</h1>
        <p className="text-sm text-muted-foreground">Chat conversation history across all agents</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search conversations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter || 'ALL'} onValueChange={(v) => setStatusFilter(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-4 h-[600px]">
        {/* Conversation list */}
        <div className="w-96 shrink-0 overflow-y-auto rounded-lg border">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex h-40 items-center justify-center">
              <div className="text-center">
                <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">No conversations found</p>
              </div>
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setSelectedConvId(conv.id)}
                className={`cursor-pointer border-b p-3 transition-colors hover:bg-muted/50 ${
                  selectedConvId === conv.id ? 'bg-muted' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {conv.title ?? 'Untitled conversation'}
                      </p>
                      <Badge variant={STATUS_VARIANTS[conv.status] ?? 'secondary'} className="text-[10px] shrink-0">
                        {conv.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      {conv.agent && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Bot className="h-3 w-3" />
                          {conv.agent.name}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {conv._count?.messages ?? 0} msgs
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(conv.lastMessageAt ?? conv.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1 ml-2">
                    {conv.status === 'ACTIVE' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(e) => { e.stopPropagation(); archiveMutation.mutate(conv.id); }}
                        title="Archive"
                      >
                        <Archive className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConvToDelete(conv.id);
                        setDeleteDialogOpen(true);
                      }}
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Message detail panel */}
        <div className="flex-1 overflow-y-auto rounded-lg border p-4">
          {!selectedConvId ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">Select a conversation to view messages</p>
            </div>
          ) : detailLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {messages.filter((m) => m.role === 'USER' || m.role === 'ASSISTANT').map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === 'USER' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === 'USER'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className="mt-1 text-[10px] opacity-60">{formatDate(msg.createdAt)}</p>
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
                <p className="text-center text-sm text-muted-foreground">No messages</p>
              )}
              {detailData?.data?.agent && detailData.data.status === 'ACTIVE' && (
                <div className="text-center pt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/agents/${detailData.data.agent!.id}`)}
                  >
                    Continue in Agent Chat
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Conversation</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure? This will soft-delete the conversation and its messages.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => convToDelete && deleteMutation.mutate(convToDelete)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
