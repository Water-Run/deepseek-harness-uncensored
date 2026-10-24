---
description: "External and internal asset discovery: subdomains, DNS, ports, HTTP fingerprinting, cloud buckets, certificate transparency, and technology identification, with commands that write normalized output into the case file."
whenToUse: "Starting or extending reconnaissance on a named domain, IP range, or internal network."
---

# Reconnaissance playbook

Recon is inventory plus evidence. Produce a normalized asset list you can diff, not a pile of tool output.

## 1. Passive collection first

Certificate transparency and DNS datasets find assets without touching the target:

```bash
# subdomains
subfinder -d DOMAIN -all -silent -o subs.subfinder.txt
amass enum -passive -d DOMAIN -o subs.amass.txt
curl -s "https://crt.sh/?q=%25.DOMAIN&output=json" | jq -r '.[].name_value' | tr ',' '\n' | sort -u > subs.crt.txt

# merge and resolve
sort -u subs.*.txt | dnsx -silent -a -resp -o resolved.txt
```

Other passive sources worth checking by hand: `chaos` datasets, VirusTotal domain relations, SecurityTrails, Shodan/FOFA/Quake/Censys, GitHub code search for `DOMAIN`, Wayback CDX (`gau DOMAIN`, `waymore -i DOMAIN`), and mobile-app strings for staging hosts.

## 2. Active probing

```bash
# HTTP surface: status, title, tech, TLS, CDN
httpx -l resolved.txt -sc -title -tech-detect -cdn -tls-grab -json -o http.jsonl

# ports on reachable hosts (fast pass, then deep pass)
naabu -l resolved.txt -top-ports 1000 -silent -o ports.txt
nmap -sV -sC -Pn -p- --min-rate 2000 -oA nmap-full TARGET

# crawl for parameters and endpoints
katana -list alive.txt -jc -kf all -d 3 -o urls.txt
gau DOMAIN | anew urls.txt
```

Fingerprint with `whatweb`, `wappalyzer`, favicon hashes (murmur3), response headers, error pages, and cookie names. Note the exact version strings; version claims are hypotheses until a response proves behavior.

## 3. Internal discovery

```bash
# host discovery and fast service sweep
nmap -sn 10.0.0.0/24
nmap -sS -Pn -n -p 21,22,80,135,139,389,443,445,1433,3306,3389,5985,8080 --open 10.0.0.0/24 -oG sweep.txt

# SMB / LDAP / WinRM first look
nxc smb 10.0.0.0/24 --shares --users --pass-pol
nxc ldap DC_IP -u '' -p '' --query "objectClass=computer"
```

After the first valid credential, expand: shares, sessions, delegated rights, and reachable management ports.

## 4. Cloud and edge assets

- Bucket names: `COMPANY-{dev,prod,backup,assets,static}`, `COMPANY-{env}-{region}` across S3, Azure Blob, GCS. Test read/list, never destructive writes.
- Takeover candidates: dangling CNAMEs to unclaimed SaaS, expired S3 websites, unclaimed Azure traffic-manager endpoints, GitHub Pages leftovers.
- Secret exposure: public repos, JS bundles, source maps, `.env`, `/.git/`, CI logs.

## 5. Normalize and hand off

One line per asset: `host, ip, port, protocol, service, version, url, auth_seen, source`. Store the file in the case directory and register the interesting entries as targets:

```bash
node ../../shared/scripts/casefile.mjs target add --slug TARGET-SLUG --value URL --label LABEL --note "tech, auth surface"
```

## Pitfalls

- Load balancers and CDNs hide origin hosts. Check `Host` header behavior, direct-IP responses, and historical DNS before declaring an origin.
- Wildcard DNS inflates subdomain lists; drop hosts whose resolved IPs equal the wildcard answer.
- A 200 response is not proof of a live application: capture the title, body length, and a stable hash.
- Do not brute-force directories before you know the app's routing style; API-first targets waste wordlists.
