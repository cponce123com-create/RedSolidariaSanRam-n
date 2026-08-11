import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import CampaignTransparency from "@/pages/campaign-transparency";
import { renderWithProviders } from "./test-utils";

// Fixtures controlables por test para los hooks de use-phase3.
const fixtures = vi.hoisted(() => ({
  transparency: null as unknown,
  movements: null as unknown,
  verify: null as unknown,
}));

vi.mock("@/hooks/use-phase3", () => ({
  useCampaignTransparency: () => ({ data: fixtures.transparency, isLoading: false, isError: false }),
  useCampaignLedger: () => ({ data: fixtures.movements, isLoading: false }),
  useCampaignLedgerVerify: () => ({ data: fixtures.verify, isLoading: false }),
}));

describe("Ledger Trust Pay (campaign-transparency)", () => {
  beforeEach(() => {
    fixtures.transparency = {
      campaignId: 1,
      title: "Campaña Test",
      goal: 1000,
      totalRaised: 500,
      totalSpent: 200,
      publicSpent: 200,
      balance: 300,
      donorCount: 3,
      executionPercent: 40,
      raisedPercent: 50,
      expenseCount: 1,
      publicExpenseCount: 1,
      evidenceCount: 0,
      publicEvidenceCount: 0,
      publicExpenses: [],
      publicEvidence: [],
      recentMovements: [],
    };
  });

  it("muestra los movimientos y el estado de integridad de la cadena (verificada)", async () => {
    fixtures.movements = [
      {
        id: 1,
        campaignId: 1,
        kind: "ingreso",
        amount: 100,
        description: "Donación de Ana López",
        sourceType: "donation",
        sourceId: 1,
        prevHash: "genesis",
        hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
        createdAt: "2026-08-01T10:00:00Z",
      },
      {
        id: 2,
        campaignId: 1,
        kind: "gasto",
        amount: 50,
        description: "Compra de víveres",
        sourceType: "expense",
        sourceId: 1,
        prevHash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
        hash: "c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1",
        createdAt: "2026-08-02T10:00:00Z",
      },
    ];
    fixtures.verify = {
      campaignId: 1,
      verified: true,
      brokenAt: null,
      rootHash: "c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1",
      count: 2,
      verifiedAt: "2026-08-11T12:00:00Z",
    };

    renderWithProviders(<CampaignTransparency />, {
      path: "/campanas/1/transparencia",
      routePath: "/campanas/:id/transparencia",
    });

    // Movimientos del ledger con su hash corto (#a1b2c3d4)
    expect(await screen.findByText("Donación de Ana López")).toBeInTheDocument();
    expect(screen.getByText("Compra de víveres")).toBeInTheDocument();
    expect(screen.getByText("#a1b2c3d4")).toBeInTheDocument();
    // Badge de integridad: "Cadena íntegra · 2 movimientos" (cadena verificada)
    expect(screen.getByText(/cadena íntegra.*2 movimientos/i)).toBeInTheDocument();
  });

  it("alerta cuando la cadena está comprometida", async () => {
    fixtures.movements = [
      {
        id: 1,
        campaignId: 1,
        kind: "ingreso",
        amount: 100,
        description: "Donación manipulada",
        sourceType: "donation",
        sourceId: 1,
        prevHash: "genesis",
        hash: "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
        createdAt: "2026-08-01T10:00:00Z",
      },
    ];
    fixtures.verify = {
      campaignId: 1,
      verified: false,
      brokenAt: 1,
      rootHash: null,
      count: 1,
      verifiedAt: "2026-08-11T12:00:00Z",
    };

    renderWithProviders(<CampaignTransparency />, {
      path: "/campanas/1/transparencia",
      routePath: "/campanas/:id/transparencia",
    });

    expect(
      await screen.findByText(/integridad.*comprometida/i),
    ).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando no hay movimientos", async () => {
    fixtures.movements = [];
    fixtures.verify = {
      campaignId: 1,
      verified: true,
      brokenAt: null,
      rootHash: null,
      count: 0,
      verifiedAt: "2026-08-11T12:00:00Z",
    };

    renderWithProviders(<CampaignTransparency />, {
      path: "/campanas/1/transparencia",
      routePath: "/campanas/:id/transparencia",
    });

    expect(
      await screen.findByText(/sin movimientos aún/i),
    ).toBeInTheDocument();
  });
});
