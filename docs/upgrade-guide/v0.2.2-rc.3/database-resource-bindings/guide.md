---
kind: upgrade-guide
description: "Native PostgreSQL and MySQL requests refuse production path resources whose endpoint identity has not been configured."
---

# Associate native database resources

English | [中文](guide.zh.md)

## Change

The guarded PostgreSQL and MySQL providers use native database scope. An enabled production resource with only path selectors now refuses database requests until the owner supplies an endpoint association or explicit network aliases. Omitting associations on another binding does not exempt that request. Ordinary endpoint checks do not establish native database coverage.

Optional `databases[].resourceIds` contains central server or database UUIDs. A database resource applies to the configured hostname, port and startup database; a server resource applies across databases on that endpoint. Existing selectors remain effective. Missing or domain references refuse provider activation, and deleting a referenced resource stops later work. Production protection takes priority over test exceptions.

These are owner associations, not discovery of remote data files. TLS, protocol identity, roles, test opt-ins and table constraints remain required. Defaults stay disabled or empty; persistent rules and audit fields are unchanged.

## Migration

1. Review active production resources in the owner settings. For each path-only resource used by a native database provider, identify its existing central UUID and actual endpoint. Keep server-wide and database-specific policy separate.
2. Add `resourceIds: ["<server UUID>", "<database UUID>"]` to the relevant PostgreSQL or MySQL entry in `cordis.yml` or its profile patch. Include only applicable resources. Existing explicit network aliases remain usable. Restart the affected provider and resolve invalid references before sending work.
3. Custom native database executors must pass `database` scope to `targetProtection.checkConnection`, together with their validated owner associations. An unresolved production path must not become an ordinary endpoint check or an automatic retry.
4. Verify disposable full, audit and test resources: full protection sends no connection, audit permits fixed read-only queries and refuses writes, and test writes require their existing opt-ins and a commit acknowledgement. See the [PostgreSQL](../../../../packages/guard/target-protection/tests/postgres.spec.ts), [MySQL](../../../../packages/guard/target-protection/tests/mysql.spec.ts) and [resource-policy](../../../../packages/guard/target-protection/tests/database-resources.spec.ts) checks.
