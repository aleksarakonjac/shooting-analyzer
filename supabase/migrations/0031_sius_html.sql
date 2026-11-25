-- SIUS summary reports exported as HTML are kept as source files like the CSV, PDF and print-preview reports.
alter type source_kind add value if not exists 'sius_html';
