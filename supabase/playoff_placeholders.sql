-- ── Playoff placeholders ──
-- Επιτρέπει τη δημιουργία αγώνων playoff (ημιτελικός/τελικός) ΠΡΙΝ κριθούν οι ομάδες:
-- ορίζεις ημερομηνία/γήπεδο τώρα, με «εκκρεμεί» αντίπαλο (π.χ. «Νικητής Ημιτελικού Α»),
-- και συμπληρώνεις την ομάδα αργότερα.

-- Οι ομάδες γίνονται προαιρετικές (μένουν null όσο εκκρεμεί ο αντίπαλος)
alter table matches alter column team_a drop not null;
alter table matches alter column team_b drop not null;

-- Κείμενο placeholder ανά πλευρά (εμφανίζεται όταν δεν έχει οριστεί ομάδα)
alter table matches add column if not exists placeholder_a text;
alter table matches add column if not exists placeholder_b text;

notify pgrst, 'reload schema';
