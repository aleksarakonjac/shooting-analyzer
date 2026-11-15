-- The phone inbox also takes SIUS result reports as PDF (a range hands out the printout as a file).
alter table inbox_files drop constraint inbox_files_kind_check;
alter table inbox_files add constraint inbox_files_kind_check check (kind in ('scatt', 'tcx', 'sius_pdf'));
