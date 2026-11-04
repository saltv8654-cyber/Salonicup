-- billi: a source can be a whole provider site (e.g. dei.gr); Billi finds its price pages itself.
-- Safe to run more than once.
alter table tariff_data_sources drop constraint if exists tariff_data_sources_kind_check;
alter table tariff_data_sources add constraint tariff_data_sources_kind_check check (kind in ('auto', 'html', 'pdf', 'site'));
alter table tariff_data_sources add column if not exists discovered_from uuid references tariff_data_sources (id) on delete set null;
