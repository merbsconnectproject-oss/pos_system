#!/usr/bin/env python3
"""Decrypt a POSENC1 AES-256-GCM backup produced by BackupServiceImpl."""
import base64, os, sys
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    raise SystemExit("Install the Ubuntu package python3-cryptography before restoring encrypted backups")

if len(sys.argv) != 3:
    raise SystemExit(f"usage: {sys.argv[0]} INPUT.dump.enc OUTPUT.dump")
key_text = os.environ.get("POS_BACKUP_ENCRYPTION_KEY", "").strip()
if not key_text:
    raise SystemExit("POS_BACKUP_ENCRYPTION_KEY is required")
try:
    key = bytes.fromhex(key_text) if len(key_text) == 64 and all(c in '0123456789abcdefABCDEF' for c in key_text) \
        else base64.b64decode(key_text, validate=True)
except Exception as exc:
    raise SystemExit(f"invalid POS_BACKUP_ENCRYPTION_KEY: {exc}")
if len(key) != 32:
    raise SystemExit("POS_BACKUP_ENCRYPTION_KEY must decode to 32 bytes")

source = Path(sys.argv[1]); target = Path(sys.argv[2])
payload = source.read_bytes()
if payload[:7] != b"POSENC1" or len(payload) < 19:
    raise SystemExit("unsupported or unencrypted backup format")
nonce, ciphertext = payload[7:19], payload[19:]
try:
    plain = AESGCM(key).decrypt(nonce, ciphertext, None)
except Exception as exc:
    raise SystemExit(f"backup authentication failed (wrong key or corrupted file): {exc}")
target.write_bytes(plain)
os.chmod(target, 0o600)
