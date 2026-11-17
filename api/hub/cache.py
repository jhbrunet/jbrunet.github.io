"""Thread-safe memory + /tmp TTL cache for serverless and local FastAPI execution."""

import copy
import hashlib
import json
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple


class TTLCache:
    """Two-tier thread-safe cache storing objects in memory and bytes/JSON in /tmp."""

    def __init__(self, cache_dir: Optional[str] = None) -> None:
        default_dir = os.environ.get("HUB_CACHE_DIR", "/tmp/julian_hub_cache")
        self.cache_dir = Path(cache_dir or default_dir)
        self._lock = threading.RLock()
        self._mem: Dict[str, Tuple[float, Any]] = {}
        self._key_locks: Dict[str, threading.RLock] = {}

    def lock_for(self, key: str) -> threading.RLock:
        """Return a re-entrant lock scoped to a logical cache key."""
        with self._lock:
            lock = self._key_locks.get(key)
            if lock is None:
                lock = threading.RLock()
                self._key_locks[key] = lock
            return lock

    def _safe_paths(self, key: str) -> Tuple[Path, Path]:
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
        return self.cache_dir / f"{digest}.bin", self.cache_dir / f"{digest}.meta.json"

    def _ensure_dir(self) -> bool:
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            return True
        except OSError:
            return False

    def get_mem(self, key: str) -> Optional[Any]:
        now = time.time()
        with self._lock:
            entry = self._mem.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if expires_at <= now:
                self._mem.pop(key, None)
                return None
            return value

    def set_mem(self, key: str, value: Any, ttl_seconds: int) -> None:
        if ttl_seconds <= 0:
            return
        expires_at = time.time() + ttl_seconds
        with self._lock:
            self._mem[key] = (expires_at, value)

    def get_bytes(self, key: str) -> Optional[bytes]:
        now = time.time()
        with self._lock:
            entry = self._mem.get(key)
            if entry is not None:
                expires_at, value = entry
                if expires_at > now and isinstance(value, (bytes, bytearray)):
                    return bytes(value)
                if expires_at <= now:
                    self._mem.pop(key, None)

            bin_path, meta_path = self._safe_paths(key)
            try:
                if meta_path.exists() and bin_path.exists():
                    meta = json.loads(meta_path.read_text(encoding="utf-8"))
                    expires_at = float(meta.get("expires_at", 0.0))
                    if expires_at > now:
                        data = bin_path.read_bytes()
                        self._mem[key] = (expires_at, data)
                        return data
                    meta_path.unlink(missing_ok=True)
                    bin_path.unlink(missing_ok=True)
            except (OSError, ValueError, TypeError):
                return None
        return None

    def set_bytes(
        self, key: str, data: bytes, ttl_seconds: int, persist_tmp: bool = True
    ) -> None:
        if ttl_seconds <= 0:
            return
        expires_at = time.time() + ttl_seconds
        with self._lock:
            self._mem[key] = (expires_at, data)
            if persist_tmp and self._ensure_dir():
                bin_path, meta_path = self._safe_paths(key)
                tmp_bin = bin_path.with_suffix(".bin.tmp")
                tmp_meta = meta_path.with_suffix(".meta.tmp")
                try:
                    tmp_bin.write_bytes(data)
                    tmp_meta.write_text(
                        json.dumps({"expires_at": expires_at, "key": key}),
                        encoding="utf-8",
                    )
                    os.replace(tmp_bin, bin_path)
                    os.replace(tmp_meta, meta_path)
                except OSError:
                    for p in (tmp_bin, tmp_meta):
                        try:
                            p.unlink(missing_ok=True)
                        except OSError:
                            pass

    def get_json(self, key: str) -> Optional[Any]:
        with self._lock:
            mem_val = self.get_mem(key)
            if mem_val is not None:
                return copy.deepcopy(mem_val)
            raw = self.get_bytes(f"json::{key}")
            if raw is None:
                return None
            try:
                val = json.loads(raw.decode("utf-8"))
                entry = self._mem.get(f"json::{key}")
                if entry is not None:
                    self._mem[key] = (entry[0], copy.deepcopy(val))
                return val
            except (UnicodeDecodeError, ValueError):
                return None

    def set_json(
        self, key: str, value: Any, ttl_seconds: int, persist_tmp: bool = True
    ) -> None:
        if ttl_seconds <= 0:
            return
        with self._lock:
            self.set_mem(key, copy.deepcopy(value), ttl_seconds)
            if persist_tmp:
                try:
                    raw = json.dumps(value, ensure_ascii=False).encode("utf-8")
                    self.set_bytes(f"json::{key}", raw, ttl_seconds, persist_tmp=True)
                except (TypeError, ValueError):
                    pass

    def delete(self, key: str) -> None:
        with self._lock:
            self._mem.pop(key, None)
            self._mem.pop(f"json::{key}", None)
            for k in (key, f"json::{key}"):
                bin_path, meta_path = self._safe_paths(k)
                for p in (bin_path, meta_path):
                    try:
                        p.unlink(missing_ok=True)
                    except OSError:
                        pass

    def clear(self, clear_disk: bool = False) -> None:
        with self._lock:
            self._mem.clear()
            if clear_disk and self.cache_dir.exists():
                for child in self.cache_dir.iterdir():
                    try:
                        if child.is_file():
                            child.unlink(missing_ok=True)
                    except OSError:
                        pass


shared_cache = TTLCache()
