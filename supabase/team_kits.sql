-- Εμφάνιση (φανέλα) ανά ομάδα — για εικόνες όπως Team of the Week
alter table teams add column if not exists kit_primary   text;
alter table teams add column if not exists kit_secondary text;
alter table teams add column if not exists kit_pattern   text default 'solid';  -- solid | stripes | halves
