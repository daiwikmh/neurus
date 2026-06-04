module neurus_manifest::manifest;

use std::string::{Self, String};
use sui::event;

public struct Head has key, store {
    id: UID,
    owner: address,
    manifest_blob_id: String,
    version: u64,
}

public struct HeadUpdated has copy, drop {
    head: ID,
    owner: address,
    version: u64,
    manifest_blob_id: String,
}

public entry fun create(manifest_blob_id: vector<u8>, ctx: &mut TxContext) {
    let owner = tx_context::sender(ctx);
    let head = Head {
        id: object::new(ctx),
        owner,
        manifest_blob_id: string::utf8(manifest_blob_id),
        version: 0,
    };
    event::emit(HeadUpdated {
        head: object::id(&head),
        owner,
        version: 0,
        manifest_blob_id: head.manifest_blob_id,
    });
    transfer::transfer(head, owner);
}

public entry fun update(head: &mut Head, manifest_blob_id: vector<u8>) {
    head.version = head.version + 1;
    head.manifest_blob_id = string::utf8(manifest_blob_id);
    event::emit(HeadUpdated {
        head: object::id(head),
        owner: head.owner,
        version: head.version,
        manifest_blob_id: head.manifest_blob_id,
    });
}

public fun manifest_blob_id(head: &Head): String {
    head.manifest_blob_id
}

public fun version(head: &Head): u64 {
    head.version
}
