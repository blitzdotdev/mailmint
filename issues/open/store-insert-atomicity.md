# Make message insert + inbox counters atomic; clean up orphaned R2 objects

## Why this matters
- `insertMessage` runs the INSERT and the inbox `message_count`/`last_message_at`/expiry UPDATE as two statements;
  a failure between them leaves counts slightly off (cosmetic).
- `deleteInbox` deletes the row first, then R2 objects; if R2 deletion fails the objects are orphaned under
  `raw/<id>/` and `att/<id>/` (ids are never reused, nothing reads them).
- Mail being stored while its inbox is deleted can leave a raw `.eml` behind the same way.

## What to change
Batch the two statements (D1 batch is one transaction) with a `changes()`-guarded UPDATE; add a weekly cron step
that lists R2 prefixes and deletes those whose inbox id no longer exists.

## Acceptance
Unit/harness test for the batch; the sweep deletes a planted orphan prefix.
