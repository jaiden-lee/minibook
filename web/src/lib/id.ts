const DEVICE_ID_KEY = "minibook:device-id";

export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const created = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export function createSessionId(): string {
  return crypto.randomUUID();
}
