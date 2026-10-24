# Crypto identification reference

## Constant fingerprints

| Constant (hex, first bytes) | Algorithm | Notes |
| --- | --- | --- |
| `63 7c 77 7b f2 6b 6f c5` | AES S-box | Search the full 256-byte table |
| `52 09 6a d5 30 36 a5 38` | AES inverse S-box | Decryption table |
| `c6 63 63 a6` | AES MixColumns coefficients | Often used inline |
| `6a 09 e6 67 bb 67 ae 85` | SHA-256 initial state | Big-endian H0..H3 |
| `67 e6 09 6a 85 ae 67 bb` | SHA-256 initial state, little-endian | Common in optimized code |
| `01 23 45 67 89 ab cd ef` | MD5/SHA-1 loading or test vector | Weak signal alone |
| `ed b8 83 20 5a 8d f6 cb` | SHA-512 initial state (first 8 bytes) | 64-bit constants |
| `00 00 00 00 01 00 00 00` | CRC32 table start | Polynomial 0xEDB88320 |
| `28 00 00 00` near a 256-byte table | CRC32 table (some builds) | Check table length |
| `9e 37 79 b9 7f 4a 7c 15` | ChaCha20 sigma ("expand 32-byte k" LE) | Look for `expand 32-byte k` |
| `62 61 73 65 36 34` | "base64" alphabet nearby | Encoding, not crypto |
| `01 00 01 00` | RSA public exponent 65537 | Followed by modulus |
| `30 82` | DER SEQUENCE header | Embedded certificate/key |

## Block ciphers and modes

| Observation | Inference |
| --- | --- |
| Identical 16-byte blocks in ciphertext | ECB |
| Changing the first block changes only the first block on decrypt | CBC with a controllable IV |
| Ciphertext length = plaintext rounded up + 16 | CBC/PKCS#7 |
| Ciphertext = plaintext length + 16, last 16 bytes unused on decrypt | GCM tag |
| Repeating 16-byte keystream across messages | CTR with a fixed nonce (severe bug) |
| 8-byte blocks, 16 rounds, bit permutations | DES/3DES |
| Streaming output, 64-bit blocks, no padding | RC4 or custom XOR |
| 32-byte key schedule constants `428a2f98` | SHA-256 compression used as a PRF/HMAC |

## Stream and custom constructions

- **RC4:** 256-byte identity permutation `00..ff`, KSA loop, PRGA. Keystream repeats only after 256 bytes of a single state; two messages never repeat unless the key repeats.
- **XOR:** check for repeating key by XORing two ciphertexts of known-plaintext structure (e.g. HTTP requests). Repeated key length shows as periodicity in the XOR result.
- **Rolling XOR with index:** key byte XOR `(i & 0xff)`; common in malware configs.
- **Additive:** `cipher = plain + key[i] mod 256`; nearly identical to XOR analysis.
- **Hash-based integrity:** compare digest length (16/20/32/64) and whether it is stored before or after the data.

## Deriving keys at runtime

| Where to look | What to capture |
| --- | --- |
| Key schedule function arguments | Breakpoint on the crypto API, dump the key buffer |
| Embedded blob decrypted at startup | Hook the decryptor, dump input and output |
| Derived from machine identity | Hook the identity source (volume serial, MAC, CPU id) |
| TLS session | Hook `SSL_CTX_set_keylog_callback` or read the keylog file |
| Keystore/Keychain | `keytool -list`, `security find-generic-password` |

## Analysis checklist

1. Identify primitive from constants or API imports (`CryptEncrypt`, `EVP_*`, `AES_*`, `BCrypt*`).
2. Identify mode from block behavior, not from the name of the function.
3. Find key material: embedded, derived, or negotiated.
4. Reproduce encryption/decryption in Python with test vectors from the binary.
5. Verify on at least three inputs, including one with an empty or maximal-length message.

If the algorithm is custom, treat it as a substitution-permutation network: recover the round function, the number of rounds, and the key schedule, then implement and diff against real outputs.
