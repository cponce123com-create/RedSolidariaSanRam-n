import { test } from "node:test";
import assert from "node:assert/strict";
import { donationFacebookContent } from "./dist/lib/facebook-public-content.mjs";
import { facebookMessage, isFacebookSource } from "./dist/lib/facebook-publisher.mjs";

const donation = { id: 5, amount: 50, collaborationType: "dinero", campaignId: 7,
  campaignTitle: "ChocoFest", campaignImage: "https://example.org/campaign.jpg", recognitionName: null,
  email: "PRIVATE_EMAIL", phone: "PRIVATE_PHONE", receiptUrl: "PRIVATE_RECEIPT", message: "PRIVATE_NOTE" };

test("a confirmed monetary contribution announces amount and campaign without private fields", () => {
  const content = donationFacebookContent(donation);
  assert.match(content.summary, /S\/ 50[.,]00/);
  assert.ok(content.summary.includes("ChocoFest") && content.summary.includes("una persona solidaria"));
  assert.equal(content.imageUrl, donation.campaignImage);
  assert.equal(content.path, "/campanas/7/transparencia");
  assert.ok(!JSON.stringify(content).includes("PRIVATE_"));
});

test("authorized recognition is optional, and goods never present estimated value as cash", () => {
  assert.ok(donationFacebookContent({ ...donation, recognitionName: "Donante autorizado" }).summary.includes("Donante autorizado"));
  const content = donationFacebookContent({ ...donation, amount: 9999, collaborationType: "productos" }, [
    { product: "arroz", receivedQuantity: 3, unit: "kilogramo" }, { product: "leche", receivedQuantity: 0, unit: "litro" },
  ]);
  assert.ok(content.summary.includes("3 kilogramo de arroz"));
  assert.ok(!content.summary.includes("9999") && !content.summary.includes("S/") && !content.summary.includes("leche"));
});

test("all supported public sources link to public pages, never private administration", () => {
  for (const kind of ["news", "campaign", "donation", "pet", "report", "update", "campaign_result"]) {
    assert.equal(isFacebookSource(kind), true);
    const { link } = facebookMessage({ kind, id: 1, title: "Título", summary: "Público" }, "https://example.org");
    assert.ok(!link.includes("/admin") && !link.includes("/api"));
  }
  for (const kind of ["messages", "users", "volunteers", "settings", "receipt"]) assert.equal(isFacebookSource(kind), false);
});
