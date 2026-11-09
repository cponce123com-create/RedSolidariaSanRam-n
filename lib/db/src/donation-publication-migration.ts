/** Additive only: existing donations and their private proofs remain intact. */
export const donationPublicationMigrationSql = String.raw`
  ALTER TABLE donations ADD COLUMN IF NOT EXISTS publication_image_url text;
  ALTER TABLE donations ADD COLUMN IF NOT EXISTS publication_image_public_id text;
  ALTER TABLE donations ADD COLUMN IF NOT EXISTS publication_template text NOT NULL DEFAULT 'agradecimiento';
`;
