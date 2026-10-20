import { alliesTable, communityReportsTable } from "@workspace/db/schema";
import type { Ally, CommunityReport } from "@workspace/db/schema";

/**
 * Proyecciones públicas de tablas que mezclan datos operativos y datos
 * personales. Se declaran por INCLUSIÓN para que añadir una columna a la tabla
 * no la exponga automáticamente en Internet.
 *
 * - `allies`: el contacto interno (nombre, correo y teléfono) solo lo necesita
 *   el panel de administración. La web pública muestra la ficha del aliado.
 * - `community_reports`: el nombre, teléfono, correo y las notas internas del
 *   reportante NUNCA deben salir por `/reports/urgent` ni `/reports/featured`.
 *   Un reporte anónimo tampoco debe revelar esos campos por accidente.
 */
export const PUBLIC_ALLY_COLUMNS = {
  id: alliesTable.id,
  name: alliesTable.name,
  type: alliesTable.type,
  logo: alliesTable.logo,
  description: alliesTable.description,
  website: alliesTable.website,
  active: alliesTable.active,
  featured: alliesTable.featured,
} as const;

export const PUBLIC_REPORT_COLUMNS = {
  id: communityReportsTable.id,
  type: communityReportsTable.type,
  title: communityReportsTable.title,
  description: communityReportsTable.description,
  location: communityReportsTable.location,
  urgency: communityReportsTable.urgency,
  photos: communityReportsTable.photos,
  isAnonymous: communityReportsTable.isAnonymous,
  campaignId: communityReportsTable.campaignId,
  featuredOnHome: communityReportsTable.featuredOnHome,
  createdAt: communityReportsTable.createdAt,
} as const;

export type PublicAlly = Pick<Ally, keyof typeof PUBLIC_ALLY_COLUMNS>;
export type PublicCommunityReport = Pick<CommunityReport, keyof typeof PUBLIC_REPORT_COLUMNS>;
