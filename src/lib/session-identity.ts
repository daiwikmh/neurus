export type LoginMethod = "google" | "wallet";

const KEY = "neurus_login_method";

export function getLoginMethod(): LoginMethod | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(KEY);
  return v === "google" || v === "wallet" ? v : null;
}

export function setLoginMethod(method: LoginMethod): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, method);
}

export function clearLoginMethod(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
