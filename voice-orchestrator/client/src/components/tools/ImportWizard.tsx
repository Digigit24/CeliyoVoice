import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, FileText, ArrowLeft, Loader2, CheckCircle, AlertCircle, FileCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/axios';
import { toast } from '@/hooks/useToast';

interface ImportResult {
  collectionName: string;
  imported: number;
  skipped: number;
  errors: Array<{ toolName: string; error: string }>;
  tools: Array<{ id: string; name: string }>;
}

interface Credential {
  id: string;
  name: string;
  authType: string;
}

interface Agent {
  id: string;
  name: string;
}

type Step = 'source' | 'ctd-upload' | 'swagger-upload' | 'preview' | 'result';

interface ImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportWizard({ open, onOpenChange }: ImportWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('source');
  const [jsonText, setJsonText] = useState('');
  const [parsedCtd, setParsedCtd] = useState<Record<string, unknown> | null>(null);
  const [parseError, setParseError] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [agentId, setAgentId] = useState('');
  const [swaggerPrefix, setSwaggerPrefix] = useState('');
  const [swaggerInclude, setSwaggerInclude] = useState('');
  const [swaggerExclude, setSwaggerExclude] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Credentials available for linking (used in future enhancement)
  useQuery<{ success: boolean; data: Credential[] }>({
    queryKey: ['tool-credentials'],
    queryFn: () => api.get('/tools/credentials').then((r) => r.data),
    enabled: open,
  });

  const { data: agentData } = useQuery<{ success: boolean; data: Agent[] }>({
    queryKey: ['agents-for-import'],
    queryFn: () => api.get('/agents', { params: { limit: 50 } }).then((r) => r.data),
    enabled: open,
  });

  const importMutation = useMutation({
    mutationFn: (ctd: Record<string, unknown>) =>
      api.post('/tools/import/celiyo', ctd, { params: { agentId: agentId || undefined } }).then((r) => r.data.data),
    onSuccess: (result: ImportResult) => {
      setImportResult(result);
      setStep('result');
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      toast({ title: `${result.imported} tools imported` });
    },
    onError: () => toast({ variant: 'destructive', title: 'Import failed' }),
  });

  const swaggerPreviewMutation = useMutation({
    mutationFn: (spec: Record<string, unknown>) =>
      api.post('/tools/import/swagger/preview', {
        spec,
        prefix: swaggerPrefix || undefined,
        includeEndpoints: swaggerInclude ? swaggerInclude.split(',').map((s) => s.trim()) : undefined,
        excludeEndpoints: swaggerExclude ? swaggerExclude.split(',').map((s) => s.trim()) : undefined,
      }).then((r) => r.data.data),
    onSuccess: (ctd: Record<string, unknown>) => {
      setParsedCtd(ctd);
      setJsonText(JSON.stringify(ctd, null, 2));
      setStep('preview');
    },
    onError: () => toast({ variant: 'destructive', title: 'Failed to convert Swagger spec' }),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setJsonText(reader.result as string);
      tryParse(reader.result as string);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const tryParse = (text: string) => {
    try {
      const obj = JSON.parse(text);
      setParsedCtd(obj);
      setParseError('');
    } catch {
      setParsedCtd(null);
      setParseError('Invalid JSON');
    }
  };

  const reset = () => {
    setStep('source');
    setJsonText('');
    setParsedCtd(null);
    setParseError('');
    setImportResult(null);
    setAgentId('');
    setSwaggerPrefix('');
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(reset, 300);
  };

  const ctdTools = (parsedCtd as { tools?: unknown[] })?.tools ?? [];
  const ctdName = (parsedCtd as { name?: string })?.name ?? 'Unknown';
  const ctdAuth = (parsedCtd as { auth?: { type?: string } })?.auth;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step !== 'source' && step !== 'result' && (
              <Button variant="ghost" size="sm" onClick={() => setStep('source')} className="h-7 w-7 p-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {step === 'source' && 'Import Tools'}
            {step === 'ctd-upload' && 'Import — Celiyo CTD File'}
            {step === 'swagger-upload' && 'Import — Swagger / OpenAPI'}
            {step === 'preview' && 'Review & Import'}
            {step === 'result' && 'Import Complete'}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Source Selection */}
        {step === 'source' && (
          <div className="grid grid-cols-2 gap-4 py-4">
            <button
              onClick={() => setStep('ctd-upload')}
              className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:border-primary hover:bg-muted/50"
            >
              <FileText className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Celiyo CTD File</p>
                <p className="mt-1 text-xs text-muted-foreground">Upload a Celiyo Tool Definition JSON file</p>
              </div>
            </button>
            <button
              onClick={() => setStep('swagger-upload')}
              className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:border-primary hover:bg-muted/50"
            >
              <FileCode className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Swagger / OpenAPI</p>
                <p className="mt-1 text-xs text-muted-foreground">Upload an OpenAPI spec — we'll convert it for review</p>
              </div>
            </button>
          </div>
        )}

        {/* Step 2A: CTD Upload */}
        {step === 'ctd-upload' && (
          <div className="space-y-4">
            <div
              className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center cursor-pointer hover:border-primary hover:bg-muted/50"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm">Drop JSON file here or click to browse</p>
              <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
            </div>
            <div className="space-y-2">
              <Label>Or paste JSON</Label>
              <Textarea
                value={jsonText}
                onChange={(e) => { setJsonText(e.target.value); tryParse(e.target.value); }}
                placeholder='{"celiyo_version": "1.0", "name": "...", "tools": [...]}'
                rows={8}
                className="font-mono text-xs"
              />
              {parseError && <p className="text-xs text-destructive">{parseError}</p>}
            </div>
            <Button
              onClick={() => { tryParse(jsonText); if (parsedCtd) setStep('preview'); }}
              disabled={!parsedCtd}
              className="w-full"
            >
              Preview Tools
            </Button>
          </div>
        )}

        {/* Step 2B: Swagger Upload */}
        {step === 'swagger-upload' && (
          <div className="space-y-4">
            <div
              className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center cursor-pointer hover:border-primary hover:bg-muted/50"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm">Drop OpenAPI spec file or click to browse</p>
              <input ref={fileInputRef} type="file" accept=".json,.yaml,.yml" className="hidden" onChange={handleFileUpload} />
            </div>
            <div className="space-y-2">
              <Label>Or paste spec JSON</Label>
              <Textarea
                value={jsonText}
                onChange={(e) => { setJsonText(e.target.value); tryParse(e.target.value); }}
                rows={6}
                className="font-mono text-xs"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Name prefix</Label>
                <Input value={swaggerPrefix} onChange={(e) => setSwaggerPrefix(e.target.value)} placeholder="crm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Include paths</Label>
                <Input value={swaggerInclude} onChange={(e) => setSwaggerInclude(e.target.value)} placeholder="/customers/*" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Exclude paths</Label>
                <Input value={swaggerExclude} onChange={(e) => setSwaggerExclude(e.target.value)} placeholder="/internal/*" />
              </div>
            </div>
            <Button
              onClick={() => { if (parsedCtd) swaggerPreviewMutation.mutate(parsedCtd); }}
              disabled={!parsedCtd || swaggerPreviewMutation.isPending}
              className="w-full"
            >
              {swaggerPreviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Preview as CTD'}
            </Button>
          </div>
        )}

        {/* Preview */}
        {step === 'preview' && parsedCtd && (
          <div className="space-y-4">
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{ctdName}</span>
                <Badge variant="outline">{ctdTools.length} tools</Badge>
              </div>
              <div className="mt-3 max-h-48 overflow-y-auto space-y-1">
                {ctdTools.map((t, i) => {
                  const tool = t as { name?: string; method?: string; endpoint?: string };
                  return (
                    <div key={i} className="flex items-center gap-2 py-1 text-xs">
                      <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                      <span className="font-mono font-medium">{tool.name}</span>
                      {tool.method && <Badge variant="outline" className="text-[10px]">{tool.method}</Badge>}
                      {tool.endpoint && <span className="text-muted-foreground truncate">{tool.endpoint}</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {ctdAuth && (
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Authentication: <span className="font-medium">{ctdAuth.type}</span>
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Skip duplicate tool names</Label>
                <Switch checked={skipDuplicates} onCheckedChange={setSkipDuplicates} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Attach to agent (optional)</Label>
                <Select value={agentId || 'NONE'} onValueChange={(v) => setAgentId(v === 'NONE' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="No agent" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No agent</SelectItem>
                    {(agentData?.data ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={() => importMutation.mutate(parsedCtd)}
              disabled={importMutation.isPending}
              className="w-full"
            >
              {importMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                `Import ${ctdTools.length} tools`
              )}
            </Button>
          </div>
        )}

        {/* Result */}
        {step === 'result' && importResult && (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-2 py-4">
              <CheckCircle className="h-10 w-10 text-green-500" />
              <p className="font-medium">Import Complete</p>
            </div>
            <div className="space-y-2 text-sm">
              <p>Collection: <span className="font-medium">{importResult.collectionName}</span></p>
              <p className="text-green-600">{importResult.imported} tools imported</p>
              {importResult.skipped > 0 && <p className="text-muted-foreground">{importResult.skipped} skipped (duplicates)</p>}
              {importResult.errors.length > 0 && (
                <div>
                  <p className="text-destructive">{importResult.errors.length} errors:</p>
                  {importResult.errors.map((e, i) => (
                    <p key={i} className="flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3" /> {e.toolName}: {e.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={handleClose} className="w-full">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
