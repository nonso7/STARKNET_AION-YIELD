use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait,
    start_cheat_caller_address, stop_cheat_caller_address,
    start_cheat_block_timestamp, stop_cheat_block_timestamp,
};
use starknet::ContractAddress;
use aion_yield_contracts::AionVault::{IAionVaultDispatcher, IAionVaultDispatcherTrait};
use aion_yield_contracts::mocks::MockWBTC::{MockWBTCDispatcher, MockWBTCDispatcherTrait};
use aion_yield_contracts::interfaces::IERC20::{IERC20Dispatcher, IERC20DispatcherTrait};

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn OWNER() -> ContractAddress { starknet::contract_address_const::<0x1>() }
fn USER_A() -> ContractAddress { starknet::contract_address_const::<0x2>() }
fn USER_B() -> ContractAddress { starknet::contract_address_const::<0x3>() }
fn FEE_RECIPIENT() -> ContractAddress { starknet::contract_address_const::<0x4>() }

fn ONE_WBTC() -> u256 { 100_000_000_u256 }   // 1 WBTC (8 decimals)
fn HALF_WBTC() -> u256 { 50_000_000_u256 }

fn deploy_mock_wbtc() -> ContractAddress {
    let contract = declare("MockWBTC").unwrap().contract_class();
    let (addr, _) = contract.deploy(@array![OWNER().into()]).unwrap();
    addr
}

fn deploy_vault(wbtc: ContractAddress) -> ContractAddress {
    // For unit tests, strategy_router / privacy_layer use zero addresses
    // In integration tests these would be real deployed contracts
    let contract = declare("AionVault").unwrap().contract_class();
    let calldata = array![
        OWNER().into(),
        wbtc.into(),
        starknet::contract_address_const::<0x10>().into(), // privacy_layer
        starknet::contract_address_const::<0x11>().into(), // strategy_router
        starknet::contract_address_const::<0x12>().into(), // vesu_adapter
        starknet::contract_address_const::<0x13>().into(), // ekubo_adapter
        FEE_RECIPIENT().into(),
    ];
    let (addr, _) = contract.deploy(@calldata).unwrap();
    addr
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[test]
fn test_vault_initial_state() {
    let wbtc = deploy_mock_wbtc();
    let vault_addr = deploy_vault(wbtc);
    let vault = IAionVaultDispatcher { contract_address: vault_addr };

    let config = vault.get_config();
    assert(config.asset == wbtc, 'Wrong asset');
    assert(!config.is_paused, 'Should not be paused');
    assert(config.performance_fee_bps == 100, 'Wrong perf fee');
    assert(config.management_fee_bps == 50, 'Wrong mgmt fee');
    assert(vault.get_total_shares() == 0, 'Should have 0 shares');
}

#[test]
fn test_public_deposit_mints_shares() {
    let wbtc_addr = deploy_mock_wbtc();
    let vault_addr = deploy_vault(wbtc_addr);
    let vault = IAionVaultDispatcher { contract_address: vault_addr };
    let wbtc = IERC20Dispatcher { contract_address: wbtc_addr };
    let mock_wbtc = MockWBTCDispatcher { contract_address: wbtc_addr };

    // Mint WBTC to user
    start_cheat_caller_address(wbtc_addr, OWNER());
    mock_wbtc.mint(USER_A(), ONE_WBTC());
    stop_cheat_caller_address(wbtc_addr);

    // Approve vault
    start_cheat_caller_address(wbtc_addr, USER_A());
    wbtc.approve(vault_addr, ONE_WBTC());
    stop_cheat_caller_address(wbtc_addr);

    // First deposit: 1:1 ratio
    start_cheat_caller_address(vault_addr, USER_A());
    let shares = vault.deposit(ONE_WBTC());
    stop_cheat_caller_address(vault_addr);

    assert(shares == ONE_WBTC(), 'Wrong shares on first deposit');
    assert(vault.get_share_balance(USER_A()) == ONE_WBTC(), 'Wrong share balance');
    assert(vault.get_total_shares() == ONE_WBTC(), 'Wrong total shares');
}

#[test]
fn test_share_ratio_on_second_deposit() {
    let wbtc_addr = deploy_mock_wbtc();
    let vault_addr = deploy_vault(wbtc_addr);
    let vault = IAionVaultDispatcher { contract_address: vault_addr };
    let wbtc = IERC20Dispatcher { contract_address: wbtc_addr };
    let mock_wbtc = MockWBTCDispatcher { contract_address: wbtc_addr };

    // Setup: mint and give both users WBTC
    start_cheat_caller_address(wbtc_addr, OWNER());
    mock_wbtc.mint(USER_A(), ONE_WBTC() * 2);
    mock_wbtc.mint(USER_B(), ONE_WBTC());
    stop_cheat_caller_address(wbtc_addr);

    // User A deposits 1 WBTC
    start_cheat_caller_address(wbtc_addr, USER_A());
    wbtc.approve(vault_addr, ONE_WBTC() * 2);
    stop_cheat_caller_address(wbtc_addr);

    start_cheat_caller_address(vault_addr, USER_A());
    vault.deposit(ONE_WBTC());
    stop_cheat_caller_address(vault_addr);

    // User B deposits 1 WBTC — should also get 1:1 since no yield yet
    start_cheat_caller_address(wbtc_addr, USER_B());
    wbtc.approve(vault_addr, ONE_WBTC());
    stop_cheat_caller_address(wbtc_addr);

    start_cheat_caller_address(vault_addr, USER_B());
    let shares_b = vault.deposit(ONE_WBTC());
    stop_cheat_caller_address(vault_addr);

    assert(shares_b == ONE_WBTC(), 'Wrong shares for B');
    assert(vault.get_total_shares() == ONE_WBTC() * 2, 'Wrong total shares');
}

#[test]
fn test_convert_to_shares_and_assets() {
    let wbtc_addr = deploy_mock_wbtc();
    let vault_addr = deploy_vault(wbtc_addr);
    let vault = IAionVaultDispatcher { contract_address: vault_addr };

    // Before any deposit: 1:1
    let shares = vault.convert_to_shares(ONE_WBTC());
    let assets = vault.convert_to_assets(ONE_WBTC());
    assert(shares == ONE_WBTC(), 'Pre-deposit shares wrong');
    assert(assets == ONE_WBTC(), 'Pre-deposit assets wrong');
}

#[test]
fn test_private_deposit_hides_amount() {
    let wbtc_addr = deploy_mock_wbtc();
    let vault_addr = deploy_vault(wbtc_addr);
    let vault = IAionVaultDispatcher { contract_address: vault_addr };
    let wbtc = IERC20Dispatcher { contract_address: wbtc_addr };
    let mock_wbtc = MockWBTCDispatcher { contract_address: wbtc_addr };

    start_cheat_caller_address(wbtc_addr, OWNER());
    mock_wbtc.mint(USER_A(), ONE_WBTC());
    stop_cheat_caller_address(wbtc_addr);

    start_cheat_caller_address(wbtc_addr, USER_A());
    wbtc.approve(vault_addr, ONE_WBTC());
    stop_cheat_caller_address(wbtc_addr);

    // commitment = poseidon(secret=0x999, nullifier=0x888)
    let commitment: felt252 = 0x123abc_felt252;

    start_cheat_caller_address(vault_addr, USER_A());
    vault.deposit_private(commitment, ONE_WBTC());
    stop_cheat_caller_address(vault_addr);

    // Public shares should be 0 (private deposit doesn't mint ERC20 shares)
    assert(vault.get_share_balance(USER_A()) == 0, 'Private should not mint shares');
}

#[test]
#[should_panic(expected: ('Vault is paused',))]
fn test_deposit_fails_when_paused() {
    let wbtc_addr = deploy_mock_wbtc();
    let vault_addr = deploy_vault(wbtc_addr);
    let vault = IAionVaultDispatcher { contract_address: vault_addr };

    start_cheat_caller_address(vault_addr, OWNER());
    vault.pause();
    stop_cheat_caller_address(vault_addr);

    start_cheat_caller_address(vault_addr, USER_A());
    vault.deposit(ONE_WBTC());
    stop_cheat_caller_address(vault_addr);
}

#[test]
fn test_pause_and_unpause() {
    let wbtc_addr = deploy_mock_wbtc();
    let vault_addr = deploy_vault(wbtc_addr);
    let vault = IAionVaultDispatcher { contract_address: vault_addr };

    start_cheat_caller_address(vault_addr, OWNER());
    vault.pause();
    assert(vault.get_config().is_paused, 'Should be paused');

    vault.unpause();
    assert(!vault.get_config().is_paused, 'Should be unpaused');
    stop_cheat_caller_address(vault_addr);
}

#[test]
#[should_panic(expected: ('Not owner',))]
fn test_pause_requires_owner() {
    let wbtc_addr = deploy_mock_wbtc();
    let vault_addr = deploy_vault(wbtc_addr);
    let vault = IAionVaultDispatcher { contract_address: vault_addr };

    start_cheat_caller_address(vault_addr, USER_A());
    vault.pause();
    stop_cheat_caller_address(vault_addr);
}

#[test]
fn test_update_fees() {
    let wbtc_addr = deploy_mock_wbtc();
    let vault_addr = deploy_vault(wbtc_addr);
    let vault = IAionVaultDispatcher { contract_address: vault_addr };

    start_cheat_caller_address(vault_addr, OWNER());
    vault.update_fees(200, 100);
    stop_cheat_caller_address(vault_addr);

    let config = vault.get_config();
    assert(config.performance_fee_bps == 200, 'Wrong perf fee');
    assert(config.management_fee_bps == 100, 'Wrong mgmt fee');
}

#[test]
#[should_panic(expected: ('Performance fee > 20%',))]
fn test_update_fees_cap() {
    let wbtc_addr = deploy_mock_wbtc();
    let vault_addr = deploy_vault(wbtc_addr);
    let vault = IAionVaultDispatcher { contract_address: vault_addr };

    start_cheat_caller_address(vault_addr, OWNER());
    vault.update_fees(2001, 0); // > 20% should fail
    stop_cheat_caller_address(vault_addr);
}

#[test]
#[should_panic(expected: ('Deposit: zero assets',))]
fn test_deposit_zero_fails() {
    let wbtc_addr = deploy_mock_wbtc();
    let vault_addr = deploy_vault(wbtc_addr);
    let vault = IAionVaultDispatcher { contract_address: vault_addr };

    start_cheat_caller_address(vault_addr, USER_A());
    vault.deposit(0);
    stop_cheat_caller_address(vault_addr);
}

#[test]
#[should_panic(expected: ('Private deposit: empty commitment',))]
fn test_private_deposit_zero_commitment_fails() {
    let wbtc_addr = deploy_mock_wbtc();
    let vault_addr = deploy_vault(wbtc_addr);
    let vault = IAionVaultDispatcher { contract_address: vault_addr };

    start_cheat_caller_address(vault_addr, USER_A());
    vault.deposit_private(0, ONE_WBTC());
    stop_cheat_caller_address(vault_addr);
}
