"""Thread-safe memory + /tmp TTL cache for serverless and local FastAPI execution."""

import copy
import hashlib
import json
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple


import weakref


class _KeyRLock:
    """Weak-referenceable RLock wrapper so idle per-key locks are automatically reclaimed."""

    def __init__(self) -> None:
        self._lock = threading.RLock()

    def acquire(self, blocking: bool = True, timeout: float = -1) -> bool:
        return self._lock.acquire(blocking, timeout)

    def release(self) -> None:
        self._lock.release()

    def __enter__(self) -> bool:
        return self._lock.__enter__()

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self._lock.__exit__(exc_type, exc_val, exc_tb)


_PROTECTED_MEM_KEYS = frozenset({"alfp2027f_index", "alfp2027f_zip"})


class TTLCache:
    """Two-tier thread-safe cache storing objects in memory and bytes/JSON in /tmp."""

    def __init__(
        self,
        cache_dir: Optional[str] = None,
        max_mem_entries: int = 512,
    ) -> None:
        default_dir = os.environ.get("HUB_CACHE_DIR", "/tmp/julian_hub_cache")
        self.cache_dir = Path(cache_dir or default_dir)
        self._max_mem_entries = max(16, int(max_mem_entries))
        self._lock = threading.RLock()
        self._mem: Dict[str, Tuple[float, Any]] = {}
        self._key_locks: "weakref.WeakValueDictionary[str, _KeyRLock]" = weakref.WeakValueDictionary()

    def lock_for(self, key: str) -> _KeyRLock:
        """Return a re-entrant lock scoped to a logical cache key (reclaimed when idle)."""
        with self._lock:
            lock = self._key_locks.get(key)
            if lock is None:
                lock = _KeyRLock()
                self._key_locks[key] = lock
            return lock

    def _evict_mem_if_needed(self, now: float) -> None:
        """Prune expired entries and cap _mem size (caller must hold self._lock)."""
        if len(self._mem) < self._max_mem_entries:
            return
        expired = [k for k, (exp, _) in self._mem.items() if exp <= now]
        for k in expired:
            self._mem.pop(k, None)
        if len(self._mem) < self._max_mem_entries:
            return
        # Evict oldest non-protected entries down to 90% capacity to amortize work
        target = max(1, int(self._max_mem_entries * 0.9))
        overflow = len(self._mem) - target
        if overflow <= 0:
            return
        evict_candidates = [k for k in self._mem.keys() if k not in _PROTECTED_MEM_KEYS]
        for k in evict_candidates[:overflow]:
            self._mem.pop(k, None)
        # Fallback if only protected keys remain and still over cap
        while len(self._mem) >= self._max_mem_entries:
            oldest_key = next(iter(self._mem))
            self._mem.pop(oldest_key, None)

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
        now = time.time()
        expires_at = now + ttl_seconds
        with self._lock:
            if key not in self._mem:
                self._evict_mem_if_needed(now)
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
                        if key not in self._mem:
                            self._evict_mem_if_needed(now)
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
        now = time.time()
        expires_at = now + ttl_seconds
        with self._lock:
            if key not in self._mem:
                self._evict_mem_if_needed(now)
            self._mem[key] = (expires_at, data)
            if persist_tmp and self._ensure_dir():
                bin_path, meta_path = self._safe_paths(key)
                suffix = f".{os.getpid()}.{threading.get_ident()}.tmp"
                tmp_bin = bin_path.with_name(f"{bin_path.name}{suffix}")
                tmp_meta = meta_path.with_name(f"{meta_path.name}{suffix}")
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
                    if key not in self._mem:
                        self._evict_mem_if_needed(time.time())
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
