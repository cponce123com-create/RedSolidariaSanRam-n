import { useState } from "react";
import { useGetAdminMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { DonationVoidDialog } from "@/components/admin/DonationVoidDialog";
import { canVoidDonation } from "@/lib/donation-annulment";
import { Undo2 } from "lucide-react";

interface DonationVoidActionProps {
  donation: {
    id: number;
    title: string;
    amount: number;
    status: string;
    campaignId?: number | null;
  };
}

/**
 * Acción «Anular contablemente» de una fila de donación (V7.2.2).
 *
 * Se encapsula aquí (botón + su diálogo) para que la tabla no arrastre estado:
 * solo el superadmin ve el botón, y solo en donaciones CONFIRMADAS (aprobadas o
 * conciliadas), que son las únicas con asiento en el libro. Una pendiente o
 * rechazada se gestiona con el rechazo normal.
 */
export function DonationVoidAction({ donation }: DonationVoidActionProps) {
  const [open, setOpen] = useState(false);
  const { data: adminUser } = useGetAdminMe({
    query: { queryKey: ["/api/admin/me"], retry: false },
  });

  if (!canVoidDonation(donation.status, adminUser?.role)) return null;

  return (
    <>
      <Button
        size="icon"
        variant="outline"
        className="h-10 w-10 text-slate-600 border-slate-600/20 hover:bg-slate-600/10 hover:text-slate-700 rounded-lg"
        onClick={() => setOpen(true)}
        title="Anular contablemente (irreversible sobre las cifras)"
        data-testid="btn-void-donation"
      >
        <Undo2 className="w-4 h-4" />
      </Button>
      <DonationVoidDialog
        donation={donation}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
