# Clubs, club upload link and shared inbox: design

Date: 2026-11-24, sixth version. Status: approved by the owner on 2026-11-24. Nothing is built.

## Intent

Every target at the club range has its own laptop, shared by whoever shoots there. Shooters should only hand over their
SIUS and SCATT files, with no sign-in on that laptop. Joining the files into trainings happens later, by the shooter or
by their coach. The owner also wants to put a .prnx from a laptop into the inbox.

Same app, same database, same storage bucket, one public page.

## Goals

- A shooter belongs to a club they choose themselves: one already entered, or a new one. Coaches and admins can too.
- One link per club, opened on any number of laptops: pick your name among the club's shooters, drop files, send.
- Works for a shooter with no coach.
- One inbox page: a shooter sees their own files; a coach also sees those of all linked shooters, as with trainings.
- Files that arrive from different computers (SIUS from the range laptop, SCATT from a personal one) still pair up.
- The inbox takes `.prnx`, and files dropped while signed in.

## Non-goals

- Knowing which target a file came from. Watching the SIUS export folder (approach C). PINs.
- Trainings saved without a person's check. HTML in the inbox (it carries no shot directions).
- Shooters without an account. More than one club per person. Club pages, rankings or any sharing of results by club.

## Anti-goals

- A range laptop, or anyone who finds the link, can read or download anybody's data.
- Being in the same club shows anyone's trainings or files. The only thing shared is the name.
- A file silently ends up in the wrong shooter's diary.

## Approaches

- **A. Name list on a public page behind a secret link (owner's pick, 2026-11-24).** Least work for everyone; a wrong
  name is possible and is corrected in the inbox.
- B. The same with a personal PIN: fewer mistakes, but PINs are forgotten and slow.
- C. A program on each laptop that sends new files: installing and updating it everywhere, and someone must work out whose
  each SIUS file is (the reports carry no name).

Link: **one per club (owner's pick)** rather than one per laptop. The target does not matter for a training. The cost:
switching off one laptop means making a new link and opening it again on the others.

Who is on the list: **everyone in the club (owner's pick)**, rather than people added to a link one by one. The cost: an
unwanted name stays on the list until that person changes their own club.

## How it works

**Choosing a club.** Nalog has a "Klub" field: type to search the clubs already entered and pick one; when none matches,
"Napravi klub <name>". Names are compared without case, extra spaces or Serbian diacritics, so "Čačak" and "cacak" are the
same club and no duplicate is made. The field can be left empty. Under it: "Vaše ime vide svi koji imaju link kluba."
Changing or clearing the club takes the name off the list at once; files already sent stay with the shooter.
A coach's access to trainings and files still comes only from the link with the shooter, never from the club.

Only the person themselves sets, changes or clears their club. Nobody adds or removes anyone else: not the club's maker, a
coach or an admin (owner, 2026-11-24). A disabled account is not on the list, as it cannot do anything else either.

**An empty club disappears after 7 days** (owner, 2026-11-24: "after a few days"; 7 is my call). Until then it can still be
chosen, its link still works with an empty list, and anyone who joins keeps it with the same link. After that the club and
its link are deleted, and laptops that had the link show "Ovaj računar nije povezan". Making it again gives a new link.

**The link.** Every club has one, made with the club. Any member copies it in Nalog. Whoever made the club, or an admin, can
replace it (the old one stops at once) or rename the club. A maker who has left the club,
or whose account is gone, no longer can; then the admin does.

**On a laptop.** `https://zeroin.pro/ubaci#<token>` once; afterwards `zeroin.pro/ubaci`. The token follows `#`, so it never
reaches server logs; the page keeps it in local storage and removes it from the address. Without it the page shows only
"Ovaj računar nije povezan". Without a secret anyone on the internet could read the names and fill the inbox.

**Sending.** The page checks each file with the existing parsers and shows what it found (SIUS: discipline, total, time;
SCATT: shots, time) before "Pošalji". After sending, the name and files are cleared, so the next shooter starts clean.
The same file sent twice for one shooter is reported as already sent.

**SCATT on a personal laptop.** The same link there, or signed in: the inbox page has its own drop area. On a phone the
existing Shortcut. All of them end in the same shooter's inbox.

**Inbox ("Sanduče", the page that is "Sa telefona" today; its address stays, the Shortcut points there).** Files by day, for
a coach by shooter and day, with SIUS + SCATT pairs proposed: SIUS time within or shortly after the SCATT recording, and
SCATT has at least as many shots. Phone files have no such details and pair by the day they arrived. The pair can be
changed, opened in the existing form with both files loaded, or added to a saved session. Files can be discarded or passed
to another shooter. A used file leaves the inbox when the session is saved, as today; whoever saves first takes it.
The new-training and session-data pages take inbox files only for one's own account today; they learn to take a linked
shooter's, for a coach.

## Data and access (migration 0032)

- `clubs`: name, normalized name (unique), created_by (null when that account is gone). Active accounts read id and name.
  New ones are made through a function that also puts the maker in the club, so a club is never empty from the start. No
  limit on how many a person makes (owner, 2026-11-24).
- `clubs.empty_since`: kept by the existing daily cron, which marks clubs with no profile, unmarks those somebody joined, and
  deletes the ones marked 7 days ago that still have none (so 7 to 8 days). Any profile counts as a member, coaches and
  disabled accounts too. (Plan, 2026-11-24: the cron alone, since two people leaving at once could slip past a trigger.)
- `club_links`: club, token, created, last used. Read only by active members of the club. The token is kept readable because
  it has to be opened on many laptops; it only allows sending and reading the names.
- `profiles.club_id`: nullable; a person sets only their own, and nobody else can.
  Reading other people's profiles stays as it is.
- `inbox_files`: new kind `sius_prnx`; `sha256`, unique per shooter when set; `meta jsonb` with what the page found (for
  display and pairing only, never trusted as a result).
- Policies: the shooter or `coach_of(user_id)` may select and delete. Storage policies look the object up through its
  `inbox_files` row instead of the folder name, so passing a file on also moves who can read it.
- `pass_inbox_file(file, shooter)`: the caller is the file's shooter or their coach, and the new shooter is in the
  same club as the old one, or is coached by the caller.
- A club, its maker and its members have no right to see a shooter's files; only the shooter and their coach see them.
- service_role gets only the columns the routes use (see 0026).

## Server

- `/api/inbox/link` (under `/api/inbox`, which the proxy already leaves out; `/ubaci` is added to the public routes), bearer
  token: GET returns the club's name and the ids and display names of its active shooters, nothing
  else; POST starts an upload for one of them and
  returns a signed upload URL for a path the server chose; a second call confirms it: the server checks the stored bytes'
  kind and size, then inserts the row. That the shooter is still in the club is checked again at confirm.
- Uploads go straight to storage because a Vercel function takes request bodies only up to about 4.5 MB (my call; the
  existing phone route stays as it is). The signed-in drop area uses the same steps, authorized by the session.
- The existing cap of 50 waiting files per shooter applies. Objects never confirmed are removed by the daily cron.
- `waitingInbox` must filter by shooter explicitly: today it relies on row-level security, which will now also show a
  coach their shooters' files.

## Left to the builder

Layout, exact pairing window, wording. Tests: token and club checks, choosing, making and leaving a club, an empty club kept for
7 days and then deleted with its link, duplicate names,
passing a file on, no reads by other club members, pairing, the form loading two inbox files for a coach.

## Confirmed and assumed

1. Range laptops have internet (owner, 2026-11-24).
2. SCATT may be on a personal laptop or a phone (owner, 2026-11-24).
3. A shooter chooses any entered club or makes one, with no approval and no removal by others (owner, 2026-11-24). Anyone with an approved
   account can therefore join a club and get its link; accounts are approved by the admin.
4. Assumed: every shooter has an account.
