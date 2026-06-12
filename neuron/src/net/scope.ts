// Tenant-scoped network key. The personal memory layer is namespaced per tenant
// (neurus_{tenant}_{set}); the network/CRDT + workflow layer must be too, or two users
// sharing a set name (e.g. "default") would share one CRDT and one workflow slot.
// Local tenant stays bare to preserve existing single-user data; real tenants are isolated.
// Tenant ids (wallet addresses, u_<hex>, "local") never contain "__", so it is a safe separator.
export function scopeKey(tenantId: string, name: string): string {
  return tenantId === "local" ? name : `${tenantId}__${name}`;
}
