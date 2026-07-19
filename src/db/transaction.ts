import { invoke } from "@tauri-apps/api/core";

export type TransactionParam = string | number | boolean | null | { $lastInsertId: number };

export type TransactionStatement = {
  sql: string;
  params: TransactionParam[];
  minRowsAffected?: number;
};

export type TransactionStatementResult = {
  rowsAffected: number;
  lastInsertId: number;
};

export function executeTransaction(
  statements: TransactionStatement[],
): Promise<TransactionStatementResult[]> {
  return invoke<TransactionStatementResult[]>("execute_transaction", { statements });
}
