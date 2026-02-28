use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait,
    start_cheat_caller_address, stop_cheat_caller_address,
    start_cheat_block_timestamp, stop_cheat_block_timestamp,
};
use starknet::ContractAddress;
use aion_yield_contracts::StrategyRouter::{
    IStrategyRouterDispatcher, IStrategyRouterDispatcherTrait
};

fn OWNER() -> ContractAddress { starknet::contract_address_const::<0x1>() }
fn VAULT() -> ContractAddress { starknet::contract_address_const::<0x2>() }
fn REBALANCER() -> ContractAddress { starknet::contract_address_const::<0x5>() }

fn deploy_strategy_router() -> ContractAddress {
    let contract = declare("StrategyRouter").unwrap().contract_class();
    let calldata = array![
        OWNER().into(),
        VAULT().into(),
        starknet::contract_address_const::<0x10>().into(), // vesu_adapter
        starknet::contract_address_const::<0x11>().into(), // ekubo_adapter
        starknet::contract_address_const::<0x12>().into(), // asset (WBTC)
        starknet::contract_address_const::<0x13>().into(), // avnu_exchange
    ];
    let (addr, _) = contract.deploy(@calldata).unwrap();
    addr
}

#[test]
fn test_initial_targets() {
    let sr_addr = deploy_strategy_router();
    let sr = IStrategyRouterDispatcher { contract_address: sr_addr };

    let targets = sr.get_targets();
    assert(targets.vesu_bps == 6000, 'Wrong Vesu target');
    assert(targets.ekubo_bps == 4000, 'Wrong Ekubo target');
    assert(targets.idle_bps == 0, 'Wrong idle target');
}

#[test]
fn test_update_targets() {
    let sr_addr = deploy_strategy_router();
    let sr = IStrategyRouterDispatcher { contract_address: sr_addr };

    start_cheat_caller_address(sr_addr, OWNER());
    sr.update_targets(7000, 3000);
    stop_cheat_caller_address(sr_addr);

    let targets = sr.get_targets();
    assert(targets.vesu_bps == 7000, 'Wrong Vesu target');
    assert(targets.ekubo_bps == 3000, 'Wrong Ekubo target');
}

#[test]
#[should_panic(expected: ('Weights exceed 100%',))]
fn test_update_targets_exceeds_100pct() {
    let sr_addr = deploy_strategy_router();
    let sr = IStrategyRouterDispatcher { contract_address: sr_addr };

    start_cheat_caller_address(sr_addr, OWNER());
    sr.update_targets(6000, 5000); // 110% total
    stop_cheat_caller_address(sr_addr);
}

#[test]
fn test_set_rebalancer() {
    let sr_addr = deploy_strategy_router();
    let sr = IStrategyRouterDispatcher { contract_address: sr_addr };

    start_cheat_caller_address(sr_addr, OWNER());
    sr.set_rebalancer(REBALANCER());
    stop_cheat_caller_address(sr_addr);
    // No revert = success
}

#[test]
#[should_panic(expected: ('Not owner',))]
fn test_update_targets_not_owner() {
    let sr_addr = deploy_strategy_router();
    let sr = IStrategyRouterDispatcher { contract_address: sr_addr };

    start_cheat_caller_address(sr_addr, VAULT());
    sr.update_targets(5000, 5000);
    stop_cheat_caller_address(sr_addr);
}

#[test]
fn test_needs_rebalance_false_initially() {
    let sr_addr = deploy_strategy_router();
    let sr = IStrategyRouterDispatcher { contract_address: sr_addr };
    // No assets yet — no rebalance needed
    assert(!sr.needs_rebalance(), 'Should not need rebalance');
}

#[test]
fn test_performance_data_initialized() {
    let sr_addr = deploy_strategy_router();
    let sr = IStrategyRouterDispatcher { contract_address: sr_addr };

    let vesu_perf = sr.get_performance('VESU');
    let ekubo_perf = sr.get_performance('EKUBO');

    assert(vesu_perf.total_deposited == 0, 'Vesu deposited should be 0');
    assert(ekubo_perf.total_deposited == 0, 'Ekubo deposited should be 0');
    assert(vesu_perf.last_apy_bps == 450, 'Vesu APY wrong');
    assert(ekubo_perf.last_apy_bps == 680, 'Ekubo APY wrong');
}

#[test]
#[should_panic(expected: ('Not vault',))]
fn test_deposit_to_strategies_only_vault() {
    let sr_addr = deploy_strategy_router();
    let sr = IStrategyRouterDispatcher { contract_address: sr_addr };

    start_cheat_caller_address(sr_addr, OWNER());
    sr.deposit_to_strategies(1000000);
    stop_cheat_caller_address(sr_addr);
}

#[test]
fn test_update_avnu_address() {
    let sr_addr = deploy_strategy_router();
    let sr = IStrategyRouterDispatcher { contract_address: sr_addr };
    let new_avnu = starknet::contract_address_const::<0xff>();

    start_cheat_caller_address(sr_addr, OWNER());
    sr.update_avnu_address(new_avnu);
    stop_cheat_caller_address(sr_addr);
    // No revert = success
}
