import { getSetting, setSetting } from "./database";

const DEVICE_ID_KEY = "device_id";

export async function getOrCreateDeviceId() {
  const existing = await getSetting(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const next = `mobile-${createLooseUuid()}`;
  await setSetting(DEVICE_ID_KEY, next);
  return next;
}

function createLooseUuid() {
  if ("randomUUID" in crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
