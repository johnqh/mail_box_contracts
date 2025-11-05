// Export TypeChain types for production contracts
export { Mailer__factory } from "../../typechain-types/factories/Mailer__factory.js";
export type { Mailer } from "../../typechain-types/Mailer.js";

// Export client classes and types
export {
  MailerClient,
  type GasOptions,
  type TransactionResult
} from "./mailer-client.js";