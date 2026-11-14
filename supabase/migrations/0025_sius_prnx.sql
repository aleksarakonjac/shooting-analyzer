-- SIUS print-preview reports (.prnx) are kept as source files like the CSV and PDF reports.
alter type source_kind add value if not exists 'sius_prnx';
