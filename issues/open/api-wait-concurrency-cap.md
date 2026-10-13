# Cap concurrent waits per inbox

## Why this matters
A valid token can open any number of 300 s long-polls; each holds a pending promise in that inbox's InboxSignal DO
and a Worker request. Not exploitable without a credential, but an agent bug (retry loop without awaiting) could pile
them up.

## What to change
Track waiter count in InboxSignal; above ~20, return immediately with a `rate_limited`-style flag the API turns into 429.

## Acceptance
Harness scenario: 25 concurrent waits → 20 park, 5 get 429; all parked ones wake on the next mail.
