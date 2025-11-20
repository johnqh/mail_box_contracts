// Export TypeChain types for production contracts
export { Mailer__factory } from "../../typechain-types/factories/contracts/Mailer__factory";
export type { Mailer } from "../../typechain-types/contracts/Mailer";

// Export stateless client and types
export {
  EVMMailerClient,
  type EVMWallet,
  type GasOptions,
  type TransactionResult
} from "./evm-mailer-client";