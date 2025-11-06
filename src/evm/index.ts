// Export TypeChain types for production contracts
export { Mailer__factory } from "../../typechain-types/factories/Mailer__factory";
export type { Mailer } from "../../typechain-types/Mailer";

// Export stateless client and types
export {
  EVMMailerClient,
  type EVMWallet,
  type GasOptions,
  type TransactionResult
} from "./evm-mailer-client";