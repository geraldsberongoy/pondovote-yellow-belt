#![cfg(test)]
use super::*;
use soroban_sdk::{symbol_short, testutils::Address as _, Address, Env};

#[test]
fn vote_flow() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(Poll, ());
    let client = PollClient::new(&env, &id);

    client.init(&symbol_short!("food"), &3);
    assert_eq!(client.get_results(), soroban_sdk::vec![&env, 0, 0, 0]);

    let voter = Address::generate(&env);
    client.vote(&voter, &1);
    client.vote(&voter, &1);
    assert_eq!(client.get_results(), soroban_sdk::vec![&env, 0, 2, 0]);
}

#[test]
fn bad_option_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(Poll, ());
    let client = PollClient::new(&env, &id);
    client.init(&symbol_short!("food"), &2);
    let voter = Address::generate(&env);
    assert_eq!(client.try_vote(&voter, &5), Err(Ok(Error::BadOption)));
}
