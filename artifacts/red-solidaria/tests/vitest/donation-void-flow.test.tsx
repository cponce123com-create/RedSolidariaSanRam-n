import { beforeEach, expect, it, vi } from "vitest";
import { screen, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminDonations from "@/pages/admin/donations";
import { DonationVoidAction } from "@/components/admin/DonationVoidAction";
import { renderWithProviders } from "./test-utils";
const fixture = vi.hoisted(() => ({
  rows: [] as Array<{ id: number; campaignId: number | null; firstName: string; lastName: string; email: string; amount: number; status: string; anonymous: boolean; paymentMethod: string; collaborationType: string; createdAt: string }>,
  filters: [] as string[], total: 100,
}));
vi.mock("@workspace/api-client-react", () => ({
  useGetAdminMe: () => ({ data: { role: "superadmin" } }),
  useGetDonations: (params?: { status?: string }) => { fixture.filters.push(params?.status ?? 'all'); return { data: fixture.rows.filter(r => !params?.status || r.status === params.status), isLoading: false }; },
  useGetDonationStats: () => ({ data: { totalAmount: fixture.total, totalDonations: fixture.total ? 1 : 0, pendingCount: 0, approvedCount: fixture.total ? 1 : 0 } }),
  useUpdateDonationStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useAddDonationProof: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
beforeEach(() => {
  fixture.rows = [{ id: 73, campaignId: null, firstName: 'Aporte', lastName: 'Prueba', email: 'test@example.org', amount: 100, status: 'reconciled', anonymous: true, paymentMethod: 'cash', collaborationType: 'dinero', createdAt: '2026-11-09T20:00:00Z' }];
  fixture.filters = []; fixture.total = 100;
});
function mockApi(status = 200) {
  const request = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith('/73/void')) {
      if (status !== 200) return new Response(JSON.stringify({ message: 'Código 2FA incorrecto. Inténtalo con el código vigente.' }), { status });
      return new Response(JSON.stringify({ ok: true, donation: { id: 73, status: 'annulled' }, reversal: { appended: false, movementId: null }, ledger: null, warnings: [] }), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  });
  vi.stubGlobal('fetch', request); return request;
}
async function complete(user: ReturnType<typeof userEvent.setup>) {
  const dialog = screen.getByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Usar motivo: aporte de prueba' }));
  await user.type(within(dialog).getByLabelText('Tu contraseña (reautenticación)'), 'test-only-password');
  await user.type(within(dialog).getByLabelText('Código 2FA (si está activo)'), '123456');
  await user.click(within(dialog).getByRole('checkbox'));
  return dialog;
}
it('the row action opens the correct donation dialog and never changes the active filter', async () => {
  const request = mockApi(); const user = userEvent.setup();
  renderWithProviders(<AdminDonations />);
  await user.click(screen.getByRole('button', { name: 'Anular aporte #73' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('donación #73');
  expect(screen.getByTestId('filter-tab-all')).toHaveAttribute('aria-pressed', 'true');
  expect(fixture.filters.every(f => f === 'all')).toBe(true);
  expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
});
it('refreshing/removing the table row does not close or reset the confirmation dialog', async () => {
  mockApi(); const user = userEvent.setup();
  const view = renderWithProviders(<AdminDonations />);
  await user.click(screen.getByRole('button', { name: 'Anular aporte #73' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Usar motivo: aporte de prueba' }));
  fixture.rows = []; view.rerender(<AdminDonations />);
  expect(screen.getByRole('dialog')).toHaveTextContent('donación #73');
  expect((screen.getByLabelText('Motivo (obligatorio)') as HTMLTextAreaElement).value).toContain('Aporte de prueba');
});
it('confirmation sends the actual void endpoint, closes on success and preserves the selected filter', async () => {
  const request = mockApi(); const user = userEvent.setup();
  const view = renderWithProviders(<AdminDonations />);
  await user.click(screen.getByTestId('filter-tab-reconciled'));
  await user.click(screen.getByRole('button', { name: 'Anular aporte #73' }));
  const dialog = await complete(user);
  await user.click(within(dialog).getByRole('button', { name: 'Anular contablemente' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const writes = request.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(writes).toHaveLength(1);
  expect(writes[0][0]).toBe('/api/donations/73/void');
  expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({ confirm: true, password: 'test-only-password', totpCode: '123456' });
  expect(screen.getByTestId('filter-tab-reconciled')).toHaveAttribute('aria-pressed', 'true');
  fixture.rows[0].status = 'annulled'; fixture.total = 0; view.rerender(<AdminDonations />);
  expect(screen.getByText('S/ 0')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Anular aporte #73' })).not.toBeInTheDocument();
});
it('a server rejection leaves the dialog open with its real error and no filter change', async () => {
  mockApi(401); const user = userEvent.setup();
  renderWithProviders(<AdminDonations />);
  await user.click(screen.getByRole('button', { name: 'Anular aporte #73' }));
  const dialog = await complete(user);
  await user.click(within(dialog).getByRole('button', { name: 'Anular contablemente' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Código 2FA incorrecto');
  expect(screen.getByTestId('filter-tab-all')).toHaveAttribute('aria-pressed', 'true');
});
it('the action is not a form submit and cannot bubble to a parent filter handler', () => {
  const submit = vi.fn(), parentFilter = vi.fn(), open = vi.fn();
  renderWithProviders(<form onSubmit={e => { e.preventDefault(); submit(); }}><div onClick={parentFilter}><DonationVoidAction donation={{ id: 73, title: 'Prueba', amount: 100, status: 'reconciled' }} onRequest={open} /></div></form>);
  const button = screen.getByRole('button', { name: 'Anular aporte #73' });
  expect(button).toHaveAttribute('type', 'button'); fireEvent.click(button);
  expect(open).toHaveBeenCalledTimes(1); expect(submit).not.toHaveBeenCalled(); expect(parentFilter).not.toHaveBeenCalled();
});
