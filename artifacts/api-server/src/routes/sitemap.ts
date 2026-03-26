import { Router } from "express";
import { db } from "@workspace/db";
import { campaignsTable, newsTable, petsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

const BASE_URL = "https://redsolidariasanramon.org";

function loc(path: string) {
  return `<url><loc>${BASE_URL}${path}</loc></url>`;
}

router.get("/sitemap.xml", async (_req, res) => {
  const [allCampaigns, allNews, allPets] = await Promise.all([
    db.select({ id: campaignsTable.id }).from(campaignsTable),
    db.select({ id: newsTable.id }).from(newsTable),
    db.select({ id: petsTable.id }).from(petsTable).where(eq(petsTable.status, "disponible")),
  ]);

  const staticPaths = ["/", "/nosotros", "/campanas", "/noticias", "/contacto", "/voluntario", "/adopciones", "/bienestar-animal", "/casos-urgentes", "/aliados", "/como-ayudar", "/faq"];
  const campaignPaths = allCampaigns.map((c) => `/campanas/${c.id}`);
  const newsPaths = allNews.map((n) => `/noticias/${n.id}`);
  const petPaths = allPets.map((p) => `/adopciones/${p.id}`);

  const all = [...staticPaths, ...campaignPaths, ...newsPaths, ...petPaths];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(loc).join("\n")}
</urlset>`;

  res.setHeader("Content-Type", "application/xml");
  res.send(xml);
});

// robots.txt
router.get("/robots.txt", (_req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: ${BASE_URL}/sitemap.xml\n`);
});

export default router;
