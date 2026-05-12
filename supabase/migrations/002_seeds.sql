-- ============================================================================
-- CRM Cyril — Seeds initiaux
-- 18 tournées (basées sur les onglets Excel de Cyril) + paramètres par défaut
-- Pas de zones macro : logique métier basée sur les tournées géographiques
-- ============================================================================

-- ============================================================================
-- 18 TOURNÉES
-- frequence_semaines : 2 = hot (2 visites / 4 sem), 4 = standard (1 visite / 4 sem)
-- ============================================================================

INSERT INTO tournee (nom, frequence_semaines) VALUES
  ('Anzère - Ayent',                              4),
  ('Ardon - Vétroz',                              4),
  ('Conthey - Aproz',                             4),
  ('Crans-Montana - Chermignon',                  2),
  ('Fully - Saxon - Charrat',                     4),
  ('Sierre - Grône - Bramois - Vercorin',         2),
  ('Sion - Savièse',                              2),
  ('Saillon - Leytron - Riddes - Tzoumaz',        4),
  ('Ovronnaz',                                    4),
  ('B. St-Pierre - Champex - Liddes - Bovernier', 4),
  ('Martigny - Finhaut - Ravoire - Trient',       2),
  ('Chamoson',                                    4),
  ('Nendaz',                                      4),
  ('Nax - Mase',                                  4),
  ('Châble - Verbier - Vollèges',                 2),
  ('Val d''Anniviers - Chandolin - Zinal',        4),
  ('Orsières',                                    4),
  ('Hérémence - Thyon',                           4);

-- ============================================================================
-- PARAMÈTRES PAR DÉFAUT
-- ============================================================================

INSERT INTO parametre (cle, valeur) VALUES
  ('objectif_visites_clients', '6'),
  ('objectif_prospects',       '2'),
  ('vapid_subscriptions',      '[]');