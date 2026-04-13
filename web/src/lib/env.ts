export function getGoogleClientId() {
  const value = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
