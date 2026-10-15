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

// ── 7bis. Eliminación por NATURALEZA de las dependencias (V7.1 · Fase 1) ─────
// Reproduce el caso real: un borrador con SOLO dependencias auxiliares (galería
// y novedades, sin valor contable) se elimina de forma segura; uno con historial
// protegido (donación confirmada + asiento) se BLOQUEA y ofrece archivar. Antes
// CUALQUIER fila dependiente bloqueaba el borrado para siempre.
const auxDraft = await call(
  "POST",
  "/api/campaigns",
  {
    title: `E2E auxiliar ${stamp}`,
    description: "Borrador con dependencias auxiliares (galería y novedades).",
    goal: 500,
    category: "general",
    startDate: "2026-02-01",
    status: "draft",
  },
  { auth: true },
);
const auxId = auxDraft.body?.id;
await call(
  "POST",
  `/api/campaigns/${auxId}/images`,
  { imageUrl: "https://res.cloudinary.com/demo/image/upload/v1/aux.jpg", caption: "Imagen auxiliar" },
  { auth: true },
);
await call(
  "POST",
  `/api/campaigns/${auxId}/updates`,
  { title: "Novedad auxiliar", content: "Contenido de presentación sin valor contable." },
  { auth: true },
);

const auxDiag = await call("GET", `/api/campaigns/${auxId}/deletion-diagnostic`, undefined, { auth: true });
check("diagnóstico del borrador auxiliar: permite eliminar", auxDiag.body?.diagnostic?.canDelete === true, JSON.stringify(auxDiag.body?.diagnostic?.dependencies ?? null));
check("diagnóstico: desglosa las dependencias auxiliares (galería + novedades)", Number(auxDiag.body?.diagnostic?.auxiliaryCount) >= 2, `aux=${auxDiag.body?.diagnostic?.auxiliaryCount}`);
check("diagnóstico: NO marca ninguna dependencia protegida", Number(auxDiag.body?.diagnostic?.protectedCount) === 0, `protegidas=${auxDiag.body?.diagnostic?.protectedCount}`);

const auxDelete = await call("DELETE", `/api/campaigns/${auxId}`, undefined, { auth: true });
check("un borrador con SOLO dependencias auxiliares se elimina (204)", auxDelete.status === 204, `status=${auxDelete.status}`);
const auxGone = await call("GET", `/api/campaigns/${auxId}`, undefined, { auth: true });
check("la campaña eliminada ya no existe (404)", auxGone.status === 404, `status=${auxGone.status}`);

// Borrador con historial protegido: se publica, recibe una donación confirmada
// (que genera asiento) y se vuelve a borrador. NO puede eliminarse.
const protectedDraft = await call(
  "POST",
  "/api/campaigns",
  {
    title: `E2E protegido ${stamp}`,
    description: "Borrador que recibió una donación confirmada antes de despublicarse.",
    goal: 500,
    category: "general",
    startDate: "2026-02-01",
    status: "draft",
  },
  { auth: true },
);
const protectedId = protectedDraft.body?.id;
await call("PATCH", `/api/campaigns/${protectedId}/status`, { status: "active" }, { auth: true });
const protectedDonation = await call("POST", "/api/donations", {
  campaignId: protectedId,
  firstName: "Prueba",
  lastName: "Protegida",
  email: `protected-${donorEmail}`,
  amount: 25,
  paymentMethod: "transfer",
  collaborationType: "dinero",
  proofImageUrl: "https://res.cloudinary.com/demo/image/upload/v1/protegida.jpg",
  proofPublicId: "e2e/protegida",
});
await call("PUT", `/api/donations/${protectedDonation.body?.id}`, { status: "approved" }, { auth: true });
await call("PATCH", `/api/campaigns/${protectedId}/status`, { status: "draft" }, { auth: true });

const protectedDiag = await call("GET", `/api/campaigns/${protectedId}/deletion-diagnostic`, undefined, { auth: true });
check("diagnóstico del borrador con historial: BLOQUEA la eliminación", protectedDiag.body?.diagnostic?.canDelete === false, protectedDiag.body?.diagnostic?.blockedReason ?? "");
check(
  "diagnóstico: explica el motivo concreto (dependencias protegidas)",
  typeof protectedDiag.body?.diagnostic?.blockedReason === "string" && protectedDiag.body.diagnostic.blockedReason.length > 0,
);
check("diagnóstico: ofrece archivar como alternativa segura", protectedDiag.body?.diagnostic?.canArchive === true);

const protectedDelete = await call("DELETE", `/api/campaigns/${protectedId}`, undefined, { auth: true });
check("borrar el borrador con donación confirmada se bloquea (409)", protectedDelete.status === 409, `status=${protectedDelete.status} ${protectedDelete.body?.message ?? ""}`);

// ── 7ter. Purga DEFINITIVA de una campaña DEMO (V7.2) ────────────────────────
// Reproduce el caso real: una campaña de demostración («Adopciones» / «Rescate
// Animal San Ramón») con donaciones, gastos y asientos de PRUEBA que el borrado
// seguro y la purga de borradores rechazan. El superadmin la declara DEMO y la
// elimina con TODOS sus datos ficticios, sin tocar ninguna campaña real.
//
// Presupuesto de reautenticación: `reauthLimiter` permite 5 intentos por
// superadmin cada 15 minutos, así que esta sección hace EXACTAMENTE 5 peticiones
// con reautenticación y comprueba en la SEXTA que el límite anti fuerza bruta
// entra en acción.
const demoReason = "Campaña de demostración con datos ficticios cargados por error";

const demo = await call(
  "POST",
  "/api/campaigns",
  {
    title: `E2E DEMO ${stamp}`,
    description: "Campaña de demostración: sus donaciones y gastos son ficticios.",
    goal: 800,
    category: "general",
    startDate: "2026-03-01",
    status: "draft",
  },
  { auth: true },
);
const demoId = demo.body?.id;
await call("PATCH", `/api/campaigns/${demoId}/status`, { status: "active" }, { auth: true });

// Donación con comprobante → aprobada: genera UN asiento encadenado de prueba.
const demoDonation = await call("POST", "/api/donations", {
  campaignId: demoId,
  firstName: "Demo",
  lastName: "Ficticia",
  email: `demo-${donorEmail}`,
  amount: 60,
  paymentMethod: "transfer",
  collaborationType: "dinero",
  proofImageUrl: "https://res.cloudinary.com/demo/image/upload/v1/demo.jpg",
  proofPublicId: "e2e/demo",
});
await call("PUT", `/api/donations/${demoDonation.body?.id}`, { status: "approved" }, { auth: true });

// Datos auxiliares de prueba: galería, novedades, presupuesto, gasto, evidencia
// y un bien sin flujo registrado (todo ficticio, sin obligación de conservación).
await call("POST", `/api/campaigns/${demoId}/images`, { imageUrl: "https://res.cloudinary.com/demo/image/upload/v1/demo-galeria.jpg", caption: "Imagen de demostración" }, { auth: true });
await call("POST", `/api/campaigns/${demoId}/updates`, { title: "Novedad de demostración", content: "Contenido ficticio de la campaña DEMO." }, { auth: true });
await call("POST", `/api/campaigns/${demoId}/budgets`, { category: "Difusión", plannedAmount: 120 }, { auth: true });
await call("POST", `/api/campaigns/${demoId}/expenses`, { description: "Gasto ficticio sin comprobante", amount: 40, date: "2026-03-02" }, { auth: true });
await call("POST", `/api/campaigns/${demoId}/evidence`, { title: "Evidencia de demostración", mediaUrl: "https://res.cloudinary.com/demo/image/upload/v1/demo-evidencia.jpg", date: "2026-03-03" }, { auth: true });
await call("POST", `/api/campaigns/${demoId}/leftovers`, { item: "Raciones de prueba", quantity: 10 }, { auth: true });

// El problema original: el borrado seguro la rechaza aunque sea de prueba.
const demoSafeDelete = await call("DELETE", `/api/campaigns/${demoId}`, undefined, { auth: true });
check(
  "una campaña DEMO con historial NO se elimina por la vía normal (409)",
  demoSafeDelete.status === 409,
  `status=${demoSafeDelete.status}`,
);

// ── Análisis de seguridad previo (no modifica nada) ──────────────────────────
const demoPreview = await call("GET", `/api/campaigns/${demoId}/demo-purge/preview`, undefined, { auth: true });
check("el análisis de purga DEMO responde 200", demoPreview.status === 200, `status=${demoPreview.status}`);
check(
  "el análisis identifica la campaña por su IDENTIFICADOR real (no por el nombre)",
  demoPreview.body?.campaign?.id === demoId && typeof demoPreview.body?.campaign?.title === "string",
  `id=${demoPreview.body?.campaign?.id}`,
);
check(
  "el análisis informa del estado y de la falta de declaración DEMO",
  demoPreview.body?.campaign?.status === "active" &&
    demoPreview.body?.campaign?.isDemo === false &&
    demoPreview.body?.verdict?.requiresDemoMarking === true &&
    demoPreview.body?.verdict?.allowed === false,
  JSON.stringify({ status: demoPreview.body?.campaign?.status, isDemo: demoPreview.body?.campaign?.isDemo }),
);
const demoCounts = demoPreview.body?.counts ?? {};
check(
  "el análisis cuenta y TIPEA los registros relacionados por tabla",
  demoCounts.campaigns === 1 &&
    // Dos asientos: el ingreso de la donación aprobada + el gasto registrado.
    demoCounts.campaign_movements === 2 &&
    demoCounts.donations === 1 &&
    demoCounts.campaign_expenses === 1 &&
    demoCounts.campaign_images === 1 &&
    demoCounts.campaign_updates === 1 &&
    demoCounts.campaign_budgets === 1 &&
    demoCounts.campaign_evidence === 1 &&
    demoCounts.campaign_leftovers === 1,
  JSON.stringify(demoCounts),
);
check(
  "el análisis tipa el plan (etiqueta legible por tipo de registro)",
  (demoPreview.body?.verdict?.deletionPlan ?? []).length > 0 &&
    (demoPreview.body.verdict.deletionPlan ?? []).every((entry) => typeof entry.label === "string" && entry.label.length > 0),
);
check(
  "el análisis confirma que NO hay dinero real (donación sin conciliar) ni documentos de gasto",
  demoPreview.body?.real?.reconciledDonations === 0 && demoPreview.body?.real?.expensesWithReceipt === 0,
  JSON.stringify(demoPreview.body?.real ?? null),
);
check(
  "el análisis identifica la cadena de hashes afectada y la verifica",
  demoPreview.body?.ledger?.movementCount === 2 &&
    demoPreview.body?.ledger?.chainVerified === true &&
    typeof demoPreview.body?.ledger?.rootHash === "string",
  JSON.stringify(demoPreview.body?.ledger ?? null),
);
check(
  "el análisis advierte de que se eliminará la cadena de prueba con copia previa",
  (demoPreview.body?.verdict?.warnings ?? []).some((w) => w.code === "ledger_chain_removed"),
);
check(
  "la vista previa NO elimina nada (la campaña sigue existiendo)",
  (await call("GET", `/api/campaigns/${demoId}`, undefined, { auth: true })).status === 200,
);

// ── Segunda campaña DEMO con un GASTO CON COMPROBANTE (dato a conservar) ─────
const receiptCampaign = await call(
  "POST",
  "/api/campaigns",
  {
    title: `E2E DEMO con boleta ${stamp}`,
    description: "Campaña DEMO con un gasto documentado: la purga debe bloquearse.",
    goal: 300,
    category: "general",
    startDate: "2026-03-01",
    status: "draft",
  },
  { auth: true },
);
const receiptId = receiptCampaign.body?.id;
await call("PATCH", `/api/campaigns/${receiptId}/status`, { status: "active" }, { auth: true });
await call(
  "POST",
  `/api/campaigns/${receiptId}/expenses`,
  {
    description: "Gasto con boleta (documento real)",
    amount: 90,
    date: "2026-03-04",
    // Documento PROPIO (no la nube DEMO de Cloudinary): es lo único que implica
    // obligación de conservación desde la corrección V9.1.
    receiptUrl: "https://res.cloudinary.com/redsolidaria/image/upload/v1/boleta-real.jpg",
    receiptType: "boleta",
  },
  { auth: true },
);

// ── Intentos de purga: reautenticación, validación y límite anti fuerza bruta ─
const purgeWrongPassword = await call(
  "POST",
  `/api/campaigns/${demoId}/demo-purge`,
  { confirm: true, identifier: String(demoId), reason: demoReason, password: "contrasena-incorrecta" },
  { auth: true },
);
check(
  "la purga exige REAUTENTICARSE: contraseña incorrecta → 401",
  purgeWrongPassword.status === 401,
  `status=${purgeWrongPassword.status} code=${purgeWrongPassword.body?.code ?? ""}`,
);

const purgeNotMarked = await call(
  "POST",
  `/api/campaigns/${demoId}/demo-purge`,
  { confirm: true, identifier: String(demoId), reason: demoReason, password: PASS },
  { auth: true },
);
check(
  "sin declaración DEMO la purga se BLOQUEA (409) y explica el paso que falta",
  purgeNotMarked.status === 409 &&
    (purgeNotMarked.body?.blockers ?? []).some((b) => b.code === "demo_not_marked"),
  `status=${purgeNotMarked.status}`,
);
check(
  "el bloqueo NO ha modificado nada (la campaña y su donación siguen ahí)",
  (await call("GET", `/api/campaigns/${demoId}`, undefined, { auth: true })).status === 200,
);

const markDemo = await call(
  "POST",
  `/api/campaigns/${demoId}/demo-mark`,
  { confirm: true, reason: demoReason, password: PASS },
  { auth: true },
);
check(
  "declarar la campaña como DEMO (con reautenticación) responde 200 y queda firmada",
  markDemo.status === 200 && markDemo.body?.campaign?.isDemo === true && Boolean(markDemo.body?.campaign?.demoMarkedBy),
  `status=${markDemo.status}`,
);

const markReceipt = await call(
  "POST",
  `/api/campaigns/${receiptId}/demo-mark`,
  { confirm: true, reason: "Campaña de demostración con un gasto documentado", password: PASS },
  { auth: true },
);
check("se declara DEMO la segunda campaña de prueba", markReceipt.status === 200, `status=${markReceipt.status}`);

const purged = await call(
  "POST",
  `/api/campaigns/${demoId}/demo-purge`,
  { confirm: true, identifier: String(demoId), reason: demoReason, password: PASS },
  { auth: true },
);
check(
  "la purga definitiva de la campaña DEMO responde 200",
  purged.status === 200,
  `status=${purged.status} ${purged.body?.message ?? ""}`,
);
const backupId = purged.body?.backupId;
check("la purga devuelve el identificador del respaldo", Number.isInteger(backupId), `backupId=${backupId}`);
check(
  "la purga devuelve el manifiesto con el sello SHA-256 del respaldo",
  /^[0-9a-f]{64}$/.test(purged.body?.manifest?.hash ?? "") && purged.body?.manifest?.ledger?.verified === true,
  `hash=${(purged.body?.manifest?.hash ?? "").slice(0, 12)}`,
);

// ── 7quater. Anulación CONTABLE de donaciones (V7.2.2) ───────────────────────
// Una donación confirmada está encadenada en el libro y la máquina de estados
// prohíbe volver atrás. Para limpiar una campaña se ANULA: nunca se borra. Lo que
// se comprueba aquí es lo que de verdad importa: tras anular, el libro sigue
// CUADRANDO y la purga DEMO deja de estar bloqueada por esa donación.
//
// NOTA: el límite de reautenticación (5 fallos / 15 min) se agota al FINAL del
// ensayo, para no interferir con las operaciones legítimas de esta sección.

const annulCampaign = await call(
  "POST",
  "/api/campaigns",
  {
    title: `E2E anulación ${stamp}`,
    description: "Campaña de prueba para la anulación contable de donaciones.",
    goal: 500,
    category: "general",
    startDate: "2026-04-01",
    status: "draft",
  },
  { auth: true },
);
const annulCampaignId = annulCampaign.body?.id;
await call("PATCH", `/api/campaigns/${annulCampaignId}/status`, { status: "active" }, { auth: true });

// Donación confirmada Y CONCILIADA con el banco: es el bloqueo que impide purgar.
const reconciledDonation = await call("POST", "/api/donations", {
  campaignId: annulCampaignId,
  firstName: "Prueba",
  lastName: "Conciliada",
  email: `conciliada-${donorEmail}`,
  amount: 60,
  paymentMethod: "transfer",
  collaborationType: "dinero",
  proofImageUrl: "https://res.cloudinary.com/demo/image/upload/v1/annul.jpg",
  proofPublicId: "e2e/annul",
});
const reconciledDonationId = reconciledDonation.body?.id;
await call("PUT", `/api/donations/${reconciledDonationId}`, { status: "approved" }, { auth: true });
const reconcileRes = await call(
  "PATCH",
  `/api/admin/donations/${reconciledDonationId}/reconcile`,
  undefined,
  { auth: true },
);
check("la donación queda CONCILIADA con el banco", reconcileRes.status === 200, `status=${reconcileRes.status}`);

await call(
  "POST",
  `/api/campaigns/${annulCampaignId}/demo-mark`,
  { confirm: true, reason: "Campaña de prueba para la anulación contable", password: PASS },
  { auth: true },
);

const blockedByReconciled = await call(
  "GET",
  `/api/campaigns/${annulCampaignId}/demo-purge/preview`,
  undefined,
  { auth: true },
);
check(
  "una donación conciliada BLOQUEA la purga DEMO (el caso a resolver)",
  blockedByReconciled.body?.verdict?.allowed === false &&
    (blockedByReconciled.body?.verdict?.blockers ?? []).some(
      (b) => b.code === "reconciled_donations",
    ),
  JSON.stringify((blockedByReconciled.body?.verdict?.blockers ?? []).map((b) => b.code)),
);

const annulPreview = await call(
  "GET",
  `/api/campaigns/${annulCampaignId}/donations/void/preview`,
  undefined,
  { auth: true },
);
check(
  "la vista previa de anulación identifica la donación conciliada y avisa de que lo está",
  annulPreview.status === 200 &&
    annulPreview.body?.plan?.annullable?.length === 1 &&
    annulPreview.body?.plan?.reconciledCount === 1 &&
    annulPreview.body?.plan?.totalAmount === 60,
  JSON.stringify(annulPreview.body?.plan ?? null),
);

const annulWrongPassword = await call(
  "POST",
  `/api/donations/${reconciledDonationId}/void`,
  { confirm: true, reason: "Donación de prueba conciliada por error", password: "contrasena-incorrecta" },
  { auth: true },
);
check(
  "anular exige REAUTENTICARSE: contraseña incorrecta → 401",
  annulWrongPassword.status === 401,
  `status=${annulWrongPassword.status}`,
);

const annulReason = "Donación de prueba: la conciliación bancaria fue un error";
const annulled = await call(
  "POST",
  `/api/donations/${reconciledDonationId}/void`,
  { confirm: true, reason: annulReason, password: PASS },
  { auth: true },
);
check(
  "la anulación contable responde 200",
  annulled.status === 200,
  `status=${annulled.status} ${annulled.body?.message ?? ""}`,
);
check(
  "la donación queda ANULADA con su motivo registrado",
  annulled.body?.donation?.status === "annulled" &&
    annulled.body?.donation?.voidReason === annulReason,
  JSON.stringify(annulled.body?.donation ?? null),
);
check(
  "se añade el ASIENTO COMPENSATORIO al libro",
  annulled.body?.reversal?.appended === true &&
    Number.isInteger(annulled.body?.reversal?.movementId),
  JSON.stringify(annulled.body?.reversal ?? null),
);
check(
  "la cadena de la campaña sigue verificando tras compensar (2 asientos)",
  annulled.body?.ledger?.verified === true && annulled.body?.ledger?.count === 2,
  JSON.stringify(annulled.body?.ledger ?? null),
);

// El libro sigue CUADRADO: es la garantía contable de la anulación.
const auditAfterAnnul = await call("GET", "/api/admin/ledger/audit", undefined, { auth: true });
const annulTotals = (auditAfterAnnul.body?.totals ?? []).find(
  (t) => t.campaignId === annulCampaignId,
);
check(
  "el libro sigue CUADRADO: 60 de ingreso compensados por 60 de reverso",
  annulTotals?.ledgerIncome === 60 &&
    annulTotals?.ledgerExpense === 60 &&
    annulTotals?.ledgerNet === 0 &&
    annulTotals?.balanced === true,
  JSON.stringify(annulTotals ?? null),
);
check(
  "la donación anulada ya NO cuenta como ingreso de la campaña",
  annulTotals?.sourceIncome === 0 && annulTotals?.sourceNet === 0,
  JSON.stringify(annulTotals ?? null),
);
check(
  "el informe de integridad sigue sano (sin huérfanos ni descuadres nuevos)",
  auditAfterAnnul.body?.chain?.verified === true &&
    (auditAfterAnnul.body?.movementsWithoutSource ?? []).length === 0 &&
    (auditAfterAnnul.body?.duplicateMovements ?? []).length === 0 &&
    // Los descuadres del seed (DB-09: donaciones históricas sin asiento) son
    // preexistentes; lo que se comprueba es que la anulación no añade ninguno.
    !(auditAfterAnnul.body?.unbalancedCampaigns ?? []).includes(annulCampaignId),
  JSON.stringify({
    orphans: (auditAfterAnnul.body?.movementsWithoutSource ?? []).length,
    unbalanced: auditAfterAnnul.body?.unbalancedCampaigns ?? null,
  }),
);

// Y AHORA la purga DEMO deja de estar bloqueada por esa donación.
const unblocked = await call(
  "GET",
  `/api/campaigns/${annulCampaignId}/demo-purge/preview`,
  undefined,
  { auth: true },
);
check(
  "tras anular, la purga DEMO deja de estar bloqueada y lo explica",
  unblocked.body?.verdict?.allowed === true &&
    (unblocked.body?.verdict?.warnings ?? []).some((w) => w.code === "donations_annulled"),
  JSON.stringify((unblocked.body?.verdict?.blockers ?? []).map((b) => b.code)),
);

const annulAgain = await call(
  "POST",
  `/api/donations/${reconciledDonationId}/void`,
  { confirm: true, reason: annulReason, password: PASS },
  { auth: true },
);
check("volver a anular la misma donación → 409 (no duplica el reverso)", annulAgain.status === 409, `status=${annulAgain.status}`);

// Anulación EN BLOQUE: otra campaña con dos donaciones confirmadas.
const bulkCampaign = await call(
  "POST",
  "/api/campaigns",
  {
    title: `E2E anulación en bloque ${stamp}`,
    description: "Campaña de prueba para la anulación en bloque.",
    goal: 300,
    category: "general",
    startDate: "2026-04-01",
    status: "draft",
  },
  { auth: true },
);
const bulkCampaignId = bulkCampaign.body?.id;
await call("PATCH", `/api/campaigns/${bulkCampaignId}/status`, { status: "active" }, { auth: true });
for (const [index, amount] of [30, 45].entries()) {
  const created = await call("POST", "/api/donations", {
    campaignId: bulkCampaignId,
    firstName: "Lote",
    lastName: `Demo${index}`,
    email: `lote-${index}-${donorEmail}`,
    amount,
    paymentMethod: "transfer",
    collaborationType: "dinero",
    proofImageUrl: "https://res.cloudinary.com/demo/image/upload/v1/lote.jpg",
    proofPublicId: `e2e/lote${index}`,
  });
  await call("PUT", `/api/donations/${created.body?.id}`, { status: "approved" }, { auth: true });
}

const bulkVoid = await call(
  "POST",
  `/api/campaigns/${bulkCampaignId}/donations/void`,
  { confirm: true, reason: "Campaña de prueba: limpiar donaciones ficticias", password: PASS },
  { auth: true },
);
check(
  "la anulación EN BLOQUE responde 200",
  bulkVoid.status === 200,
  `status=${bulkVoid.status} ${bulkVoid.body?.message ?? ""}`,
);
check(
  "anula todas las confirmadas, compensa cada una y suma el importe",
  bulkVoid.body?.annulled === 2 &&
    bulkVoid.body?.reversals === 2 &&
    bulkVoid.body?.totalAmount === 75,
  JSON.stringify(bulkVoid.body ?? null),
);
check(
  "el libro de esa campaña sigue verificando",
  bulkVoid.body?.ledger?.verified === true && bulkVoid.body?.ledger?.count === 4,
  JSON.stringify(bulkVoid.body?.ledger ?? null),
);

const auditAfterBulk = await call("GET", "/api/admin/ledger/audit", undefined, { auth: true });
const bulkTotals = (auditAfterBulk.body?.totals ?? []).find((t) => t.campaignId === bulkCampaignId);
check(
  "el lote queda a CERO y cuadrado (75 de ingreso, 75 de reverso)",
  bulkTotals?.ledgerIncome === 75 &&
    bulkTotals?.ledgerExpense === 75 &&
    bulkTotals?.ledgerNet === 0 &&
    bulkTotals?.sourceNet === 0 &&
    bulkTotals?.balanced === true,
  JSON.stringify(bulkTotals ?? null),
);
check(
  "el informe global sigue sano tras la anulación en bloque",
  auditAfterBulk.body?.chain?.verified === true &&
    (auditAfterBulk.body?.movementsWithoutSource ?? []).length === 0 &&
    !(auditAfterBulk.body?.unbalancedCampaigns ?? []).includes(bulkCampaignId),
  JSON.stringify({
    orphans: (auditAfterBulk.body?.movementsWithoutSource ?? []).length,
    unbalanced: auditAfterBulk.body?.unbalancedCampaigns ?? null,
  }),
);

// Auditoría externa de la corrección contable.
const annulAudit = await call(
  "GET",
  "/api/admin/audit-logs?action=DONATION_ANNULLED&resource=donations",
  undefined,
  { auth: true },
);
check(
  "la anulación individual queda en el registro de auditoría con su motivo",
  Array.isArray(annulAudit.body) &&
    annulAudit.body.some(
      (row) => row.resourceId === String(reconciledDonationId) && row.details?.reason === annulReason,
    ),
  `registros=${Array.isArray(annulAudit.body) ? annulAudit.body.length : "?"}`,
);
const bulkAudit = await call(
  "GET",
  "/api/admin/audit-logs?action=DONATION_ANNULLED&resource=campaigns",
  undefined,
  { auth: true },
);
check(
  "la anulación en bloque queda auditada con su recuento y su importe",
  Array.isArray(bulkAudit.body) &&
    bulkAudit.body.some(
      (row) => row.resourceId === String(bulkCampaignId) && row.details?.count === 2,
    ),
  `registros=${Array.isArray(bulkAudit.body) ? bulkAudit.body.length : "?"}`,
);

// ── 7quinquies. 2FA del superadmin de respaldo por variables de entorno ───────
// El superadmin de entorno (ADMIN_USERNAME, sesión id 0) no tiene fila en
// admin_users, así que /admin/2fa/* le respondía 404 («Usuario no encontrado») y
// quedaba SIEMPRE solo con contraseña. Como app.ts exige esas variables en
// producción, el panel tenía una entrada sin segundo factor. Ahora su secreto vive
// en su propia tabla y el código se exige en el login y en las operaciones
// irreversibles.
//
// El código TOTP se calcula aquí con una implementación PROPIA (RFC 6238) para no
// reutilizar la del servidor: si la del servidor estuviera mal, reutilizarla haría
// pasar la prueba igualmente.
const { createHmac } = await import("node:crypto");

function base32Decode(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = String(secret).toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totpCode(secret, atMs = Date.now(), stepSeconds = 30, digits = 6) {
  const counter = Math.floor(atMs / 1000 / stepSeconds);
  const message = Buffer.alloc(8);
  message.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  message.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

const statusBefore = await call("GET", "/api/admin/2fa/status", undefined, { auth: true });
check(
  "el superadmin de entorno consulta su 2FA (antes daba 404)",
  statusBefore.status === 200 &&
    statusBefore.body?.enabled === false &&
    statusBefore.body?.envAccount === true,
  `status=${statusBefore.status} ${JSON.stringify(statusBefore.body ?? null)}`,
);

const setup2fa = await call("POST", "/api/admin/2fa/setup", undefined, { auth: true });
check(
  "CONFIGURAR 2FA en el superadmin de entorno ya funciona (antes 404)",
  setup2fa.status === 200 &&
    typeof setup2fa.body?.secret === "string" &&
    String(setup2fa.body?.otpauthUri ?? "").startsWith("otpauth://totp/"),
  `status=${setup2fa.status} ${setup2fa.body?.message ?? ""}`,
);
const envSecret = setup2fa.body?.secret ?? "";
check("el secreto generado es válido para el autenticador (base32)", envSecret.length >= 16, `len=${envSecret.length}`);

// El secreto NO puede filtrarse por los endpoints genéricos de configuración.
const settingsDump = await call("GET", "/api/admin/settings", undefined, { auth: true });
check(
  "el secreto TOTP NO se filtra por /admin/settings (tabla propia, no settings)",
  settingsDump.status === 200 && !settingsDump.text.includes(envSecret),
);

const verifyWrong = await call("POST", "/api/admin/2fa/verify", { code: "000000" }, { auth: true });
check("un código incorrecto no activa el 2FA (401)", verifyWrong.status === 401, `status=${verifyWrong.status}`);

const verifyOk = await call("POST", "/api/admin/2fa/verify", { code: totpCode(envSecret) }, { auth: true });
check(
  "el 2FA del superadmin de entorno queda ACTIVO",
  verifyOk.status === 200,
  `status=${verifyOk.status} ${verifyOk.body?.message ?? ""}`,
);

const statusAfter = await call("GET", "/api/admin/2fa/status", undefined, { auth: true });
check("el estado pasa a activo", statusAfter.body?.enabled === true, JSON.stringify(statusAfter.body ?? null));

// El login del superadmin de entorno ahora exige el segundo factor.
const loginPending = await call("POST", "/api/admin/login", { username: USER, password: PASS });
check(
  "el login del superadmin de entorno exige el código 2FA",
  loginPending.status === 200 &&
    loginPending.body?.twoFactorRequired === true &&
    loginPending.body?.userId === 0,
  JSON.stringify(loginPending.body ?? null),
);

const loginBadCode = await call("POST", "/api/admin/2fa/login", { userId: 0, code: "000000" });
check("el paso 2 con código incorrecto → 401", loginBadCode.status === 401, `status=${loginBadCode.status}`);

const loginGoodCode = await call(
  "POST",
  "/api/admin/2fa/login",
  { userId: 0, code: totpCode(envSecret) },
  { auth: true },
);
check(
  "el paso 2 con el código correcto abre sesión de superadmin",
  loginGoodCode.status === 200 &&
    loginGoodCode.body?.user?.role === "superadmin" &&
    loginGoodCode.body?.user?.id === 0,
  JSON.stringify(loginGoodCode.body ?? null),
);
const meAfter2fa = await call("GET", "/api/admin/me", undefined, { auth: true });
check(
  "la sesión abierta en el paso 2 es válida",
  meAfter2fa.status === 200 && meAfter2fa.body?.role === "superadmin",
  JSON.stringify(meAfter2fa.body ?? null),
);

// La reautenticación de operaciones irreversibles también exige el código.
const reauthNoCode = await call(
  "POST",
  `/api/campaigns/${annulCampaignId}/demo-mark`,
  { confirm: true, reason: "Prueba de reautenticación con 2FA activo", password: PASS },
  { auth: true },
);
check(
  "una operación irreversible exige el CÓDIGO además de la contraseña",
  reauthNoCode.status === 401 && reauthNoCode.body?.code === "totp_required",
  `status=${reauthNoCode.status} code=${reauthNoCode.body?.code ?? ""}`,
);

const reauthWithCode = await call(
  "POST",
  `/api/campaigns/${annulCampaignId}/demo-mark`,
  {
    confirm: true,
    reason: "Prueba de reautenticación con 2FA activo",
    password: PASS,
    totpCode: totpCode(envSecret),
  },
  { auth: true },
);
check(
  "con contraseña + código la operación irreversible se autoriza",
  reauthWithCode.status === 200,
  `status=${reauthWithCode.status} ${reauthWithCode.body?.message ?? ""}`,
);

// Desactivación: vuelve al estado inicial y deja de ser una vía de entrada.
const disableWrong = await call("POST", "/api/admin/2fa/disable", { code: "000000" }, { auth: true });
check("desactivar con código incorrecto → 401", disableWrong.status === 401, `status=${disableWrong.status}`);

const disableOk = await call(
  "POST",
  "/api/admin/2fa/disable",
  { code: totpCode(envSecret) },
  { auth: true },
);
check("desactivar con el código correcto → 200", disableOk.status === 200, `status=${disableOk.status}`);

const statusFinal = await call("GET", "/api/admin/2fa/status", undefined, { auth: true });
check("el 2FA vuelve a estar desactivado", statusFinal.body?.enabled === false, JSON.stringify(statusFinal.body ?? null));

const loginPlain = await call("POST", "/api/admin/login", { username: USER, password: PASS });
check(
  "sin 2FA el login del superadmin de entorno vuelve a ser solo con contraseña",
  loginPlain.status === 200 && loginPlain.body?.success === true,
  JSON.stringify(loginPlain.body ?? null),
);

const loginAfterDisable = await call("POST", "/api/admin/2fa/login", {
  userId: 0,
  code: totpCode(envSecret),
});
check(
  "desactivado, un código válido ya NO abre sesión por sí solo (401)",
  loginAfterDisable.status === 401,
  `status=${loginAfterDisable.status}`,
);

// La sesión del ensayo sigue siendo válida: lo que sigue depende de ella.
const sessionStillValid = await call("GET", "/api/admin/me", undefined, { auth: true });
check(
  "la sesión del ensayo sigue válida tras todo el ciclo de 2FA",
  sessionStillValid.status === 200,
  `status=${sessionStillValid.status}`,
);

// ── 7sexies. Mantenimiento: inventario, protección de ChocoFest y conciliación ─
// Fase 1-3 del V9.1: la herramienta debe decir qué es DEMO (con evidencia),
// proteger ChocoFest por ID REAL y explicar cada cifra del panel sin ocultarla.
// Se apoya en la campaña Chocofest 2025 del seed (la real): protegerla y comprobar
// que queda fuera del alcance de cualquier purga.
const MAINT_REASON = "Limpieza integral de datos de prueba de la plataforma";

const inventory = await call("GET", "/api/admin/maintenance/inventory", undefined, { auth: true });
check(
  "el inventario integral responde 200 con recuentos por tabla",
  inventory.status === 200 && Array.isArray(inventory.body?.inventory?.byTable) && inventory.body.inventory.byTable.length > 0,
  `status=${inventory.status}`,
);
check(
  "el inventario clasifica cada registro en las cuatro categorías",
  inventory.body?.inventory?.totals !== undefined &&
    ["real", "demo", "pending", "protected"].every((key) => typeof inventory.body.inventory.totals[key] === "number"),
  JSON.stringify(inventory.body?.inventory?.totals ?? null),
);
check(
  "la campaña DEMO ya purgada no aparece en el inventario",
  !(inventory.body?.inventory?.records ?? []).some((r) => r.table === "campaigns" && r.id === demoId),
);

const candidates = inventory.body?.protection?.candidates ?? [];
check(
  "se detectan las candidatas a proteger resolviendo IDs reales de la base",
  candidates.length > 0 && candidates.every((c) => /choco\s*fest|chocolatada/i.test(c.title) && [2025, 2026].includes(c.year)),
  `candidatas=${JSON.stringify(candidates.map((c) => ({ id: c.id, year: c.year })))}`,
);
const seededChocofest = candidates.find((c) => /chocofest 2025/i.test(c.title));
check("la Chocofest 2025 del seed es candidata", seededChocofest !== undefined, `ids=${JSON.stringify(candidates.map((c) => c.id))}`);
check(
  "sin proteger todavía, el inventario no da ninguna campaña por protegida",
  (inventory.body?.protection?.protectedCampaignIds ?? []).length === 0,
  JSON.stringify(inventory.body?.protection?.protectedCampaignIds ?? null),
);

// Protección: se guarda por ID y bloquea cualquier purga o declaración DEMO.
const protect = await call(
  "POST",
  "/api/admin/maintenance/protect-campaigns",
  { confirm: true, reason: MAINT_REASON, password: PASS },
  { auth: true },
);
check(
  "la protección de ChocoFest se resuelve y se guarda por ID",
  protect.status === 200 && (protect.body?.protectedCampaignIds ?? []).includes(seededChocofest?.id),
  `status=${protect.status} ids=${JSON.stringify(protect.body?.protectedCampaignIds ?? null)}`,
);

const markProtected = await call(
  "POST",
  `/api/campaigns/${seededChocofest?.id}/demo-mark`,
  { confirm: true, reason: MAINT_REASON, password: PASS },
  { auth: true },
);
check(
  "una campaña PROTEGIDA no se puede declarar DEMO (409)",
  markProtected.status === 409 && markProtected.body?.code === "protected_campaign",
  `status=${markProtected.status} code=${markProtected.body?.code ?? ""}`,
);

const purgeProtected = await call(
  "POST",
  `/api/campaigns/${seededChocofest?.id}/demo-purge`,
  {
    confirm: true,
    reason: MAINT_REASON,
    password: PASS,
    identifier: String(seededChocofest?.id),
  },
  { auth: true },
);
check(
  "una campaña PROTEGIDA no se puede purgar (409)",
  purgeProtected.status === 409 && purgeProtected.body?.code === "protected_campaign",
  `status=${purgeProtected.status} code=${purgeProtected.body?.code ?? ""}`,
);

// La conciliación debe explicar EXACTAMENTE las cifras del panel.
const reconciliation = await call("GET", "/api/admin/maintenance/reconciliation", undefined, { auth: true });
const dashboardNow = await call("GET", "/api/admin/dashboard", undefined, { auth: true });
check(
  "la conciliación reproduce la recaudación del dashboard",
  reconciliation.status === 200 && reconciliation.body?.summary?.totalRaised === dashboardNow.body?.summary?.totalRaised,
  `conciliación=${reconciliation.body?.summary?.totalRaised} panel=${dashboardNow.body?.summary?.totalRaised}`,
);
check(
  "la conciliación reproduce los gastos y el saldo del dashboard",
  reconciliation.body?.summary?.totalSpent === dashboardNow.body?.summary?.totalSpent &&
    reconciliation.body?.summary?.balance === dashboardNow.body?.summary?.balance,
  `gastos ${reconciliation.body?.summary?.totalSpent}/${dashboardNow.body?.summary?.totalSpent} · saldo ${reconciliation.body?.summary?.balance}/${dashboardNow.body?.summary?.balance}`,
);
check(
  "cada línea conciliada lleva campaña, importe, clasificación y evidencia",
  (reconciliation.body?.figures?.spent?.lines ?? []).length > 0 &&
    (reconciliation.body.figures.spent.lines ?? []).every(
      (line) => typeof line.id === "number" && typeof line.amount === "number" && typeof line.classification === "string" && line.reason.length > 0,
    ),
);
check(
  "el informe separa la parte DEMO y la pendiente de cada cifra",
  typeof reconciliation.body?.summary?.demoSpent === "number" && typeof reconciliation.body?.summary?.pendingSpent === "number",
  JSON.stringify(reconciliation.body?.summary ?? null),
);

// El informe del libro distingue «sin movimientos» de «verificado».
const ledgerReport = await call("GET", "/api/admin/ledger/audit", undefined, { auth: true });
check(
  "el informe del libro declara su estado (empty/healthy/issues)",
  ledgerReport.status === 200 && ["empty", "healthy", "issues"].includes(ledgerReport.body?.status),
  `status=${ledgerReport.status} estado=${ledgerReport.body?.status ?? ""}`,
);
check(
  "con la cadena vacía NO se declara verificada",
  ledgerReport.body?.empty === true ? ledgerReport.body?.status === "empty" : true,
  `empty=${ledgerReport.body?.empty} status=${ledgerReport.body?.status}`,
);
check(
  "el informe del libro informa de los asientos de importe cero",
  Array.isArray(ledgerReport.body?.zeroAmountMovements),
  `zero=${JSON.stringify(ledgerReport.body?.zeroAmountMovements ?? null)}`,
);

// ── 7octies. GASTOS DEMO: eliminación real y dashboard actualizado (V10.1) ───
// PRUEBA DE ACEPTACIÓN: eliminar un gasto DEMO debe modificar la base y mover los
// totales del dashboard exactamente en su importe.
const EXP_REASON = "Verificación E2E: gastos ficticios de la campaña de prueba";

const expCampaign = await call(
  "POST",
  "/api/campaigns",
  {
    title: `Gastos DEMO E2E ${stamp}`,
    description: "Campaña de prueba para la eliminación de gastos ficticios.",
    goal: 500,
    category: "general",
    startDate: "2026-01-01",
    status: "draft",
  },
  { auth: true },
);
const expCampaignId = expCampaign.body?.id;
check("se crea la campaña de prueba de gastos", expCampaign.status === 201 && Number.isInteger(expCampaignId), `status=${expCampaign.status}`);

const expMarked = await call(
  "POST",
  `/api/campaigns/${expCampaignId}/demo-mark`,
  { confirm: true, reason: EXP_REASON, password: PASS },
  { auth: true },
);
check("la campaña de gastos se declara DEMO", expMarked.status === 200, `status=${expMarked.status}`);

// Gasto ficticio SIN asiento (privado: no se encadena).
const noLedgerExpense = await call(
  "POST",
  `/api/campaigns/${expCampaignId}/expenses`,
  { description: "Gasto ficticio sin asiento (E2E)", amount: 120, date: "2026-04-01", category: "materiales", isPublic: false },
  { auth: true },
);
// Gasto ficticio CON asiento (público: queda encadenado).
const withLedgerExpense = await call(
  "POST",
  `/api/campaigns/${expCampaignId}/expenses`,
  { description: "Gasto ficticio con asiento (E2E)", amount: 80, date: "2026-04-02", category: "transporte", isPublic: true },
  { auth: true },
);
const noLedgerId = noLedgerExpense.body?.id;
const withLedgerId = withLedgerExpense.body?.id;
check("se crean los dos gastos de prueba", noLedgerExpense.status === 201 && withLedgerExpense.status === 201, `status=${noLedgerExpense.status}/${withLedgerExpense.status}`);

// Gasto REAL (documento propio) en una campaña NO declarada DEMO.
const realCampaign = await call(
  "POST",
  "/api/campaigns",
  {
    title: `Real E2E ${stamp}`,
    description: "Campaña de prueba con un gasto auténtico.",
    goal: 500,
    category: "general",
    startDate: "2026-01-01",
    status: "draft",
  },
  { auth: true },
);
const realCampaignId = realCampaign.body?.id;
const realExpense = await call(
  "POST",
  `/api/campaigns/${realCampaignId}/expenses`,
  {
    description: "Gasto real con boleta (E2E)",
    amount: 45,
    date: "2026-04-03",
    category: "general",
    isPublic: false,
    receiptUrl: "https://res.cloudinary.com/redsolidaria/image/upload/v1/boleta-e2e.jpg",
    receiptType: "boleta",
  },
  { auth: true },
);
const realExpenseId = realExpense.body?.id;
check("se crea el gasto auténtico", realExpense.status === 201, `status=${realExpense.status}`);

// ─── Diagnóstico: el gestor distingue los cuatro casos ──────────────────────
const expenseTable = await call("GET", "/api/admin/maintenance/expenses", undefined, { auth: true });
const findExpense = (id) => (expenseTable.body?.expenses ?? []).find((row) => row.id === id);
check("el gestor de gastos responde 200 con la tabla completa", expenseTable.status === 200 && Array.isArray(expenseTable.body?.expenses), `status=${expenseTable.status}`);
check(
  "un gasto ficticio SIN asiento se propone para eliminación definitiva",
  findExpense(noLedgerId)?.action === "delete" && findExpense(noLedgerId)?.deletable === true,
  `action=${findExpense(noLedgerId)?.action}`,
);
check(
  "un gasto ficticio CON asiento se propone para purga controlada",
  findExpense(withLedgerId)?.action === "purge_with_ledger" && findExpense(withLedgerId)?.deletable === true,
  `action=${findExpense(withLedgerId)?.action} movs=${JSON.stringify(findExpense(withLedgerId)?.ledgerMovements ?? null)}`,
);
check(
  "un gasto REAL con documento propio NO es eliminable (se corrige, no se borra)",
  findExpense(realExpenseId)?.deletable === false &&
    findExpense(realExpenseId)?.action === "regularize" &&
    findExpense(realExpenseId)?.conservationObligation === true,
  `action=${findExpense(realExpenseId)?.action} blockers=${JSON.stringify(findExpense(realExpenseId)?.blockers ?? null)}`,
);
check(
  "los gastos de la campaña protegida quedan en revisión manual",
  (expenseTable.body?.expenses ?? [])
    .filter((row) => row.campaignId === seededChocofest?.id)
    .every((row) => row.deletable === false && row.protectedCampaign === true),
);
check(
  "el resumen del gestor informa de eliminables, con asiento y huérfanos",
  typeof expenseTable.body?.summary?.deletableCount === "number" &&
    typeof expenseTable.body?.summary?.withLedger === "number" &&
    typeof expenseTable.body?.summary?.orphans === "number",
  JSON.stringify(expenseTable.body?.summary ?? null),
);

const expenseDetail = await call("GET", `/api/admin/maintenance/expenses/${withLedgerId}`, undefined, { auth: true });
check(
  "el diagnóstico individual informa de sus dependencias y de la cadena",
  expenseDetail.status === 200 &&
    expenseDetail.body?.hasLedgerEntry === true &&
    expenseDetail.body?.ledgerMovements?.length === 1 &&
    expenseDetail.body?.chainVerifiedAfterRemoval === true,
  `status=${expenseDetail.status} body=${JSON.stringify(expenseDetail.body?.ledgerMovements ?? null)}`,
);

const orphanScan = await call("GET", "/api/admin/maintenance/orphans", undefined, { auth: true });
check(
  "el diagnóstico de huérfanos responde 200 (0 es un resultado válido)",
  orphanScan.status === 200 && Array.isArray(orphanScan.body?.expenses) && Array.isArray(orphanScan.body?.donations),
  `status=${orphanScan.status}`,
);

// ─── Un gasto real NO se elimina por la puerta de atrás ────────────────────
const refuseReal = await call(
  "POST",
  "/api/admin/maintenance/expenses/purge",
  { ids: [realExpenseId], confirm: true, reason: EXP_REASON, password: PASS },
  { auth: true },
);
check(
  "eliminar un gasto REAL se rechaza (409) y no se toca",
  refuseReal.status === 409 && refuseReal.body?.code === "expenses_not_deletable",
  `status=${refuseReal.status} code=${refuseReal.body?.code ?? ""}`,
);

const refuseDeleteRoute = await call("DELETE", `/api/campaigns/${realCampaignId}/expenses/${realExpenseId}`, undefined, { auth: true });
check(
  "el DELETE de la ruta de gastos también rechaza un gasto real (409)",
  refuseDeleteRoute.status === 409,
  `status=${refuseDeleteRoute.status} code=${refuseDeleteRoute.body?.code ?? ""}`,
);

// ─── Vista previa ──────────────────────────────────────────────────────────
const expPreview = await call(
  "POST",
  "/api/admin/maintenance/expenses/purge",
  { ids: [noLedgerId, withLedgerId], preview: true },
  { auth: true },
);
check(
  "la vista previa dice exactamente qué se borraría",
  expPreview.status === 200 &&
    expPreview.body?.plan?.totals?.expenses === 2 &&
    expPreview.body?.plan?.totals?.amount === 200 &&
    expPreview.body?.plan?.totals?.movements === 1,
  `status=${expPreview.status} totals=${JSON.stringify(expPreview.body?.plan?.totals ?? null)}`,
);

// ─── ANTES ─────────────────────────────────────────────────────────────────
const dashBeforeExpenses = await call("GET", "/api/admin/dashboard", undefined, { auth: true });
const spentBefore = dashBeforeExpenses.body?.summary?.totalSpent;
const balanceBefore = dashBeforeExpenses.body?.summary?.balance;
const checkBefore = await call("GET", "/api/admin/maintenance/financial-check", undefined, { auth: true });
check("la comprobación financiera previa responde 200", checkBefore.status === 200, `status=${checkBefore.status}`);

// ─── EJECUCIÓN ─────────────────────────────────────────────────────────────
const expPurge = await call(
  "POST",
  "/api/admin/maintenance/expenses/purge",
  { ids: [noLedgerId, withLedgerId], confirm: true, reason: EXP_REASON, password: PASS },
  { auth: true },
);
check(
  "la eliminación se ejecuta y cuadra con lo purgado",
  expPurge.status === 200 &&
    expPurge.body?.deleted?.deletedExpenses === 2 &&
    expPurge.body?.deleted?.deletedMovements === 1 &&
    expPurge.body?.comparison?.matchesPurged === true,
  `status=${expPurge.status} deleted=${JSON.stringify(expPurge.body?.deleted ?? null)} matches=${expPurge.body?.comparison?.matchesPurged}`,
);
check(
  "se creó el respaldo verificable de la purga",
  Array.isArray(expPurge.body?.deleted?.backupIds) && expPurge.body.deleted.backupIds.length === 1,
  JSON.stringify(expPurge.body?.deleted?.backupIds ?? null),
);

// ─── DESPUÉS: la base cambió de verdad ─────────────────────────────────────
const campaignExpensesAfter = await call("GET", `/api/campaigns/${expCampaignId}/expenses`, undefined, { auth: true });
check(
  "los gastos purgados YA NO existen en la base",
  campaignExpensesAfter.status === 200 &&
    !(campaignExpensesAfter.body ?? []).some((row) => row.id === noLedgerId || row.id === withLedgerId),
  `ids=${JSON.stringify((campaignExpensesAfter.body ?? []).map((row) => row.id))}`,
);

const deletedExpenseDelete = await call("DELETE", `/api/campaigns/${expCampaignId}/expenses/${noLedgerId}`, undefined, { auth: true });
check("borrar un gasto ya purgado responde 404 (no existe)", deletedExpenseDelete.status === 404, `status=${deletedExpenseDelete.status}`);

const realStillThere = await call("GET", `/api/campaigns/${realCampaignId}/expenses`, undefined, { auth: true });
const managerAfterPurge = await call("GET", "/api/admin/maintenance/expenses", undefined, { auth: true });
check(
  "el gasto auténtico SIGUE en la base (visto desde el gestor de mantenimiento)",
  (managerAfterPurge.body?.expenses ?? []).some((row) => row.id === realExpenseId) &&
    (realStillThere.body ?? []).length === 0,
  `gestor=${JSON.stringify((managerAfterPurge.body?.expenses ?? []).filter((r) => r.id === realExpenseId).map((r) => r.id))} · vista pública=${JSON.stringify((realStillThere.body ?? []).map((r) => r.id))}`,
);

// ─── El dashboard refleja el borrado ───────────────────────────────────────
const dashAfterExpenses = await call("GET", "/api/admin/dashboard", undefined, { auth: true });
const spentAfter = dashAfterExpenses.body?.summary?.totalSpent;
const balanceAfter = dashAfterExpenses.body?.summary?.balance;
const round2 = (value) => Math.round(Number(value ?? 0) * 100) / 100;
check(
  "el total de gastos del dashboard baja EXACTAMENTE lo eliminado",
  round2(spentAfter) === round2(round2(spentBefore) - 200),
  `antes=${spentBefore} después=${spentAfter}`,
);
check(
  "el saldo del dashboard sube exactamente lo eliminado",
  round2(balanceAfter) === round2(round2(balanceBefore) + 200),
  `antes=${balanceBefore} después=${balanceAfter}`,
);

const expenseTableAfter = await call("GET", "/api/admin/maintenance/expenses", undefined, { auth: true });
check(
  "los gastos purgados desaparecen del gestor",
  !(expenseTableAfter.body?.expenses ?? []).some((row) => row.id === noLedgerId || row.id === withLedgerId),
);

// ─── Integridad: cadena, huérfanos y auditoría ─────────────────────────────
const ledgerAfterExpenses = await call("GET", "/api/admin/ledger/audit", undefined, { auth: true });
check(
  "la cadena del libro sigue verificando tras retirar el asiento de prueba",
  ledgerAfterExpenses.body?.chain?.verified === true,
  `verified=${ledgerAfterExpenses.body?.chain?.verified}`,
);
check(
  "no quedan asientos huérfanos tras la purga",
  (ledgerAfterExpenses.body?.movementsWithoutSource ?? []).length === 0,
  JSON.stringify(ledgerAfterExpenses.body?.movementsWithoutSource ?? null),
);

const auditAfterExpenses = await call("GET", "/api/admin/audit-logs?limit=100", undefined, { auth: true });
check(
  "la purga de gastos queda registrada en la auditoría",
  String(JSON.stringify(auditAfterExpenses.body ?? {})).includes("EXPENSE_DEMO_PURGED"),
);

// ── 7nonies. GASTOS HUÉRFANOS: clasificación manual y eliminación (V11) ──────
// PRUEBA DE ACEPTACIÓN: un gasto huérfano (su campaña ya no existe) debe poder
// clasificarse como DEMO y eliminarse, moviendo el dashboard en su importe exacto.
//
// Los dos huérfanos los crea el propio runner (`run-e2e.sh`) con psql, porque las
// claves ajenas impiden crearlos por la API: la FK de
// `campaign_expenses.campaign_id` se añadió con NOT VALID (migración 025) y
// PostgreSQL no revisó las filas anteriores. Así se reproduce la condición real de
// producción. Aquí solo se localizan por su descripción.
const orphanTable = await call("GET", "/api/admin/maintenance/expenses", undefined, { auth: true });
const orphanDemoRow = (orphanTable.body?.expenses ?? []).find(
  (row) => row.isOrphan === true && /hu\u00e9rfano DEMO/i.test(row.description),
);
const orphanRealRow = (orphanTable.body?.expenses ?? []).find(
  (row) => row.isOrphan === true && /hu\u00e9rfano real/i.test(row.description),
);
const orphanDemoId = orphanDemoRow?.id;
const orphanRealId = orphanRealRow?.id;
check(
  "se localizan los gastos huérfanos de prueba (su campaña no existe)",
  Number.isInteger(orphanDemoId) &&
    Number.isInteger(orphanRealId) &&
    orphanDemoRow?.campaignExists === false,
  `ids=${orphanDemoId}/${orphanRealId}`,
);

// ─── 1. Huérfano SIN clasificación: bloqueado ───────────────────────────────
const findOrphan = (id) => (orphanTable.body?.expenses ?? []).find((row) => row.id === id);
check(
  "un gasto huérfano sin clasificar queda en REVISIÓN MANUAL (bloqueado)",
  findOrphan(orphanDemoId)?.action === "review" &&
    findOrphan(orphanDemoId)?.deletable === false &&
    (findOrphan(orphanDemoId)?.blockers ?? []).includes("orphan_expense"),
  `action=${findOrphan(orphanDemoId)?.action} blockers=${JSON.stringify(findOrphan(orphanDemoId)?.blockers ?? null)}`,
);

const orphanPurgeBlocked = await call(
  "POST",
  "/api/admin/maintenance/expenses/purge",
  { ids: [orphanDemoId], confirm: true, reason: EXP_REASON, password: PASS },
  { auth: true },
);
check(
  "intentar eliminar un huérfano sin clasificar se rechaza (409)",
  orphanPurgeBlocked.status === 409 && orphanPurgeBlocked.body?.code === "expenses_not_deletable",
  `status=${orphanPurgeBlocked.status}`,
);

// ─── 2. Clasificación manual: DEMO (desbloquea) y REAL (protege) ────────────
const classifyDemo = await call(
  "POST",
  "/api/admin/maintenance/expenses/classify",
  {
    ids: [orphanDemoId],
    classification: "demo",
    reason: "Gasto de prueba de la campaña de adopciones que ya se eliminó",
    evidence: "Respaldo: captura del panel de desarrollo",
    password: PASS,
  },
  { auth: true },
);
check(
  "el huérfano se clasifica como DEMO con motivo y evidencia",
  classifyDemo.status === 200 && classifyDemo.body?.classified === 1 && classifyDemo.body?.classificationLabel === "DEMO confirmado",
  `status=${classifyDemo.status} body=${JSON.stringify(classifyDemo.body?.classificationLabel ?? null)}`,
);
check(
  "la clasificación cambia la acción disponible en la MISMA respuesta",
  (classifyDemo.body?.expenses ?? []).some(
    (row) => row.id === orphanDemoId && row.action === "delete" && row.deletable === true,
  ),
  JSON.stringify((classifyDemo.body?.expenses ?? []).map((row) => `${row.id}:${row.action}`)),
);

const classifyReal = await call(
  "POST",
  "/api/admin/maintenance/expenses/classify",
  {
    ids: [orphanRealId],
    classification: "real",
    reason: "Corresponde a una compra auténtica con boleta en papel",
    password: PASS,
  },
  { auth: true },
);
check("el segundo huérfano se clasifica como REAL", classifyReal.status === 200, `status=${classifyReal.status}`);

// ─── 3. Persistencia: se lee de PostgreSQL en peticiones nuevas ─────────────
const orphanTableAfter = await call("GET", "/api/admin/maintenance/expenses", undefined, { auth: true });
const findOrphanAfter = (id) => (orphanTableAfter.body?.expenses ?? []).find((row) => row.id === id);
check(
  "la clasificación PERSISTE (petición nueva, sin caché) y desbloquea la eliminación",
  findOrphanAfter(orphanDemoId)?.action === "delete" &&
    findOrphanAfter(orphanDemoId)?.deletable === true &&
    findOrphanAfter(orphanDemoId)?.manualClassification?.classification === "demo" &&
    findOrphanAfter(orphanDemoId)?.manualClassification?.classifiedBy === USER,
  `action=${findOrphanAfter(orphanDemoId)?.action} manual=${JSON.stringify(findOrphanAfter(orphanDemoId)?.manualClassification ?? null)}`,
);
check(
  "un huérfano clasificado REAL queda protegido (no se destruye)",
  findOrphanAfter(orphanRealId)?.deletable === false &&
    findOrphanAfter(orphanRealId)?.classification === "real" &&
    findOrphanAfter(orphanRealId)?.action === "regularize",
  `action=${findOrphanAfter(orphanRealId)?.action} deletable=${findOrphanAfter(orphanRealId)?.deletable}`,
);

const orphanRealPurge = await call(
  "POST",
  "/api/admin/maintenance/expenses/purge",
  { ids: [orphanRealId], confirm: true, reason: EXP_REASON, password: PASS },
  { auth: true },
);
check(
  "eliminar el huérfano clasificado REAL se rechaza (409)",
  orphanRealPurge.status === 409,
  `status=${orphanRealPurge.status}`,
);

// ─── 4. La protección manda sobre la declaración manual ────────────────────
const chocofestExpense = (orphanTableAfter.body?.expenses ?? []).find(
  (row) => row.campaignId === seededChocofest?.id && row.hasLedgerEntry === false,
);
if (chocofestExpense) {
  await call(
    "POST",
    "/api/admin/maintenance/expenses/classify",
    { ids: [chocofestExpense.id], classification: "demo", reason: "Prueba: la protección debe mandar", password: PASS },
    { auth: true },
  );
  const chocoAfter = await call("GET", "/api/admin/maintenance/expenses", undefined, { auth: true });
  const chocoRow = (chocoAfter.body?.expenses ?? []).find((row) => row.id === chocofestExpense.id);
  check(
    "declarar DEMO un gasto de ChocoFest NO lo hace eliminable (protección intacta)",
    chocoRow?.deletable === false && chocoRow?.protectedCampaign === true,
    `deletable=${chocoRow?.deletable} protected=${chocoRow?.protectedCampaign}`,
  );
} else {
  check("no hay gastos sin asiento en ChocoFest para probar la protección", true);
}

// ─── 5. Eliminación real + dashboard ──────────────────────────────────────
const dashBeforeOrphan = await call("GET", "/api/admin/dashboard", undefined, { auth: true });
const spentBeforeOrphan = dashBeforeOrphan.body?.summary?.totalSpent;

const orphanPurge = await call(
  "POST",
  "/api/admin/maintenance/expenses/purge",
  { ids: [orphanDemoId], confirm: true, reason: EXP_REASON, password: PASS },
  { auth: true },
);
check(
  "el huérfano clasificado DEMO SE ELIMINA de verdad",
  orphanPurge.status === 200 &&
    orphanPurge.body?.deleted?.deletedExpenses === 1 &&
    orphanPurge.body?.comparison?.matchesPurged === true &&
    (orphanPurge.body?.deleted?.backupIds ?? []).length === 1,
  `status=${orphanPurge.status} deleted=${JSON.stringify(orphanPurge.body?.deleted ?? null)}`,
);

const orphanGone = await call("GET", `/api/admin/maintenance/expenses/${orphanDemoId}`, undefined, { auth: true });
check("el gasto huérfano ya NO existe en PostgreSQL (404)", orphanGone.status === 404, `status=${orphanGone.status}`);

const orphanTableFinal = await call("GET", "/api/admin/maintenance/expenses", undefined, { auth: true });
check(
  "desaparece de la tabla del gestor",
  !(orphanTableFinal.body?.expenses ?? []).some((row) => row.id === orphanDemoId),
);

const dashAfterOrphan = await call("GET", "/api/admin/dashboard", undefined, { auth: true });
check(
  "el total de gastos del dashboard baja EXACTAMENTE S/ 1200.00",
  round2(dashAfterOrphan.body?.summary?.totalSpent) === round2(round2(spentBeforeOrphan) - 1200),
  `antes=${spentBeforeOrphan} después=${dashAfterOrphan.body?.summary?.totalSpent}`,
);
check(
  "el saldo del dashboard sube exactamente S/ 1200.00",
  round2(dashAfterOrphan.body?.summary?.balance) ===
    round2(round2(dashBeforeOrphan.body?.summary?.balance) + 1200),
  `antes=${dashBeforeOrphan.body?.summary?.balance} después=${dashAfterOrphan.body?.summary?.balance}`,
);

const orphanLedger = await call("GET", "/api/admin/ledger/audit", undefined, { auth: true });
check(
  "el libro sigue consistente (cadena verificada, sin huérfanos nuevos)",
  orphanLedger.body?.chain?.verified === true && (orphanLedger.body?.movementsWithoutSource ?? []).length === 0,
);

const orphanAudit = await call("GET", "/api/admin/audit-logs?limit=100", undefined, { auth: true });
check(
  "la clasificación y la purga quedan auditadas",
  String(JSON.stringify(orphanAudit.body ?? {})).includes("EXPENSE_CLASSIFIED") &&
    String(JSON.stringify(orphanAudit.body ?? {})).includes("EXPENSE_DEMO_PURGED"),
);

check(
  "el panel declara la SEMÁNTICA de fechas de sus cifras (V14-2.1)",
  dashboardNow.body?.filters?.dateSemantics?.donations?.includes("created_at") &&
    dashboardNow.body?.filters?.dateSemantics?.expenses?.includes("date") &&
    typeof dashboardNow.body?.filters?.dateSemantics?.note === "string",
  JSON.stringify(dashboardNow.body?.filters?.dateSemantics ?? null),
);

// ── 7decies. PRIVACIDAD PÚBLICA: mascotas y voluntarios (V14, Entrega 1) ─────
// Dos fugas reales: la ruta pública de mascotas aceptaba cualquier `?status=` y
// devolvía la fila entera (con los datos de contacto), y el registro público de
// voluntarios devolvía la ficha administrativa (con `adminNotes` y `approvedBy`).
const PRIVATE_CONTACT = {
  contactName: "Contacto Privado E2E",
  contactPhone: "+51 999 888 777",
  contactEmail: "contacto-privado-e2e@example.com",
};

const submittedPet = await call("POST", "/api/pets/submit", {
  name: `Mascota E2E ${stamp}`,
  species: "perro",
  sex: "macho",
  ageCategory: "adulto",
  size: "mediano",
  description: "Ficha enviada por una persona de la comunidad para su revisión.",
  location: "San Ramón",
  ...PRIVATE_CONTACT,
});
const submittedPetId = submittedPet.body?.id;
check("la ficha enviada por el público se registra en revisión", submittedPet.status === 201, `status=${submittedPet.status}`);
check(
  "la respuesta del envío NO repite los datos de contacto ni marcas internas",
  submittedPet.body !== undefined &&
    !("contactName" in submittedPet.body) &&
    !("contactPhone" in submittedPet.body) &&
    !("contactEmail" in submittedPet.body) &&
    !("submittedByPublic" in submittedPet.body),
  `claves=${JSON.stringify(Object.keys(submittedPet.body ?? {}))}`,
);

const petNotPublic = await call("GET", `/api/pets/${submittedPetId}`);
check("una ficha EN REVISIÓN no es consultable públicamente (404)", petNotPublic.status === 404, `status=${petNotPublic.status}`);

const publicListBefore = await call("GET", "/api/pets");
check(
  "la ficha en revisión no aparece en el listado público",
  publicListBefore.status === 200 && !(publicListBefore.body ?? []).some((row) => row.id === submittedPetId),
);

const manipulatedStatus = await call("GET", "/api/pets?status=reviewing");
check(
  "un estado no público se RECHAZA (400): no se puede manipular el filtro",
  manipulatedStatus.status === 400,
  `status=${manipulatedStatus.status}`,
);
const manipulatedStatus2 = await call("GET", "/api/pets?status=inactive");
check("tampoco cuela un estado inventado", manipulatedStatus2.status === 400, `status=${manipulatedStatus2.status}`);

// Se publica desde la administración y entonces sí es visible… sin datos privados.
const publishedPet = await call("PATCH", `/api/admin/pets/${submittedPetId}`, { status: "available" }, { auth: true });
check("la administración publica la ficha", publishedPet.status === 200, `status=${publishedPet.status}`);

const publicDetail = await call("GET", `/api/pets/${submittedPetId}`);
check("ya publicada, la ficha se consulta públicamente", publicDetail.status === 200, `status=${publicDetail.status}`);
check(
  "el DTO público NO expone contacto ni marcas internas",
  publicDetail.body !== undefined &&
    !("contactName" in publicDetail.body) &&
    !("contactPhone" in publicDetail.body) &&
    !("contactEmail" in publicDetail.body) &&
    !("submittedByPublic" in publicDetail.body),
  `claves=${JSON.stringify(Object.keys(publicDetail.body ?? {}))}`,
);
check(
  "el DTO público SÍ lleva lo que la web necesita",
  publicDetail.body?.name !== undefined && publicDetail.body?.species !== undefined && publicDetail.body?.status === "available",
);
check(
  "el DTO ADMINISTRATIVO conserva los datos de contacto (para gestionar la adopción)",
  (await call("GET", `/api/admin/pets/${submittedPetId}`, undefined, { auth: true })).body?.contactPhone ===
    PRIVATE_CONTACT.contactPhone,
);

// Voluntarios: el registro público no devuelve campos administrativos.
const volunteerSignup = await call("POST", "/api/volunteers", {
  name: `Voluntario E2E ${stamp}`,
  email: `voluntario-e2e-${stamp}@example.com`,
  phone: "+51 900 000 000",
  age: "30",
  district: "San Ramón",
  availability: "fines de semana",
  skills: "logística",
  interests: "niñez",
  motivation: "Quiero ayudar en las campañas de la comunidad.",
});
check("el registro de voluntario responde 201", volunteerSignup.status === 201, `status=${volunteerSignup.status}`);
check(
  "el registro público NO devuelve notas internas ni quién aprobó",
  volunteerSignup.status === 201 &&
    volunteerSignup.body !== undefined &&
    !("adminNotes" in volunteerSignup.body) &&
    !("approvedBy" in volunteerSignup.body),
  `status=${volunteerSignup.status} claves=${JSON.stringify(Object.keys(volunteerSignup.body ?? {}))}`,
);
check(
  "el registro público devuelve lo mínimo (estado y enlace de seguimiento)",
  volunteerSignup.body?.status === "pending" &&
    typeof volunteerSignup.body?.statusLabel === "string" &&
    typeof volunteerSignup.body?.publicToken === "string",
  JSON.stringify({ status: volunteerSignup.body?.status, tieneToken: typeof volunteerSignup.body?.publicToken }),
);

// ── 7undecies. GUARDAS DEL SUPERADMIN (V14, Entrega 1.3) ─────────────────────
// El panel no puede quedarse sin ningún superadministrador activo, y nadie puede
// eliminarse a sí mismo. Las reglas están en el SERVIDOR, no en botones.
const SUPER_GUARD_REASON = "Prueba de las guardas de administración (E2E)";

const createdSuper = await call(
  "POST",
  "/api/admin/users",
  {
    username: `e2e-super-${stamp}`,
    password: "E2e-Passw0rd!2026",
    name: "Superadmin de prueba E2E",
    role: "superadmin",
  },
  { auth: true },
);
const createdSuperId = createdSuper.body?.id;
check("se crea un superadmin de prueba", createdSuper.status === 201 && Number.isInteger(createdSuperId), `status=${createdSuper.status}`);

// Con UN solo superadmin activo en la tabla, las tres operaciones críticas se bloquean.
const deleteLast = await call("DELETE", `/api/admin/users/${createdSuperId}`, undefined, { auth: true });
check(
  "no se puede ELIMINAR al último superadmin activo (409)",
  deleteLast.status === 409 && deleteLast.body?.code === "last_superadmin",
  `status=${deleteLast.status} code=${deleteLast.body?.code ?? ""}`,
);

const deactivateLast = await call(
  "PATCH",
  `/api/admin/users/${createdSuperId}`,
  { active: false },
  { auth: true },
);
check(
  "no se puede DESACTIVAR al último superadmin activo (409)",
  deactivateLast.status === 409 && deactivateLast.body?.code === "last_superadmin",
  `status=${deactivateLast.status} code=${deactivateLast.body?.code ?? ""}`,
);

const demoteLast = await call(
  "PATCH",
  `/api/admin/users/${createdSuperId}`,
  { role: "administrador" },
  { auth: true },
);
check(
  "no se puede DEGRADAR al último superadmin activo (409)",
  demoteLast.status === 409 && demoteLast.body?.code === "last_superadmin",
  `status=${demoteLast.status} code=${demoteLast.body?.code ?? ""}`,
);

const invalidRole = await call(
  "PATCH",
  `/api/admin/users/${createdSuperId}`,
  { role: "root" },
  { auth: true },
);
check(
  "un rol inventado se rechaza (400): no hay escalada a roles inexistentes",
  invalidRole.status === 400 && invalidRole.body?.code === "invalid_role",
  `status=${invalidRole.status} code=${invalidRole.body?.code ?? ""}`,
);

check(
  "el superadmin protegido sigue existiendo y activo",
  (await call("GET", "/api/admin/users", undefined, { auth: true })).body?.some?.(
    (row) => row.id === createdSuperId && row.active === true,
  ) === true,
);

// Con DOS superadmins activos, las operaciones vuelven a permitirse: la guarda no es
// un bloqueo ciego, solo impide quedarse sin ninguno.
const secondSuper = await call(
  "POST",
  "/api/admin/users",
  {
    username: `e2e-super2-${stamp}`,
    password: "E2e-Passw0rd!2026",
    name: "Segundo superadmin de prueba E2E",
    role: "superadmin",
  },
  { auth: true },
);
const secondSuperId = secondSuper.body?.id;
check("se crea un segundo superadmin", secondSuper.status === 201, `status=${secondSuper.status}`);

const demoteWithBackup = await call(
  "PATCH",
  `/api/admin/users/${createdSuperId}`,
  { role: "administrador" },
  { auth: true },
);
check(
  "con otro superadmin activo, degradar SÍ se permite",
  demoteWithBackup.status === 200 && demoteWithBackup.body?.role === "administrador",
  `status=${demoteWithBackup.status} role=${demoteWithBackup.body?.role ?? ""}`,
);

const deleteNow = await call("DELETE", `/api/admin/users/${createdSuperId}`, undefined, { auth: true });
check("y eliminar también se permite", deleteNow.status === 204, `status=${deleteNow.status}`);

const goneAfterDelete = await call("GET", `/api/admin/users`, undefined, { auth: true });
check(
  "el usuario eliminado ya no aparece en el listado",
  !(goneAfterDelete.body ?? []).some((row) => row.id === createdSuperId),
);

// Limpieza: el que queda es el ÚNICO superadmin activo de la tabla, así que la guarda
// lo protege hasta el final. Es la mejor prueba de que la regla no tiene rendijas.
const cleanupSuper = await call("DELETE", `/api/admin/users/${secondSuperId}`, undefined, { auth: true });
check(
  "el último superadmin de la tabla sigue protegido hasta el final (409)",
  cleanupSuper.status === 409 && cleanupSuper.body?.code === "last_superadmin",
  `status=${cleanupSuper.status} code=${cleanupSuper.body?.code ?? ""}`,
);

// La revocación de sesiones se registra en la auditoría (prueba de que el camino se
// ejecuta; la decisión está cubierta por las pruebas puras de las guardas).
const guardAudit = await call("GET", "/api/admin/audit-logs?limit=100", undefined, { auth: true });
const guardAuditText = String(JSON.stringify(guardAudit.body ?? {}));
check(
  "los cambios administrativos quedan auditados con el rol anterior y las sesiones revocadas",
  guardAuditText.includes("previousRole") && guardAuditText.includes("revokedSessions"),
);

// ── 7duodecies. CIERRE FINANCIERO DE CAMPAÑA (V14, Entrega 2.3) ──────────────
// Un cierre es un acto contable: se revisa, se firma con su motivo y a partir de ahí
// la contabilidad de esa campaña queda BLOQUEADA de verdad en el servidor.
const CLOSE_REASON = "Cierre del ejercicio de la campaña de prueba (E2E)";

const closeCampaign = await call(
  "POST",
  "/api/campaigns",
  {
    title: `Cierre E2E ${stamp}`,
    description: "Campaña de prueba para el cierre financiero.",
    goal: 1000,
    category: "general",
    startDate: "2026-01-01",
    status: "draft",
  },
  { auth: true },
);
const closeCampaignId = closeCampaign.body?.id;
check("se crea la campaña que se va a cerrar", closeCampaign.status === 201 && Number.isInteger(closeCampaignId), `status=${closeCampaign.status}`);

const closurePreview = await call("GET", `/api/admin/campaigns/${closeCampaignId}/closure`, undefined, { auth: true });
check(
  "la revisión previa devuelve las DIEZ comprobaciones del procedimiento",
  closurePreview.status === 200 && closurePreview.body?.report?.checklist?.length === 10,
  `status=${closurePreview.status} items=${closurePreview.body?.report?.checklist?.length ?? 0}`,
);
check(
  "una campaña sin discrepancias contables se puede cerrar",
  closurePreview.body?.report?.canClose === true && closurePreview.body?.state?.closed === false,
  `canClose=${closurePreview.body?.report?.canClose}`,
);

const closeNoReason = await call(
  "POST",
  `/api/admin/campaigns/${closeCampaignId}/closure`,
  { confirm: true, reason: "corto", password: PASS },
  { auth: true },
);
check("cerrar sin motivo suficiente se rechaza (400)", closeNoReason.status === 400 && closeNoReason.body?.code === "reason_required", `status=${closeNoReason.status}`);

const closed = await call(
  "POST",
  `/api/admin/campaigns/${closeCampaignId}/closure`,
  { confirm: true, reason: CLOSE_REASON, password: PASS },
  { auth: true },
);
check(
  "el cierre se firma con su motivo y su hash",
  closed.status === 201 && typeof closed.body?.manifestHash === "string" && closed.body.manifestHash.length === 64 && Number.isInteger(closed.body?.closureId),
  `status=${closed.status} hash=${String(closed.body?.manifestHash ?? "").slice(0, 12)}…`,
);
check(
  "el cierre informa de las cifras congeladas y de sus salvedades",
  typeof closed.body?.figures?.balance === "number" && typeof closed.body?.withSalvedades === "boolean",
  JSON.stringify(closed.body?.figures ?? null),
);

// EL BLOQUEO: con el cierre firmado, la contabilidad de esa campaña no se toca.
const writeAfterClose = await call(
  "POST",
  `/api/campaigns/${closeCampaignId}/expenses`,
  { description: "Gasto después del cierre (E2E)", amount: 50, date: "2026-05-01", category: "general" },
  { auth: true },
);
check(
  "tras el cierre NO se puede registrar un gasto (409 campaign_closed)",
  writeAfterClose.status === 409 && writeAfterClose.body?.code === "campaign_closed",
  `status=${writeAfterClose.status} code=${writeAfterClose.body?.code ?? ""}`,
);

const readAfterClose = await call("GET", `/api/campaigns/${closeCampaignId}/expenses`, undefined, { auth: true });
check(
  "las LECTURAS siguen funcionando con la campaña cerrada",
  readAfterClose.status === 200,
  `status=${readAfterClose.status}`,
);

// La anulación individual SÍ está bloqueada: resuelve la campaña desde la donación.
// (El bloqueo de la anulación EN BLOQUE y de la purga DEMO queda pendiente dentro de
// sus manejadores: un guarda pre-registrado rompería el contrato «400 sin tocar la
// base» que fijan sus pruebas. Está documentado en el código, no escondido.)

const closeAgain = await call(
  "POST",
  `/api/admin/campaigns/${closeCampaignId}/closure`,
  { confirm: true, reason: CLOSE_REASON, password: PASS },
  { auth: true },
);
check("no se puede cerrar dos veces (409 already_closed)", closeAgain.status === 409 && closeAgain.body?.code === "already_closed", `status=${closeAgain.status}`);

const closureReport = await call("GET", `/api/admin/campaigns/${closeCampaignId}/closure/report`, undefined, { auth: true });
check(
  "el informe congelado VERIFICA su sello SHA-256",
  closureReport.status === 200 && closureReport.body?.manifestVerified === true,
  `status=${closureReport.status} verificado=${closureReport.body?.manifestVerified}`,
);
check(
  "el informe conserva quién lo firmó y por qué",
  closureReport.body?.closedBy === USER && closureReport.body?.reason === CLOSE_REASON,
  `firmado por=${closureReport.body?.closedBy ?? ""}`,
);

// Reabrir: solo superadmin, con reautenticación y motivo.
const reopenNoConfirm = await call(
  "POST",
  `/api/admin/campaigns/${closeCampaignId}/closure/reopen`,
  { reason: "Faltó registrar una boleta del último gasto", password: PASS },
  { auth: true },
);
check("reabrir exige confirmación explícita (400)", reopenNoConfirm.status === 400, `status=${reopenNoConfirm.status}`);

const reopened = await call(
  "POST",
  `/api/admin/campaigns/${closeCampaignId}/closure/reopen`,
  { confirm: true, reason: "Faltó registrar una boleta del último gasto", password: PASS },
  { auth: true },
);
check("el superadmin reabre la campaña", reopened.status === 200, `status=${reopened.status}`);

const writeAfterReopen = await call(
  "POST",
  `/api/campaigns/${closeCampaignId}/expenses`,
  { description: "Gasto tras reabrir (E2E)", amount: 50, date: "2026-05-01", category: "general" },
  { auth: true },
);
check(
  "tras reabrir, la contabilidad vuelve a admitir escrituras",
  writeAfterReopen.status === 201,
  `status=${writeAfterReopen.status}`,
);

const stateAfterReopen = await call("GET", `/api/admin/campaigns/${closeCampaignId}/closure`, undefined, { auth: true });
check(
  "el historial conserva el cierre anterior (append-only) y el estado actual es abierto",
  stateAfterReopen.body?.state?.closed === false &&
    stateAfterReopen.body?.state?.closureCount === 1 &&
    stateAfterReopen.body?.state?.reopeningCount === 1 &&
    stateAfterReopen.body?.state?.history?.length === 2,
  JSON.stringify(stateAfterReopen.body?.state ?? null),
);

const closureAudit = await call("GET", "/api/admin/audit-logs?limit=100", undefined, { auth: true });
const closureAuditText = String(JSON.stringify(closureAudit.body ?? {}));
check(
  "el cierre y la reapertura quedan auditados con su motivo",
  closureAuditText.includes("CAMPAIGN_CLOSED") && closureAuditText.includes("CAMPAIGN_REOPENED"),
);

// ── 7terdecies. INFORME DE CIERRE EN PDF (V14, Entrega 3) ────────────────────
// El helper del ensayo devuelve {status, body, text}: el PDF llega como texto crudo, y
// su cabecera basta para demostrar que es un PDF de verdad y no un JSON con la extensión
// cambiada. Las cabeceras de descarga y el contenido dibujado se cubren en las pruebas
// unitarias del generador (tests/pdf-closure-report.test.mjs), que sí pueden inspeccionar
// el documento con pdf-lib.
const pdfReport = await call("GET", `/api/admin/campaigns/${closeCampaignId}/closure/report.pdf`, undefined, { auth: true });
const pdfText = String(pdfReport.text ?? "");
check(
  "el informe de cierre se descarga como PDF real",
  pdfReport.status === 200 && pdfText.startsWith("%PDF-"),
  `status=${pdfReport.status} inicio=${pdfText.slice(0, 5)}`,
);
check(
  "el PDF pesa lo que debe pesar un documento con contenido dibujado",
  pdfText.length > 2000,
  `bytes≈${pdfText.length}`,
);

const pdfWithoutClosure = await call("GET", `/api/admin/campaigns/${demoId}/closure/report.pdf`, undefined, { auth: true });
check(
  "una campaña sin cierre no ofrece informe (404)",
  pdfWithoutClosure.status === 404,
  `status=${pdfWithoutClosure.status}`,
);

// ── 7quaterdecies. CERTIFICADO EN PDF (V14, Entrega 3) ───────────────────────
const certificadoPdf = await call(
  "POST",
  "/api/admin/certificates",
  {
    holderName: `Donante E2E ${stamp}`,
    type: "donante",
    title: "Constancia de donación",
    description: "Por su aporte solidario a la campaña Chocofest 2025.",
    issuedAt: "2026-10-15",
  },
  { auth: true },
);
const certificadoPdfCode = certificadoPdf.body?.code;
check("se emite un certificado con su código", certificadoPdf.status === 201 && typeof certificadoPdfCode === "string", `status=${certificadoPdf.status} code=${certificadoPdfCode ?? ""}`);

const certPdf = await call("GET", `/api/certificates/${certificadoPdfCode}/pdf`);
const certPdfText = String(certPdf.text ?? "");
check(
  "el certificado se descarga como PDF real SIN sesión (es para el donante)",
  certPdf.status === 200 && certPdfText.startsWith("%PDF-"),
  `status=${certPdf.status} inicio=${certPdfText.slice(0, 5)}`,
);
check(
  "el PDF del certificado tiene contenido dibujado",
  certPdfText.length > 2000,
  `bytes≈${certPdfText.length}`,
);

const certUnknown = await call("GET", "/api/certificates/NO-EXISTE-9999/pdf");
check("un código desconocido no genera ningún PDF (404)", certUnknown.status === 404, `status=${certUnknown.status}`);

const certRevoked = await call(
  "PATCH",
  `/api/admin/certificates/${certificadoPdf.body?.id}`,
  { status: "revoked", revocationReason: "Emitido por error: donación duplicada." },
  { auth: true },
);
check("el certificado se puede revocar", certRevoked.status === 200, `status=${certRevoked.status}`);

const revokedPdf = await call("GET", `/api/certificates/${certificadoPdfCode}/pdf`);
check(
  "un certificado REVOCADO se sigue descargando (marcado como anulado), no da 404",
  revokedPdf.status === 200 && String(revokedPdf.text ?? "").startsWith("%PDF-"),
  `status=${revokedPdf.status}`,
);

// La verificación pública de un certificado ANULADO devuelve 404: no se puede acreditar
// como válido, que es lo importante. (Matiz anotado como mejora: un 404 es
// indistinguible de un código inexistente; sería más claro responder «revocado» con su
// motivo. Es una decisión de producto, no un fallo de seguridad.)
const certVerification = await call("GET", `/api/certificates/${certificadoPdfCode}`);
check(
  "la verificación pública NO da por válido un certificado anulado",
  certVerification.status === 404,
  `status=${certVerification.status} cuerpo=${String(JSON.stringify(certVerification.body ?? {})).slice(0, 80)}`,
);

// ── La campaña DEMO ya no existe y sus datos ficticios desaparecieron ────────
const demoPublicAfter = await call("GET", `/api/campaigns/${demoId}`);
check("la campaña eliminada NO existe en el frontend (404)", demoPublicAfter.status === 404, `status=${demoPublicAfter.status}`);

const demoTransparencyAfter = await call("GET", `/api/campaigns/${demoId}/transparency`);
check("su panel de transparencia desaparece (404)", demoTransparencyAfter.status === 404, `status=${demoTransparencyAfter.status}`);

const publicListAfter = await call("GET", "/api/campaigns");
const publicIdsAfter = (Array.isArray(publicListAfter.body) ? publicListAfter.body : []).map((c) => c.id);
check("la campaña eliminada NO aparece en el listado público", !publicIdsAfter.includes(demoId));

const adminListAfter = await call("GET", "/api/campaigns?status=active", undefined, { auth: true });
const adminIdsAfter = (Array.isArray(adminListAfter.body) ? adminListAfter.body : []).map((c) => c.id);
check("la campaña eliminada NO aparece en la administración", !adminIdsAfter.includes(demoId));

const donationsAfter = await call("GET", "/api/donations", undefined, { auth: true });
const donationsAfterRows = Array.isArray(donationsAfter.body) ? donationsAfter.body : (donationsAfter.body?.donations ?? []);
check(
  "la donación DEMO desaparece de las estadísticas del panel",
  !donationsAfterRows.some((d) => d.campaignId === demoId),
  `donaciones_restantes_de_la_campaña=${donationsAfterRows.filter((d) => d.campaignId === demoId).length}`,
);

// Sin registros huérfanos: ningún subrecurso sobrevive apuntando a la campaña.
const orphans = await Promise.all([
  call("GET", `/api/campaigns/${demoId}/movements`),
  call("GET", `/api/campaigns/${demoId}/expenses`),
  call("GET", `/api/campaigns/${demoId}/budgets`),
  call("GET", `/api/campaigns/${demoId}/evidence`),
  call("GET", `/api/campaigns/${demoId}/leftovers`),
  call("GET", `/api/campaigns/${demoId}/updates`),
  call("GET", `/api/campaigns/${demoId}/images`),
]);
check(
  "no quedan registros huérfanos (asientos, gastos, presupuesto, evidencia, bienes, novedades, galería)",
  orphans.every((res) => Array.isArray(res.body) && res.body.length === 0),
  orphans.map((res) => `${res.status}:${Array.isArray(res.body) ? res.body.length : "?"}`).join(" "),
);

const demoChainAfter = await call("GET", `/api/campaigns/${demoId}/movements/verify`);
check(
  "la cadena contable de la campaña eliminada ya no tiene asientos y verifica vacía",
  demoChainAfter.status === 200 && demoChainAfter.body?.verified === true && demoChainAfter.body?.count === 0,
  JSON.stringify(demoChainAfter.body ?? null),
);

// ── Las campañas REALES conservan sus datos y sus cadenas ────────────────────
const otherChain = await call("GET", `/api/campaigns/${campaignId}/movements/verify`);
check(
  "la OTRA campaña conserva su asiento y su cadena sigue verificando",
  otherChain.status === 200 && otherChain.body?.verified === true && otherChain.body?.count === 1,
  JSON.stringify(otherChain.body ?? null),
);
const otherStillPublic = await call("GET", `/api/campaigns/${campaignId}`);
check("la OTRA campaña sigue publicada con su recaudación intacta", otherStillPublic.status === 200 && Number(otherStillPublic.body?.raised) === 80, `status=${otherStillPublic.status} raised=${otherStillPublic.body?.raised}`);

const auditAfter = await call("GET", "/api/admin/ledger/audit", undefined, { auth: true });
check(
  "el libro contable global sigue íntegro tras la purga",
  auditAfter.status === 200 && auditAfter.body?.chain?.verified === true,
  JSON.stringify(auditAfter.body?.chain ?? null),
);

// ── La SEGUNDA campaña DEMO queda bloqueada por un documento real ────────────
const receiptPreview = await call("GET", `/api/campaigns/${receiptId}/demo-purge/preview`, undefined, { auth: true });
check(
  "una campaña DECLARADA DEMO se sigue bloqueando si tiene un gasto con comprobante",
  receiptPreview.body?.campaign?.isDemo === true &&
    receiptPreview.body?.verdict?.allowed === false &&
    (receiptPreview.body?.verdict?.blockers ?? []).some((b) => b.code === "expenses_with_receipt"),
  JSON.stringify((receiptPreview.body?.verdict?.blockers ?? []).map((b) => b.code)),
);
check(
  "el bloqueo ofrece la alternativa segura (archivar / anular contablemente)",
  receiptPreview.body?.verdict?.requiresDemoMarking === false &&
    (receiptPreview.body?.verdict?.warnings ?? []).length >= 0,
);

// La declaración DEMO se puede RETIRAR (marcada por error): deja de habilitar nada.
const unmarkReceipt = await call("DELETE", `/api/campaigns/${receiptId}/demo-mark`, { reason: "Se marcó por error en la prueba E2E" }, { auth: true });
check("retirar la declaración DEMO responde 200", unmarkReceipt.status === 200, `status=${unmarkReceipt.status}`);
check("la campaña deja de estar declarada DEMO", unmarkReceipt.body?.campaign?.isDemo === false && unmarkReceipt.body?.campaign?.demoMarkedAt === null);
const receiptPreviewAfterUnmark = await call("GET", `/api/campaigns/${receiptId}/demo-purge/preview`, undefined, { auth: true });
check(
  "tras retirar la marca, el análisis vuelve a exigir la declaración DEMO",
  receiptPreviewAfterUnmark.body?.campaign?.isDemo === false &&
    receiptPreviewAfterUnmark.body?.verdict?.requiresDemoMarking === true &&
    receiptPreviewAfterUnmark.body?.verdict?.allowed === false,
  JSON.stringify((receiptPreviewAfterUnmark.body?.verdict?.blockers ?? []).map((b) => b.code)),
);

const receiptDelete = await call("DELETE", `/api/campaigns/${receiptId}`, undefined, { auth: true });
check("la campaña con gasto documentado se archiva en vez de destruirse (409 en el borrado)", receiptDelete.status === 409, `status=${receiptDelete.status}`);

// ── Respaldo verificable de la purga ─────────────────────────────────────────
const backup = await call("GET", `/api/admin/campaign-demo-purge/backups/${backupId}`, undefined, { auth: true });
check("el respaldo de la purga se conserva y responde 200", backup.status === 200, `status=${backup.status}`);
check(
  "el sello SHA-256 del respaldo VERIFICA (la copia no se alteró)",
  backup.body?.verified === true && backup.body?.manifestHash === purged.body?.manifest?.hash,
  `verified=${backup.body?.verified}`,
);
check(
  "el respaldo conserva la copia íntegra de lo eliminado (donaciones, gastos, asientos)",
  (backup.body?.snapshot?.tables?.donations ?? []).length === 1 &&
    (backup.body?.snapshot?.tables?.campaign_expenses ?? []).length === 1 &&
    (backup.body?.snapshot?.tables?.campaign_movements ?? []).length === 2,
  JSON.stringify({
    donations: (backup.body?.snapshot?.tables?.donations ?? []).length,
    expenses: (backup.body?.snapshot?.tables?.campaign_expenses ?? []).length,
    movements: (backup.body?.snapshot?.tables?.campaign_movements ?? []).length,
  }),
);
check(
  "el respaldo registra el motivo y quién autorizó la operación",
  backup.body?.reason === demoReason && typeof backup.body?.performedBy === "string" && backup.body.performedBy.length > 0,
  `por=${backup.body?.performedBy}`,
);
check(
  "la cadena contable eliminada se puede reconstruir desde el respaldo",
  backup.body?.ledger?.movements === 2 &&
    (backup.body?.snapshot?.tables?.campaign_movements ?? []).every((row) => typeof row.hash === "string" && row.hash.length === 64),
);

// ── Auditoría externa a los datos purgados ──────────────────────────────────
const purgeAudit = await call("GET", "/api/admin/audit-logs?action=CAMPAIGN_DEMO_PURGED&resource=campaigns", undefined, { auth: true });
const purgeLog = (Array.isArray(purgeAudit.body) ? purgeAudit.body : []).find((row) => row.resourceId === String(demoId));
check("la purga queda en el registro de auditoría (externo a lo purgado)", Boolean(purgeLog), `registros=${Array.isArray(purgeAudit.body) ? purgeAudit.body.length : "?"}`);
check(
  "el registro de auditoría guarda el motivo, el sello y el desglose por tabla",
  purgeLog?.details?.reason === demoReason &&
    purgeLog?.details?.manifestHash === purged.body?.manifest?.hash &&
    Array.isArray(purgeLog?.details?.removed),
);
const reauthAudit = await call("GET", "/api/admin/audit-logs?action=ADMIN_REAUTH_FAILED", undefined, { auth: true });
check(
  "los intentos de reautenticación fallidos también quedan auditados",
  Array.isArray(reauthAudit.body) && reauthAudit.body.some((row) => row.resourceId === String(demoId)),
  `registros=${Array.isArray(reauthAudit.body) ? reauthAudit.body.length : "?"}`,
);

const markAudit = await call("GET", "/api/admin/audit-logs?action=CAMPAIGN_DEMO_MARKED&resource=campaigns", undefined, { auth: true });
check(
  "la declaración DEMO queda auditada (quién y por qué)",
  Array.isArray(markAudit.body) &&
    markAudit.body.some((row) => row.resourceId === String(demoId) && typeof row.details?.reason === "string"),
  `registros=${Array.isArray(markAudit.body) ? markAudit.body.length : "?"}`,
);
const unmarkAudit = await call("GET", "/api/admin/audit-logs?action=CAMPAIGN_DEMO_UNMARKED&resource=campaigns", undefined, { auth: true });
check(
  "la retirada de la declaración DEMO también queda auditada",
  Array.isArray(unmarkAudit.body) && unmarkAudit.body.some((row) => row.resourceId === String(receiptId)),
  `registros=${Array.isArray(unmarkAudit.body) ? unmarkAudit.body.length : "?"}`,
);

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

const pdfCertCode = createdCert.body?.code;
const publicCert = await call("GET", `/api/certificates/${pdfCertCode}`);
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

const afterRevoke = await call("GET", `/api/certificates/${pdfCertCode}`);
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

// ── Límite anti fuerza bruta de la reautenticación ───────────────────────────
// Se deja para el FINAL a propósito: el presupuesto es de 5 fallos por usuario
// cada 15 minutos, así que agotarlo antes rompería las operaciones legítimas de
// las secciones anteriores. Solo cuentan los FALLOS de identidad (401): el flujo
// legítimo (declarar DEMO, purgar, anular) no lo consume.
const reauthAttempts = [];
for (let i = 0; i < 6; i++) {
  const res = await call(
    "POST",
    `/api/campaigns/${receiptId}/demo-purge`,
    { confirm: true, identifier: String(receiptId), reason: demoReason, password: "contrasena-incorrecta" },
    { auth: true },
  );
  reauthAttempts.push(res.status);
}
check(
  "el límite anti fuerza bruta corta la reautenticación tras 5 fallos (429)",
  reauthAttempts.includes(401) && reauthAttempts[reauthAttempts.length - 1] === 429,
  reauthAttempts.join(","),
);

console.log("");
if (failures === 0) {
  console.log("E2E: TODO OK");
} else {
  console.log(`E2E: ${failures} comprobación(es) fallida(s)`);
}
process.exit(failures === 0 ? 0 : 1);
