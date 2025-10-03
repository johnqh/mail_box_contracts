#!/bin/bash

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: ./scripts/evm/find-deployment-block.sh <network> <contract-address>"
  echo "Example: ./scripts/evm/find-deployment-block.sh sepolia 0x13fC7Fe676E4FaaE8F4D910d8Ed7fbD3FebDbe88"
  exit 1
fi

NETWORK=$1
CONTRACT_ADDRESS=$2

CONTRACT_ADDRESS=$CONTRACT_ADDRESS npx hardhat run scripts/evm/get-deployment-block.ts --network $NETWORK
