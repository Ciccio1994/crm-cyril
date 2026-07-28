-- ============================================================================
-- CRM Cyril — Migration 006 : Storage bucket `offres`
-- ⚠️  À exécuter dans Supabase Dashboard > SQL Editor
-- ============================================================================

-- Bucket public en lecture (les PDF sont accessibles via URL sans auth)
INSERT INTO storage.buckets (id, name, public)
VALUES ('offres', 'offres', true)
ON CONFLICT (id) DO NOTHING;

-- Écriture réservée aux utilisateurs authentifiés
DROP POLICY IF EXISTS "offres_upload_authenticated" ON storage.objects;
CREATE POLICY "offres_upload_authenticated"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'offres');

DROP POLICY IF EXISTS "offres_update_authenticated" ON storage.objects;
CREATE POLICY "offres_update_authenticated"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'offres');

DROP POLICY IF EXISTS "offres_delete_authenticated" ON storage.objects;
CREATE POLICY "offres_delete_authenticated"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'offres');

-- Lecture publique
DROP POLICY IF EXISTS "offres_read_public" ON storage.objects;
CREATE POLICY "offres_read_public"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'offres');
