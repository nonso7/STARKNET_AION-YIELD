use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;
use aion_yield_contracts::BridgeReceiver::{
    IBridgeReceiverDispatcher, IBridgeReceiverDispatcherTrait, BridgeStatus
};

fn OWNER() -> ContractAddress { starknet::contract_address_const::<0x1>() }
fn RELAYER() -> ContractAddress { starknet::contract_address_const::<0x2>() }
fn USER()  -> ContractAddress { starknet::contract_address_const::<0x3>() }
fn VAULT() -> ContractAddress { starknet::contract_address_const::<0x4>() }

fn ONE_BTC() -> u256 { 100_000_000_u256 }
fn MIN_BTC() -> u256 { 100_000_u256 }

fn deploy_bridge_receiver() -> ContractAddress {
    let contract = declare("BridgeReceiver").unwrap().contract_class();
    let calldata = array![
        OWNER().into(),
        VAULT().into(),
        starknet::contract_address_const::<0x10>().into(), // wbtc_token
        starknet::contract_address_const::<0x11>().into(), // bridge_gateway
    ];
    let (addr, _) = contract.deploy(@calldata).unwrap();
    addr
}

#[test]
fn test_initiate_public_bridge() {
    let br_addr = deploy_bridge_receiver();
    let br = IBridgeReceiverDispatcher { contract_address: br_addr };

    start_cheat_caller_address(br_addr, USER());
    let request_id = br.initiate_bridge(ONE_BTC(), 0, true);
    stop_cheat_caller_address(br_addr);

    assert(request_id != 0, 'No request id returned');
    let req = br.get_request(request_id);
    assert(req.sender == USER(), 'Wrong sender');
    assert(req.btc_amount == ONE_BTC(), 'Wrong amount');
    assert(req.commitment == 0, 'Should be public');
    assert(req.auto_deposit, 'Auto deposit should be true');
    assert(req.status == BridgeStatus::Pending, 'Should be pending');
}

#[test]
fn test_initiate_private_bridge() {
    let br_addr = deploy_bridge_receiver();
    let br = IBridgeReceiverDispatcher { contract_address: br_addr };

    let commitment: felt252 = 0xdeadbeef;

    start_cheat_caller_address(br_addr, USER());
    let request_id = br.initiate_bridge(ONE_BTC(), commitment, true);
    stop_cheat_caller_address(br_addr);

    let req = br.get_request(request_id);
    assert(req.commitment == commitment, 'Wrong commitment');
    assert(req.status == BridgeStatus::Pending, 'Should be pending');
}

#[test]
#[should_panic(expected: ('Below min bridge amount',))]
fn test_bridge_below_minimum() {
    let br_addr = deploy_bridge_receiver();
    let br = IBridgeReceiverDispatcher { contract_address: br_addr };

    start_cheat_caller_address(br_addr, USER());
    br.initiate_bridge(1000, 0, false); // 0.00001 BTC — too small
    stop_cheat_caller_address(br_addr);
}

#[test]
#[should_panic(expected: ('Exceeds max bridge amount',))]
fn test_bridge_above_maximum() {
    let br_addr = deploy_bridge_receiver();
    let br = IBridgeReceiverDispatcher { contract_address: br_addr };

    start_cheat_caller_address(br_addr, USER());
    br.initiate_bridge(2_000_000_000_u256, 0, false); // 20 BTC — too big
    stop_cheat_caller_address(br_addr);
}

#[test]
fn test_multiple_requests_unique_ids() {
    let br_addr = deploy_bridge_receiver();
    let br = IBridgeReceiverDispatcher { contract_address: br_addr };

    start_cheat_caller_address(br_addr, USER());
    let id1 = br.initiate_bridge(MIN_BTC(), 0, false);
    let id2 = br.initiate_bridge(MIN_BTC(), 0, false);
    stop_cheat_caller_address(br_addr);

    assert(id1 != id2, 'IDs should be unique');
}

#[test]
fn test_set_relayer() {
    let br_addr = deploy_bridge_receiver();
    let br = IBridgeReceiverDispatcher { contract_address: br_addr };

    start_cheat_caller_address(br_addr, OWNER());
    br.set_relayer(RELAYER());
    stop_cheat_caller_address(br_addr);
    // no revert = success
}

#[test]
#[should_panic(expected: ('Not relayer',))]
fn test_complete_bridge_only_relayer() {
    let br_addr = deploy_bridge_receiver();
    let br = IBridgeReceiverDispatcher { contract_address: br_addr };

    start_cheat_caller_address(br_addr, USER());
    let id = br.initiate_bridge(MIN_BTC(), 0, false);
    stop_cheat_caller_address(br_addr);

    // USER tries to complete — not relayer
    start_cheat_caller_address(br_addr, USER());
    br.complete_bridge(id, MIN_BTC());
    stop_cheat_caller_address(br_addr);
}

#[test]
#[should_panic(expected: ('Not owner',))]
fn test_update_vault_only_owner() {
    let br_addr = deploy_bridge_receiver();
    let br = IBridgeReceiverDispatcher { contract_address: br_addr };
    let new_vault = starknet::contract_address_const::<0xff>();

    start_cheat_caller_address(br_addr, USER());
    br.update_vault(new_vault);
    stop_cheat_caller_address(br_addr);
}
