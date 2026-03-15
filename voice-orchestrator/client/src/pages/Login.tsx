import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/axios';
import { toast } from '@/hooks/useToast';

/** Decode the JWT payload (second segment) without a library */
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Backend returns { success: true, data: { user, tokens, tenant } }
      const { data: resp } = await api.post('/auth/login', { email, password });
      const payload = resp?.data ?? resp;

      const accessToken: string =
        payload?.tokens?.access ??
        payload?.token ??
        payload?.access ??
        '';

      if (!accessToken) {
        throw new Error('No access token in response');
      }

      const refreshToken: string = payload?.tokens?.refresh ?? '';

      // Decode JWT to get tenant_slug, permissions, enabled_modules
      const jwtPayload = decodeJwtPayload(accessToken);

      const rawUser = payload?.user ?? {};
      const tenant = payload?.tenant ?? {};

      setAuth(accessToken, refreshToken, {
        userId: (rawUser.id as string) ?? (jwtPayload.user_id as string) ?? '',
        email: (rawUser.email as string) ?? email,
        tenantId:
          (rawUser.tenant as string) ??
          (jwtPayload.tenant_id as string) ??
          '',
        tenantSlug:
          (tenant.slug as string) ??
          (jwtPayload.tenant_slug as string) ??
          '',
        tenantName:
          (tenant.name as string) ??
          (rawUser.tenant_name as string) ??
          '',
        isSuperAdmin:
          (rawUser.is_super_admin as boolean) ??
          (jwtPayload.is_super_admin as boolean) ??
          false,
        enabledModules:
          (tenant.enabled_modules as string[]) ??
          (jwtPayload.enabled_modules as string[]) ??
          [],
        permissions: (jwtPayload.permissions as Record<string, unknown>) ?? {},
      });

      navigate('/');
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { detail?: string; message?: string; error?: { message?: string } } };
        message?: string;
      };
      const msg =
        axiosErr?.response?.data?.detail ??
        axiosErr?.response?.data?.message ??
        axiosErr?.response?.data?.error?.message ??
        axiosErr?.message ??
        'Login failed. Check your credentials.';
      toast({ variant: 'destructive', title: 'Login error', description: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Mic2 className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">CeliyoVoice</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
