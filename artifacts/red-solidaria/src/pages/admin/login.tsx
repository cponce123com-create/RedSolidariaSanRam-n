import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAdminLogin } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Lock, ShieldCheck, ArrowLeft } from "lucide-react";

const loginSchema = z.object({
  username: z.string().min(1, "Usuario requerido"),
  password: z.string().min(1, "Contraseña requerida"),
});

const totpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "El código tiene 6 dígitos"),
});

// El cliente generado no conoce twoFactorRequired; lo extendemos localmente.
type LoginResponse = {
  success: boolean;
  message: string;
  user?: unknown;
  twoFactorRequired?: boolean;
  userId?: number;
};

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useAdminLogin();

  // Paso 2 del login: 2FA activo → pedir código TOTP antes de abrir sesión
  const [totpStep, setTotpStep] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" }
  });

  const onSubmit = (values: z.infer<typeof loginSchema>) => {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          const d = data as unknown as LoginResponse;
          if (d.twoFactorRequired) {
            setPendingUserId(d.userId ?? null);
            setTotpStep(true);
            toast({ title: "Verificación en dos pasos", description: "Ingresa el código de tu aplicación autenticadora." });
            return;
          }
          toast({ title: "Acceso concedido" });
          setLocation("/admin/campanas"); // Default redirect
        },
        onError: () => {
          toast({ title: "Error", description: "Credenciales incorrectas", variant: "destructive" });
        }
      }
    );
  };

  const verifyTotp = async () => {
    const parsed = totpSchema.safeParse({ code });
    if (!parsed.success) {
      toast({ title: "Código inválido", description: "Ingresa los 6 dígitos de tu aplicación.", variant: "destructive" });
      return;
    }
    if (pendingUserId === null) return;
    setVerifying(true);
    try {
      const res = await fetch("/api/admin/2fa/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: pendingUserId, code: parsed.data.code }),
      });
      if (!res.ok) throw new Error("Código incorrecto");
      toast({ title: "Acceso concedido" });
      setLocation("/admin/campanas");
    } catch {
      toast({ title: "Error", description: "Código de verificación incorrecto o expirado", variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 border-border shadow-xl rounded-3xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
            {totpStep ? <ShieldCheck className="w-8 h-8" /> : <Lock className="w-8 h-8" />}
          </div>
          <h1 className="text-2xl font-bold font-display">Portal Administrativo</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {totpStep ? "Verificación en dos pasos" : "Red Solidaria San Ramón"}
          </p>
        </div>

        {!totpStep ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Usuario</FormLabel>
                    <FormControl>
                      <Input className="h-12 rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <Input type="password" className="h-12 rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full h-12 rounded-xl text-base font-semibold shadow-lg"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Ingresando..." : "Iniciar Sesión"}
              </Button>
            </form>
          </Form>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground text-center">
              Esta cuenta tiene la verificación en dos pasos activada. Ingresa el código de 6 dígitos de tu aplicación
              autenticadora (Google Authenticator, Authy, etc.).
            </p>
            <div className="space-y-2">
              <FormLabel htmlFor="totp-code">Código de verificación</FormLabel>
              <Input
                id="totp-code"
                className="h-12 rounded-xl text-center text-xl font-mono tracking-[0.5em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") verifyTotp(); }}
                autoFocus
              />
            </div>
            <Button
              type="button"
              onClick={verifyTotp}
              className="w-full h-12 rounded-xl text-base font-semibold shadow-lg"
              disabled={verifying || code.length !== 6}
            >
              {verifying ? "Verificando..." : "Verificar Código"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full h-10 rounded-xl text-muted-foreground"
              onClick={() => { setTotpStep(false); setCode(""); setPendingUserId(null); }}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Volver
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
