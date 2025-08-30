import { Idl } from "@coral-xyz/anchor";

export type MailService = {
  "version": "0.1.0",
  "name": "mail_service",
  "address": "8EKjCLZjz6LKRxZcQ6LwwF5V8P3TCEgM2CdQg4pZxXHE",
  "metadata": {
    "name": "mail_service",
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
      "name": "delegateTo",
      "accounts": [],
      "args": []
    },
    {
      "name": "rejectDelegation", 
      "accounts": [],
      "args": []
    },
    {
      "name": "registerDomain",
      "accounts": [],
      "args": []
    },
    {
      "name": "setRegistrationFee",
      "accounts": [],
      "args": []
    },
    {
      "name": "setDelegationFee",
      "accounts": [],
      "args": []
    },
    {
      "name": "withdrawFees",
      "accounts": [],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "mailServiceState",
      "type": {
        "kind": "struct",
        "fields": []
      }
    },
    {
      "name": "delegation",
      "type": {
        "kind": "struct", 
        "fields": []
      }
    }
  ]
} & Idl;