import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Types based on the backend schema
export interface TransparencyData {
  campaignId: number;
  title: string;
  goal: number;
  totalRaised: number;
  totalSpent: number;
  publicSpent: number;
  balance: number;
  donorCount: number;
  executionPercent: number;
  raisedPercent: number;
  expenseCount: number;
  publicExpenseCount: number;
  evidenceCount: number;
  publicEvidenceCount: number;
  publicExpenses: Expense[];
  publicEvidence: Evidence[];
  recentMovements: {
    type: "ingreso" | "gasto";
    description: string;
    amount: number;
    date: string;
  }[];
}

export interface Expense {
  id: number;
  campaignId: number;
  description: string;
  category: string;
  amount: number;
  date: string;
  responsible?: string | null;
  observations?: string | null;
  receiptUrl?: string | null;
  receiptType?: string | null;
  isPublic: boolean;
  createdAt: string;
}

export interface Evidence {
  id: number;
  campaignId: number;
  title: string;
  description?: string | null;
  mediaUrl: string;
  mediaType: string;
  evidenceType: string;
  date: string;
  isPublic: boolean;
  createdAt: string;
}

// Hook for public transparency dashboard
export function useCampaignTransparency(id: number) {
  return useQuery<TransparencyData>({
    queryKey: ["/api/campaigns", id, "transparency"],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${id}/transparency`);
      if (!res.ok) throw new Error("Failed to fetch transparency data");
      return res.json();
    },
    enabled: !!id,
  });
}

// Hook público: el servidor devuelve SOLO gastos publicados (is_public=true);
// las filas privadas solo son visibles vía los hooks admin (sesión requerida).
export function useCampaignExpenses(id: number, publicOnly?: boolean) {
  return useQuery<Expense[]>({
    queryKey: ["/api/campaigns", id, "expenses", { publicOnly }],
    queryFn: async () => {
      const url = new URL(`/api/campaigns/${id}/expenses`, window.location.origin);
      if (publicOnly) url.searchParams.set("publicOnly", "true");
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch expenses");
      return res.json();
    },
    enabled: !!id,
  });
}

// Hook admin: TODOS los gastos (públicos y privados) vía endpoint protegido.
export function useAdminCampaignExpenses(id: number) {
  return useQuery<Expense[]>({
    queryKey: ["/api/admin/campaigns", id, "expenses"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/campaigns/${id}/expenses`);
      if (!res.ok) throw new Error("Failed to fetch expenses");
      return res.json();
    },
    enabled: !!id,
  });
}

// Hook público: el servidor devuelve SOLO evidencias publicadas (is_public=true).
export function useCampaignEvidence(id: number, publicOnly?: boolean) {
  return useQuery<Evidence[]>({
    queryKey: ["/api/campaigns", id, "evidence", { publicOnly }],
    queryFn: async () => {
      const url = new URL(`/api/campaigns/${id}/evidence`, window.location.origin);
      if (publicOnly) url.searchParams.set("publicOnly", "true");
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch evidence");
      return res.json();
    },
    enabled: !!id,
  });
}

// Hook admin: TODAS las evidencias (públicas y privadas) vía endpoint protegido.
export function useAdminCampaignEvidence(id: number) {
  return useQuery<Evidence[]>({
    queryKey: ["/api/admin/campaigns", id, "evidence"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/campaigns/${id}/evidence`);
      if (!res.ok) throw new Error("Failed to fetch evidence");
      return res.json();
    },
    enabled: !!id,
  });
}

// Mutations
export function useCreateExpense(campaignId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Expense>) => {
      const res = await fetch(`/api/campaigns/${campaignId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create expense");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "transparency"] });
    },
  });
}

export function useUpdateExpense(campaignId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Expense> }) => {
      const res = await fetch(`/api/campaigns/${campaignId}/expenses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update expense");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "transparency"] });
    },
  });
}

export function useDeleteExpense(campaignId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (expenseId: number) => {
      const res = await fetch(`/api/campaigns/${campaignId}/expenses/${expenseId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete expense");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "transparency"] });
    },
  });
}

export function useCreateEvidence(campaignId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Evidence>) => {
      const res = await fetch(`/api/campaigns/${campaignId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create evidence");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "evidence"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "transparency"] });
    },
  });
}

export function useUpdateEvidence(campaignId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Evidence> }) => {
      const res = await fetch(`/api/campaigns/${campaignId}/evidence/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update evidence");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "evidence"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "transparency"] });
    },
  });
}

export function useDeleteEvidence(campaignId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (evidenceId: number) => {
      const res = await fetch(`/api/campaigns/${campaignId}/evidence/${evidenceId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete evidence");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "evidence"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "transparency"] });
    },
  });
}

// ─── Ledger Trust Pay: movimientos hash-chained y verificación pública ───────

export interface LedgerMovement {
  id: number;
  campaignId: number;
  kind: "ingreso" | "gasto";
  amount: number;
  description: string;
  sourceType: "donation" | "expense";
  sourceId: number;
  prevHash: string;
  hash: string;
  createdAt: string;
}

export interface LedgerVerifyResult {
  campaignId: number;
  verified: boolean;
  brokenAt: number | null;
  rootHash: string | null;
  count: number;
  verifiedAt: string;
}

export function useCampaignLedger(id: number, limit = 100) {
  return useQuery<LedgerMovement[]>({
    queryKey: ["/api/campaigns", id, "movements"],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${id}/movements?limit=${limit}`);
      if (!res.ok) throw new Error("Failed to fetch movements");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCampaignLedgerVerify(id: number) {
  return useQuery<LedgerVerifyResult>({
    queryKey: ["/api/campaigns", id, "movements", "verify"],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${id}/movements/verify`);
      if (!res.ok) throw new Error("Failed to verify movements");
      return res.json();
    },
    enabled: !!id,
  });
}
