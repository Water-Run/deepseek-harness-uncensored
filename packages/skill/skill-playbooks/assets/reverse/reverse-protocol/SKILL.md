---
description: "Reconstruct a wire protocol or file format: capture, framing, field boundaries, serialization detection, crypto identification, state machine recovery, and a replay harness that proves the model is correct."
whenToUse: "The target talks to a server, reads a binary file format, or uses an undocumented serialization."
---

# Protocol and format reconstruction

## 1. Capture ground truth

- Intercept with mitmproxy/Charles for HTTPS, tcpdump for raw, or a Frida hook at `send`/`recv` for pinned clients.
- Capture the same action three times, then capture a variant (different user, different payload size) to expose length fields and counters.
- Store captures as HAR/pcap plus a decoded transcript. Everything downstream must be replayable from these files.

## 2. Find the frame

Start at byte 0 and answer: is there a magic? a version? a length? is it length-prefixed or delimiter-based? is the body text or binary?

| Pattern | Likely framing |
| --- | --- |
| Fixed 4-byte big-endian value equal to remaining size | Length prefix |
| Repeated `\r\n` boundaries with `Content-Length` | HTTP-like text protocol |
| `0x00` field separators, ASCII commands | TLV or command line protocol |
| High entropy after a short header | Encrypted or compressed body |
| Small increasing integers near the start | Sequence number / message type |

## 3. Identify the serialization

- **Protobuf:** field tags visible as `0x08`, `0x12`, `0x1a`; decode with `protoc --decode_raw`.
- **MessagePack:** `0x80`-`0x8f` map headers; `msgpack2json`.
- **CBOR:** `0xa0`-`0xbf` maps; `cbor2`.
- **BSON:** length prefix + `\x00` terminators; `bsondump`.
- **JSON with binary blobs:** base64 or hex inside strings; decode and inspect the decoded bytes.
- **Custom TLV:** field id + length + value; write a parser as soon as the pattern is stable.

## 4. Crypto identification

Check for standard constants before assuming custom crypto:

```bash
# AES S-box opening bytes
xxd -p SAMPLE | tr -d '\n' | grep -o '637c777bf26b6fc5' | head
# SHA-256 initial state
grep -aobP '\x6a\x09\xe6\x67\xbb\x67\xae\x85' SAMPLE
```

| Signal | Likely primitive |
| --- | --- |
| 256-byte table starting `63 7c 77 7b` | AES S-box |
| 256-byte table `00 00 00 00 01 00 ...` | CRC32 or custom substitution |
| Repeated 16-byte XOR key | XOR stream |
| Block size 8, 16 rounds of table lookups | DES / 3DES |
| Same plaintext produces different ciphertext | IV/nonce present |
| Ciphertext length = plaintext + 16 or + 28 | AES-CBC/GCM with tag |

Then determine mode: ECB repeats identical blocks; CBC flips one block on IV change; CTR/GCM never repeat. See `references/crypto-identification.md`.

## 5. Recover the state machine

Write the observed message sequence as a table: direction, type, fields, and the state transition it causes. Then:

- Rename fields by behavior, not by guess.
- Test field boundaries by mutating one byte and observing the server response.
- Distinguish "server ignores field" from "field is validated but unused".
- Find the initialization handshake; most protocols break without it.

## 6. Build a replay harness

A small client that reproduces one captured exchange is worth more than pages of notes:

```python
import socket, struct
def frame(kind: int, body: bytes) -> bytes:
    return struct.pack('>HH', kind, len(body)) + body
s = socket.create_connection((HOST, PORT))
s.sendall(frame(1, b'\x01'))
print(s.recv(4096).hex())
```

Prove: replay works, a mutated field changes the response as predicted, and a new request (not captured) succeeds against the real service.

## 7. Document

`format.md` in the case directory: framing diagram, field table with offsets and types, message catalog, crypto per field, state diagram, and open questions. Include one hexdump per message type.
