-- Finding an earlier import of the same file (by content hash) across a shooter's trainings.
create index source_files_sha256 on source_files (sha256);
