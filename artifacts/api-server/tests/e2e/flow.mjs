// Flujo E2E contra PostgreSQL real (Fase 9 del Prompt Maestro V7).
//
// Uso: node flow.mjs <baseUrl>
// Requiere el API arrancado contra una base real con el schema aplicado y el
// superadmin de respaldo definido por ADMIN_USERNAME/ADMIN_PASSWORD.
//
// Verifica de punta a punta: sesión, ciclo de vida de campaña, donación pública,
// comprobante obligatorio, asiento único en el libro, cadena de hashes, cifra
// pública conciliada (ficha y transparencia), borrado bloqueado, archivado,
// informe de integridad y filtros del panel. NO usa datos de producción.

const base = process.argv[2];
if (!base) {
  console.error("Falta la URL base del API");
  process.exit(2);
}

const USER = process.env.E2E_ADMIN_USERNAME;
const PASS = process.env.E2E_ADMIN_PASSWORD;

let cookie = "";
let failures = 0;

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} - ${name}${detail ? ` (${detail})` : ""}`);
}

async function call(method, path, body, { auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && cookie) headers.Cookie = cookie;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  if (auth && setCookie.length > 0) {
    cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, body: json, text };
}

const stamp = Date.now();
const donorEmail = `e2e-${stamp}@example.com`;

// ── 1. Sesión ────────────────────────────────────────────────────────────────
const noSession = await call("POST", "/api/campaigns", { title: "sin sesión" });
check("una ruta admin en ruta pública exige sesión (401)", noSession.status === 401, `status=${noSession.status}`);

const login = await call("POST", "/api/admin/login", { username: USER, password: PASS }, { auth: true });
check("login del superadmin responde 200", login.status === 200, `status=${login.status}`);
check("la sesión queda establecida", cookie.includes("connect.sid"), cookie.slice(0, 20));

// ── 2. Campaña: crear (borrador) y publicar ──────────────────────────────────
const created = await call(
  "POST",
  "/api/campaigns",
  {
    title: `E2E ${stamp}`,
    description: "Campaña creada por la verificación E2E contra PostgreSQL real.",
    goal: 1000,
    category: "general",
    startDate: "2026-01-01",
    status: "draft",
  },
  { auth: true },
);
check("crear campaña responde 201", created.status === 201, `status=${created.status}`);
const campaignId = created.body?.id;
check("la campaña tiene identificador", Number.isInteger(campaignId), `id=${campaignId}`);

const draftPublic = await call("GET", `/api/campaigns/${campaignId}`);
check("un borrador NO es público (404)", draftPublic.status === 404, `status=${draftPublic.status}`);

const published = await call("PATCH", `/api/campaigns/${campaignId}/status`, { status: "active" }, { auth: true });
check("publicar la campaña responde 200", published.status === 200, `status=${published.status}`);

// ── 3. Donación pública ──────────────────────────────────────────────────────
const donationWithoutProof = await call("POST", "/api/donations", {
  campaignId,
  firstName: "Prueba",
  lastName: "E2E",
  email: donorEmail,
  amount: 50,
  paymentMethod: "yape",
  collaborationType: "dinero",
  anonymous: false,
});
check("donación pública (dinero) responde 201", donationWithoutProof.status === 201, `status=${donationWithoutProof.status}`);

const donationWithProof = await call("POST", "/api/donations", {
  campaignId,
  firstName: "Prueba",
  lastName: "ConComprobante",
  email: `proof-${donorEmail}`,
  amount: 80,
  paymentMethod: "transfer",
  collaborationType: "dinero",
  anonymous: false,
  proofImageUrl: "https://res.cloudinary.com/demo/image/upload/v1/comprobante.jpg",
  proofPublicId: "e2e/comprobante",
});
check("donación con comprobante responde 201", donationWithProof.status === 201, `status=${donationWithProof.status}`);

const inKind = await call("POST", "/api/donations", {
  campaignId,
  firstName: "Prueba",
  lastName: "EnEspecie",
  email: `inkind-${donorEmail}`,
  amount: 0,
  collaborationType: "productos",
});
check("donación en especie sin monto ni método responde 201", inKind.status === 201, `status=${inKind.status}`);

const missingCampaign = await call("POST", "/api/donations", {
  campaignId: 999999,
  firstName: "Prueba",
  lastName: "SinCampaña",
  email: `nocampaign-${donorEmail}`,
  amount: 20,
  paymentMethod: "yape",
});
check("donar a una campaña inexistente se rechaza (400)", missingCampaign.status === 400, `status=${missingCampaign.status}`);

// ── 4. Aprobación: comprobante obligatorio solo para dinero digital ──────────
const list = await call("GET", "/api/donations", undefined, { auth: true });
const donations = Array.isArray(list.body) ? list.body : (list.body?.donations ?? []);
const byEmail = (email) => donations.find((d) => (d.email ?? "").toLowerCase() === email.toLowerCase());

const noProof = byEmail(donorEmail);
const withProof = byEmail(`proof-${donorEmail}`);
const inKindRow = byEmail(`inkind-${donorEmail}`);
check("las donaciones creadas aparecen en el panel", Boolean(noProof && withProof && inKindRow));

const approveNoProof = await call("PUT", `/api/donations/${noProof?.id}`, { status: "approved" }, { auth: true });
check("aprobar dinero digital SIN comprobante se rechaza (400)", approveNoProof.status === 400, `status=${approveNoProof.status}`);

const approveWithProof = await call("PUT", `/api/donations/${withProof?.id}`, { status: "approved" }, { auth: true });
check("aprobar dinero digital CON comprobante responde 200", approveWithProof.status === 200, `status=${approveWithProof.status}`);

const approveInKind = await call("PUT", `/api/donations/${inKindRow?.id}`, { status: "approved" }, { auth: true });
check("aprobar una donación en especie (sin pago) responde 200", approveInKind.status === 200, `status=${approveInKind.status}`);

// ── 5. Libro contable ────────────────────────────────────────────────────────
const movements = await call("GET", `/api/campaigns/${campaignId}/movements`);
const movementRows = Array.isArray(movements.body) ? movements.body : [];
check("el dinero aprobado genera UN asiento (la especie con valor 0 no asienta)", movementRows.length === 1, `asientos=${movementRows.length}`);
check(
  "el asiento apunta a la donación con su importe",
  movementRows[0]?.sourceType === "donation" && Number(movementRows[0]?.amount) === 80,
  JSON.stringify(movementRows[0] ?? null),
);

const chain = await call("GET", `/api/campaigns/${campaignId}/movements/verify`);
check("la cadena de hashes verifica", chain.body?.verified === true, JSON.stringify(chain.body ?? null));

const badId = await call("GET", "/api/campaigns/abc/movements/verify");
check("un identificador no numérico NO produce un 500", badId.status !== 500, `status=${badId.status}`);

// ── 6. Cifra pública conciliada: ficha y transparencia coinciden ─────────────
const publicCampaign = await call("GET", `/api/campaigns/${campaignId}`);
check(
  "la ficha pública publica el total VERIFICADO (80, sin la donación en especie)",
  Number(publicCampaign.body?.raised) === 80,
  `raised=${publicCampaign.body?.raised} verified=${publicCampaign.body?.verifiedRaised}`,
);
check(
  "el desglose distingue lo verificado de lo histórico",
  publicCampaign.body?.historicalCounted === false && Number(publicCampaign.body?.historicalRaised) === 0,
  JSON.stringify({
    historicalRaised: publicCampaign.body?.historicalRaised,
    historicalCounted: publicCampaign.body?.historicalCounted,
  }),
);

const transparency = await call("GET", `/api/campaigns/${campaignId}/transparency`);
check("el panel de transparencia responde 200", transparency.status === 200, `status=${transparency.status}`);
check(
  "la transparencia publica la MISMA cifra que la ficha",
  Number(transparency.body?.totalRaised) === 80,
  `totalRaised=${transparency.body?.totalRaised}`,
);
check("la transparencia incluye la fecha de actualización", typeof transparency.body?.updatedAt === "string", transparency.body?.updatedAt);

// ── 7. Borrado bloqueado y archivado ─────────────────────────────────────────
const del = await call("DELETE", `/api/campaigns/${campaignId}`, undefined, { auth: true });
check("borrar una campaña con historial se bloquea (409)", del.status === 409, `status=${del.status} ${del.body?.message ?? ""}`);

const archived = await call("PATCH", `/api/campaigns/${campaignId}/status`, { status: "archived" }, { auth: true });
check("archivar responde 200", archived.status === 200, `status=${archived.status}`);

const hiddenList = await call("GET", "/api/campaigns");
const hiddenIds = (Array.isArray(hiddenList.body) ? hiddenList.body : []).map((c) => c.id);
check("una campaña archivada no aparece en el listado público", !hiddenIds.includes(campaignId));

const archivedPublic = await call("GET", `/api/campaigns/${campaignId}`);
check(
  "política documentada: una archivada sigue accesible por URL directa (auditoría)",
  archivedPublic.status === 200,
  `status=${archivedPublic.status}`,
);

const archivedDonation = await call("POST", "/api/donations", {
  campaignId,
  firstName: "Prueba",
  lastName: "Archivada",
  email: `archived-${donorEmail}`,
  amount: 30,
  paymentMethod: "yape",
});
check("una campaña archivada NO acepta donaciones (400)", archivedDonation.status === 400, `status=${archivedDonation.status}`);

const restored = await call("PATCH", `/api/campaigns/${campaignId}/status`, { status: "completed" }, { auth: true });
check("restaurar (archivada → finalizada) responde 200", restored.status === 200, `status=${restored.status}`);

// ── 8. Informe de integridad del libro ───────────────────────────────────────
const audit = await call("GET", "/api/admin/ledger/audit", undefined, { auth: true });
check("el informe de integridad responde 200", audit.status === 200, `status=${audit.status}`);
check("el informe confirma la cadena íntegra", audit.body?.chain?.verified === true, JSON.stringify(audit.body?.chain ?? null));
const flagged = (audit.body?.donationsWithoutMovement ?? []).map((d) => d.id);
check(
  "la donación aprobada del E2E NO figura como ingreso sin asiento",
  !flagged.includes(withProof?.id),
  `sin_asiento=${flagged.length}`,
);
check(
  "el informe detecta las donaciones históricas sin asiento (DB-09)",
  flagged.length > 0,
  `donaciones confirmadas sin asiento=${flagged.length}`,
);

// ── 9. Filtros del panel contra datos reales ─────────────────────────────────
const filtered = await call("GET", `/api/admin/dashboard?campaignId=${campaignId}`, undefined, { auth: true });
check("el dashboard filtrado responde 200", filtered.status === 200, `status=${filtered.status}`);
check(
  "el filtro por campaña acota la recaudación a esa campaña",
  Number(filtered.body?.summary?.totalRaised) === 80,
  `totalRaised=${filtered.body?.summary?.totalRaised}`,
);
check(
  "el panel devuelve la descripción de los filtros aplicados",
  typeof filtered.body?.filters?.description === "string" && filtered.body.filters.description.includes("campaña"),
  filtered.body?.filters?.description,
);

const badFilter = await call("GET", "/api/admin/dashboard?status=en-curso", undefined, { auth: true });
check("un filtro inválido responde 400 con el motivo", badFilter.status === 400, `status=${badFilter.status} ${badFilter.body?.message ?? ""}`);

// ── 9. API-06: la validación sigue siendo 400 (el guard de Zod no la convierte en 500) ──
const badContact = await call("POST", "/api/contact", {});
check(
  "un mensaje de contacto inválido responde 400 de validación",
  badContact.status === 400 && badContact.body?.error === "validation_error",
  `status=${badContact.status} error=${badContact.body?.error ?? ""}`,
);

const badTestimonial = await call("POST", "/api/testimonials", {});
check(
  "un testimonio inválido responde 400 de validación",
  badTestimonial.status === 400 && badTestimonial.body?.error === "validation_error",
  `status=${badTestimonial.status} error=${badTestimonial.body?.error ?? ""}`,
);

const badNews = await call("POST", "/api/news", {}, { auth: true });
check(
  "una noticia inválida responde 400 de validación (no 500)",
  badNews.status === 400 && badNews.body?.error === "validation_error",
  `status=${badNews.status} error=${badNews.body?.error ?? ""}`,
);

// ── 10. Certificados con QR: emitir, abrir por QR, revocar ──────────────────
const createdCert = await call(
  "POST",
  "/api/admin/certificates",
  {
    holderName: "E2E Donante",
    type: "donante",
    title: "Certificado de agradecimiento",
    description: "Emitido por el flujo E2E",
    issuedAt: "2026-10-14",
  },
  { auth: true },
);
check(
  "se emite un certificado con código público aleatorio",
  createdCert.status === 201 && /^[23456789BCDFGHJKMNPQRSTVWXZ]{12}$/.test(createdCert.body?.code ?? ""),
  `status=${createdCert.status} code=${createdCert.body?.code ?? ""}`,
);

const certCode = createdCert.body?.code;
const publicCert = await call("GET", `/api/certificates/${certCode}`);
check(
  "el certificado se consulta públicamente (es lo que abre el QR)",
  publicCert.status === 200 && publicCert.body?.holderName === "E2E Donante",
  `status=${publicCert.status}`,
);
check(
  "la vista pública NO expone el id interno, ni el estado, ni datos de contacto",
  publicCert.body?.id === undefined &&
    publicCert.body?.status === undefined &&
    publicCert.body?.revocationReason === undefined &&
    publicCert.body?.createdAt === undefined,
  `claves=${Object.keys(publicCert.body ?? {}).join(",")}`,
);

const badCertCode = await call("GET", "/api/certificates/NO-ES-UN-CODIGO");
check("un código con forma inválida responde 400", badCertCode.status === 400, `status=${badCertCode.status}`);

const revokedCert = await call(
  "PATCH",
  `/api/admin/certificates/${createdCert.body?.id}`,
  { status: "revoked", revocationReason: "Prueba E2E de revocación" },
  { auth: true },
);
check(
  "se revoca el certificado indicando el motivo",
  revokedCert.status === 200 && revokedCert.body?.status === "revoked",
  `status=${revokedCert.status}`,
);

const afterRevoke = await call("GET", `/api/certificates/${certCode}`);
check(
  "un certificado revocado deja de publicarse (404)",
  afterRevoke.status === 404,
  `status=${afterRevoke.status}`,
);

const revokeAgain = await call(
  "PATCH",
  `/api/admin/certificates/${createdCert.body?.id}`,
  { status: "revoked", revocationReason: "Segundo intento" },
  { auth: true },
);
check("no se puede revocar dos veces (409)", revokeAgain.status === 409, `status=${revokeAgain.status}`);

console.log("");
if (failures === 0) {
  console.log("E2E: TODO OK");
} else {
  console.log(`E2E: ${failures} comprobación(es) fallida(s)`);
}
process.exit(failures === 0 ? 0 : 1);
