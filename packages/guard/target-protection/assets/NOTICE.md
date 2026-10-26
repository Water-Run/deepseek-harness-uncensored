# DB-IP country data attribution

IP Geolocation by [DB-IP](https://db-ip.com).

The bundled `dbip-country-lite-2026-10.mmdb.gz` is the unmodified October 2026 IP to Country Lite database. It is distributed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/), independently of this package's code license. The data provider's [download page](https://db-ip.com/db/download/ip-to-country-lite) describes its reduced coverage and accuracy. Country results are estimates, not proof of a server's physical location or ownership.

Source: https://download.db-ip.com/free/dbip-country-lite-2026-10.mmdb.gz

Embedded build time: 2026-10-01 01:36:12 UTC. Original uncompressed SHA-1 published by DB-IP: `e515b63075ad48847f9c4332b724742e8ba15b0e`. The downloaded and decompressed files were checked against that value. SHA-256 values are pinned in `src/country-source.ts` for subsequent integrity checks.

A web composition displaying or using these results must show the linked attribution above on the relevant page. The product UI integration remains part of the target-protection delivery plan; this backend is not enabled in the default product yet.
