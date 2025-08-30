import { Idl } from "@coral-xyz/anchor";

export type MailBoxFactory = {
  "version": "0.1.0",
  "name": "mail_box_factory",
  "address": "FactoryABC123def456GHI789jkl012MNO345pqr678STU",
  "metadata": {
    "name": "mail_box_factory",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "initialize",
      "accounts": [],
      "args": []
    },
    {
      "name": "registerDeployment",
      "accounts": [],
      "args": []
    },
    {
      "name": "predictAddresses",
      "accounts": [],
      "args": []
    },
    {
      "name": "batchInitializePrograms",
      "accounts": [],
      "args": []
    },
    {
      "name": "updateVersion",
      "accounts": [],
      "args": []
    },
    {
      "name": "setOwner",
      "accounts": [],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "factoryState",
      "type": {
        "kind": "struct",
        "fields": []
      }
    },
    {
      "name": "deploymentInfo",
      "type": {
        "kind": "struct",
        "fields": []
      }
    }
  ]
} & Idl;