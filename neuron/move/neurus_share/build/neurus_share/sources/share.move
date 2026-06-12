// Cross-user sharing of a Neurus dataset/workflow snapshot via Seal allowlist access control.
// Based on the Seal allowlist pattern (MystenLabs/seal examples/move/sources/allowlist.move).
// An owner creates a Share (allowlist) + Cap, seals a Walrus snapshot blob under the share's
// identity prefix, and grants/revokes reader addresses. Seal key servers call seal_approve to
// decide whether a requester may fetch the decryption key.

module neurus_share::share;

use std::string::String;
use sui::dynamic_field as df;

const EInvalidCap: u64 = 0;
const ENoAccess: u64 = 1;
const EDuplicate: u64 = 2;
const MARKER: u64 = 3;

public struct Share has key {
    id: UID,
    name: String,
    kind: String, // "dataset" | "workflow"
    list: vector<address>,
}

public struct Cap has key {
    id: UID,
    share_id: ID,
}

/// Create a share + admin cap. Identity prefix for sealing = the share's object id bytes.
public fun create(name: String, kind: String, ctx: &mut TxContext): Cap {
    let share = Share { id: object::new(ctx), name, kind, list: vector[] };
    let cap = Cap { id: object::new(ctx), share_id: object::id(&share) };
    transfer::share_object(share);
    cap
}

entry fun create_entry(name: String, kind: String, ctx: &mut TxContext) {
    transfer::transfer(create(name, kind, ctx), ctx.sender());
}

public fun grant(share: &mut Share, cap: &Cap, account: address) {
    assert!(cap.share_id == object::id(share), EInvalidCap);
    assert!(!share.list.contains(&account), EDuplicate);
    share.list.push_back(account);
}

public fun revoke(share: &mut Share, cap: &Cap, account: address) {
    assert!(cap.share_id == object::id(share), EInvalidCap);
    share.list = share.list.filter!(|x| x != account);
}

/// Attach a sealed Walrus snapshot blob id to the share (audit/discovery).
public fun publish(share: &mut Share, cap: &Cap, blob_id: String) {
    assert!(cap.share_id == object::id(share), EInvalidCap);
    df::add(&mut share.id, blob_id, MARKER);
}

public fun namespace(share: &Share): vector<u8> {
    share.id.to_bytes()
}

fun is_prefix(prefix: vector<u8>, word: vector<u8>): bool {
    if (prefix.length() > word.length()) return false;
    let mut i = 0;
    while (i < prefix.length()) {
        if (prefix[i] != word[i]) return false;
        i = i + 1;
    };
    true
}

fun approve_internal(caller: address, id: vector<u8>, share: &Share): bool {
    if (!is_prefix(share.namespace(), id)) return false;
    share.list.contains(&caller)
}

/// Seal key servers evaluate this. Succeeds only if the requested identity carries this share's
/// prefix AND the requester is on the allowlist. Revoking the requester makes future calls fail.
entry fun seal_approve(id: vector<u8>, share: &Share, ctx: &TxContext) {
    assert!(approve_internal(ctx.sender(), id, share), ENoAccess);
}

#[test_only]
public fun new_for_testing(ctx: &mut TxContext): (Share, Cap) {
    let share = Share { id: object::new(ctx), name: b"t".to_string(), kind: b"dataset".to_string(), list: vector[] };
    let cap = Cap { id: object::new(ctx), share_id: object::id(&share) };
    (share, cap)
}

#[test]
fun grant_revoke_gates_access() {
    let mut ctx = tx_context::dummy();
    let (mut share, cap) = new_for_testing(&mut ctx);
    let alice = @0xA;
    let id = share.namespace(); // prefix-only id is a valid prefix of itself
    assert!(!approve_internal(alice, id, &share), 100);
    share.grant(&cap, alice);
    assert!(approve_internal(alice, id, &share), 101);
    share.revoke(&cap, alice);
    assert!(!approve_internal(alice, id, &share), 102);
    let Share { id, .. } = share; object::delete(id);
    let Cap { id, .. } = cap; object::delete(id);
}
