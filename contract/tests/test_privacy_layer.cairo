use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;
use aion_yield_contracts::PrivacyLayer::{IPrivacyLayerDispatcher, IPrivacyLayerDispatcherTrait};
use core::poseidon::poseidon_hash_span;

fn OWNER() -> ContractAddress { starknet::contract_address_const::<0x1>() }
fn VAULT() -> ContractAddress { starknet::contract_address_const::<0x2>() }
fn USER()  -> ContractAddress { starknet::contract_address_const::<0x3>() }

fn deploy_privacy_layer() -> ContractAddress {
    let contract = declare("PrivacyLayer").unwrap().contract_class();
    let (addr, _) = contract.deploy(@array![
        OWNER().into(),
        VAULT().into(),
        0x0_felt252, // initial root (empty)
    ]).unwrap();
    addr
}

#[test]
fn test_register_commitment() {
    let pl_addr = deploy_privacy_layer();
    let pl = IPrivacyLayerDispatcher { contract_address: pl_addr };

    let commitment: felt252 = 0xdeadbeef;

    start_cheat_caller_address(pl_addr, VAULT());
    pl.register_commitment(commitment);
    stop_cheat_caller_address(pl_addr);

    assert(pl.get_total_commitments() == 1, 'Wrong commitment count');
    assert(pl.get_commitment_at(0) == commitment, 'Wrong commitment stored');
}

#[test]
fn test_multiple_commitments() {
    let pl_addr = deploy_privacy_layer();
    let pl = IPrivacyLayerDispatcher { contract_address: pl_addr };

    start_cheat_caller_address(pl_addr, VAULT());
    pl.register_commitment(0x111);
    pl.register_commitment(0x222);
    pl.register_commitment(0x333);
    stop_cheat_caller_address(pl_addr);

    assert(pl.get_total_commitments() == 3, 'Wrong count');
    assert(pl.get_commitment_at(0) == 0x111, 'Wrong c0');
    assert(pl.get_commitment_at(1) == 0x222, 'Wrong c1');
    assert(pl.get_commitment_at(2) == 0x333, 'Wrong c2');
}

#[test]
#[should_panic(expected: ('Only vault can register',))]
fn test_register_commitment_only_vault() {
    let pl_addr = deploy_privacy_layer();
    let pl = IPrivacyLayerDispatcher { contract_address: pl_addr };

    start_cheat_caller_address(pl_addr, USER());
    pl.register_commitment(0x111);
    stop_cheat_caller_address(pl_addr);
}

#[test]
#[should_panic(expected: ('Empty commitment',))]
fn test_register_zero_commitment_fails() {
    let pl_addr = deploy_privacy_layer();
    let pl = IPrivacyLayerDispatcher { contract_address: pl_addr };

    start_cheat_caller_address(pl_addr, VAULT());
    pl.register_commitment(0);
    stop_cheat_caller_address(pl_addr);
}

#[test]
fn test_nullifier_not_spent_initially() {
    let pl_addr = deploy_privacy_layer();
    let pl = IPrivacyLayerDispatcher { contract_address: pl_addr };

    let nullifier_hash = poseidon_hash_span(array![0xabc_felt252].span());
    assert(!pl.is_nullifier_spent(nullifier_hash), 'Should not be spent');
}

#[test]
fn test_update_root_by_owner() {
    let pl_addr = deploy_privacy_layer();
    let pl = IPrivacyLayerDispatcher { contract_address: pl_addr };

    let new_root: felt252 = 0xdeadbeef12345;

    start_cheat_caller_address(pl_addr, OWNER());
    pl.update_root(new_root);
    stop_cheat_caller_address(pl_addr);

    assert(pl.get_merkle_root() == new_root, 'Root not updated');
}

#[test]
fn test_update_root_by_vault() {
    let pl_addr = deploy_privacy_layer();
    let pl = IPrivacyLayerDispatcher { contract_address: pl_addr };

    let new_root: felt252 = 0xcafe;

    start_cheat_caller_address(pl_addr, VAULT());
    pl.update_root(new_root);
    stop_cheat_caller_address(pl_addr);

    assert(pl.get_merkle_root() == new_root, 'Vault should update root');
}

#[test]
#[should_panic(expected: ('Unauthorized',))]
fn test_update_root_unauthorized() {
    let pl_addr = deploy_privacy_layer();
    let pl = IPrivacyLayerDispatcher { contract_address: pl_addr };

    start_cheat_caller_address(pl_addr, USER());
    pl.update_root(0x999);
    stop_cheat_caller_address(pl_addr);
}

#[test]
fn test_initial_root() {
    let pl_addr = deploy_privacy_layer();
    let pl = IPrivacyLayerDispatcher { contract_address: pl_addr };
    assert(pl.get_merkle_root() == 0, 'Initial root should be 0');
}
