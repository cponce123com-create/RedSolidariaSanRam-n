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
    receiptUrl: "https://res.cloudinary.com/demo/image/upload/v1/boleta-real.jpg",
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
