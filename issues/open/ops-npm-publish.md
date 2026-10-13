# Publish the CLI to npm

## Why this matters
Docs, `/agents.md` and the landing page show `npx mailmint …`, which 404s until the package is published.
Today it only works from a checkout or the `~/.local/bin/mailmint` symlink.

## What to change
Decide the final name first (the project name is provisional). Then `npm publish` from `cli/` and check that
`npx <name> --help` works on a clean machine.

## Acceptance
`npx <name> wait <share link> --code` works with no other setup.
