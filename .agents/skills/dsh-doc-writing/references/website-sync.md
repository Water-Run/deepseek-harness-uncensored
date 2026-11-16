# Offline documentation projection

## Summary

DSHU ships offline documentation in the CLI and Desktop runtime. It does not ship the VitePress application or website deployment workflows. This reference covers the current selection manifest, staging operation and checks; upstream website design remains a versioned reference.

## Ownership and selection

[Repository Markdown](../../../../docs/AGENTS.md) is the editable source. Keep bilingual siblings and their pairing record together; do not add locale directories or maintain a second copy of a page.

[website/docs.ts](../../../../website/docs.ts) owns the page list and route metadata. [scripts/stage-dsh-docs.ts](../../../../scripts/stage-dsh-docs.ts) reads each page's `source` and `sourceAliases`, stages selected documentation and assets into `apps/cli/docs`, and includes upgrade guides independently. Persistence-history directories, translation-maintainer material and pairing records are excluded from the installed copy. The stager generates the upgrade-guide index from guide metadata.

When editing a selected page, update its canonical source and counterpart. When changing selection, edit the manifest in the same change. Repair inbound links when moving a maintained page; frozen historical material follows its owning policy. Never edit the staged copy as a source or restore the removed website merely to repair a link.

## Stage and verify

From the repository root, stage the current working-tree documentation with `pnpm exec tsx scripts/stage-dsh-docs.ts`. The CLI package's prepack lifecycle uses the same implementation, so an installed package receives the checkout's selected content. Inspect the generated index and the affected page under `apps/cli/docs`.

Run `pnpm exec vitest run scripts/stage-dsh-docs.spec.ts` for selection, repeat staging, cleanup and invalid-guide behavior. Run the named bilingual pairing check, `pnpm run test:docs` and `pnpm run doc-sync` for the edited entry path, plus link and metadata checks appropriate to that source. A staging or test failure blocks claiming that the new page ships correctly.

Staging documentation does not publish a website, create a Release or install an application. Packaging and installation use their own qualification records.

## Upstream reference

For work explicitly targeting the upstream website, read its [pinned projector](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/scripts/project-doc-site.ts) and [VitePress configuration](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/website/.vitepress/config.ts) in that checkout. These files and their deployment commands are not local DSHU components.
