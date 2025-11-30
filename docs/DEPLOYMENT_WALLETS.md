# Deployment Wallets

## Owner Setup

Identify the wallet you want to use to control the owner, for example, "Operations".

Create multi-sig (Safe.global and Squads.so) Wallet, with the Operation wallet as the only signer.

Set in .env.local:

```
EVM_OWNER_ADDRESS=
SOLANA_OWNER_ADDRESS=
```

## Wallet Setup

Identify the wallet you want to use, for example, "Contract Deployment".

Export the address and private key, and set in .env.local:

```
EVM_PRIVATE_KEY=
SOLANA_PRIVATE_KEY=
```

## Deployment

Run deployment script.
