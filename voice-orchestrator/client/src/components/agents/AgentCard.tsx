import { useNavigate } from 'react-router-dom';
import { Bot, RefreshCw, Link } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface AgentCardData {
  id: string;
  name: string;
  provider: string;
  isActive: boolean;
  systemPrompt: string;
  voiceLanguage: string;
  providerAgentId?: string | null;
  callType?: string | null;
  metadata?: {
    importedFrom?: string;
    importedAt?: string;
  } | null;
  _count?: { calls: number };
}

interface AgentCardProps {
  agent: AgentCardData;
}

const PROVIDER_COLORS: Record<string, string> = {
  OMNIDIM: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  BOLNA: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

export function AgentCard({ agent }: AgentCardProps) {
  const navigate = useNavigate();
  const providerColor = PROVIDER_COLORS[agent.provider] ?? 'bg-muted text-muted-foreground';
  const isImported = Boolean(agent.metadata?.importedFrom);

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => navigate(`/agents/${agent.id}`)}
    >
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium leading-none">{agent.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {agent.voiceLanguage} · {agent.callType ?? 'Incoming'}
              </p>
            </div>
          </div>
          <Badge variant={agent.isActive ? 'success' : 'secondary'}>
            {agent.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${providerColor}`}>
            {agent.provider}
          </span>
          {isImported && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <Link className="h-3 w-3" />
              Synced
            </span>
          )}
          {agent._count !== undefined && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {agent._count.calls} call{agent._count.calls !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          {agent.systemPrompt || 'No system prompt set'}
        </p>

        {agent.providerAgentId && (
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            <span className="truncate font-mono">{agent.providerAgentId}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
