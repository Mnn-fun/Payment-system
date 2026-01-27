# services/idempotency_store.py

class IdempotencyStore:
    def __init__(self):
        self._store = {}

    def exists(self, key: str) -> bool:
        return key in self._store

    def get(self, key: str):
        return self._store.get(key)

    def save(self, key: str, transaction):
        self._store[key] = transaction
