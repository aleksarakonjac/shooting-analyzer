-- A free-text comment on one shot, written while reviewing a session. Whoever can see the shot (the shooter and
-- the linked coaches) can read and change it through the existing shots policy; nothing else needs granting.
alter table shots add column comment text check (comment is null or char_length(comment) <= 2000);
