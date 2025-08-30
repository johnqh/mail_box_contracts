import { Idl } from "@coral-xyz/anchor";

export type Mailer = {
  "version": "0.1.0",
  "name": "mailer", 
  "address": "9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF",
  "metadata": {
    "name": "mailer",
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
      "name": "sendPriority",
      "accounts": [],
      "args": []
    },
    {
      "name": "sendPriorityPrepared",
      "accounts": [],
      "args": []
    },
    {
      "name": "send",
      "accounts": [],
      "args": []
    },
    {
      "name": "sendPrepared",
      "accounts": [],
      "args": []
    },
    {
      "name": "claimRecipientShare",
      "accounts": [],
      "args": []
    },
    {
      "name": "claimOwnerShare", 
      "accounts": [],
      "args": []
    },
    {
      "name": "claimExpiredShares",
      "accounts": [],
      "args": []
    },
    {
      "name": "setFee",
      "accounts": [],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "mailerState",
      "type": {
        "kind": "struct",
        "fields": []
      }
    },
    {
      "name": "recipientClaim",
      "type": {
        "kind": "struct",
        "fields": []
      }
    }
  ]
} & Idl;