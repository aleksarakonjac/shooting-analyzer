-- The phone inbox also takes pulse files (TCX), as a backup to the pulse import from the health service.
alter table inbox_files add column kind text not null default 'scatt' check (kind in ('scatt', 'tcx'));
