/**
 * @file customSql.ts
 * @description The read-only SQL surface behind the SQLite terminal.
 *
 * A slice of behaviour rather than a class: `executeCustomSQL` never touches
 * the instance beyond reading `state` and writing one query-log entry, so
 * nothing about it requires being a method on the repository. Moving it out
 * takes 89 lines out of a file that is otherwise about persistence.
 *
 * The parser here is deliberately literal rather than a SQL engine: it
 * recognises three table names and a `WHERE deleted = 0|1` filter, and refuses
 * everything else. The two refusals at the bottom are the security boundary --
 * INSERT/UPDATE/DELETE are rejected before any state is touched, so a query
 * typed into the terminal can read masked columns but cannot write through a
 * path that would skip the re-encryption every legitimate write performs.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import type { SQLCommandLog } from './vaultStorageRepository';

export interface CustomSqlQueryResult {
  columns: string[];
  rows: unknown[][];
  error?: string;
}

export interface CustomSqlState {
  user_secrets: { username: string; argon_hash: string }[];
  vault_items: {
    id: string;
    title: string;
    category: string;
    favorite: number;
    deleted: number;
    username_db: string;
    password_db: string;
    notes_db: string;
    enc_metadata: string;
  }[];
}

/** `enc_metadata` is ciphertext; the terminal shows a prefix, never the body. */
function abbreviateCiphertext(value: string): string {
  return `${value.substring(0, 32)}...`;
}

/**
 * Runs a read-only query against the masked database view.
 *
 * `logQuery` is injected rather than called through `this` so this module has
 * no dependency on the repository, and so the caller keeps ownership of the
 * single log entry the terminal writes per query.
 */
export function executeCustomSql(
  sql: string,
  state: CustomSqlState,
  logQuery: (query: string, status: SQLCommandLog['status'], rowsAffected: number) => void,
): CustomSqlQueryResult {
  const sanitized = sql.trim().replace(/;$/, '');
  const tokens = sanitized.split(/\s+/);

  if (tokens.length === 0) {
    return { columns: [], rows: [] };
  }

  const command = tokens[0]!.toUpperCase();

  if (command === 'SELECT') {
    // 1. SELECT * FROM user_secrets
    if (sanitized.toUpperCase().includes('USER_SECRETS')) {
      logQuery(sql, 'SUCCESS', state.user_secrets.length);
      return {
        columns: ['username', 'argon_hash'],
        rows: state.user_secrets.map((s) => [s.username, s.argon_hash]),
      };
    }

    // 2. SELECT * FROM vault_items
    if (sanitized.toUpperCase().includes('VAULT_ITEMS')) {
      let itemsToUse = state.vault_items;

      // Handle filter WHERE deleted = 0
      if (sanitized.toUpperCase().includes('WHERE DELETED = 0')) {
        itemsToUse = itemsToUse.filter((i) => i.deleted === 0);
      } else if (sanitized.toUpperCase().includes('WHERE DELETED = 1')) {
        itemsToUse = itemsToUse.filter((i) => i.deleted === 1);
      }

      const isAsterisk = tokens[1] === '*';

      logQuery(sql, 'SUCCESS', itemsToUse.length);

      if (isAsterisk) {
        return {
          columns: ['id', 'title', 'category', 'favorite', 'deleted', 'username_db', 'password_db', 'notes_db', 'enc_metadata'],
          rows: itemsToUse.map((i) => [
            i.id,
            i.title,
            i.category,
            i.favorite,
            i.deleted,
            i.username_db,
            i.password_db,
            i.notes_db ? i.notes_db : 'NULL',
            abbreviateCiphertext(i.enc_metadata),
          ]),
        };
      }

      // Parse columns e.g. SELECT id, title, category FROM
      const selectPart = sanitized.toUpperCase().split('FROM')[0] ?? '';
      const cols = selectPart.replace('SELECT', '').split(',').map((c) => c.trim().toLowerCase());

      return {
        columns: cols,
        rows: itemsToUse.map((i) => cols.map((c) => {
          if (c === 'id') return i.id;
          if (c === 'title') return i.title;
          if (c === 'category') return i.category;
          if (c === 'favorite') return i.favorite;
          if (c === 'deleted') return i.deleted;
          if (c === 'username_db' || c === 'username') return i.username_db;
          if (c === 'password_db' || c === 'password') return i.password_db;
          if (c === 'enc_metadata') return abbreviateCiphertext(i.enc_metadata);
          return 'NULL';
        })),
      };
    }

    return { columns: [], rows: [], error: "Only the 'user_secrets' and 'vault_items' tables are supported." };
  }

  // The write refusal. It runs before any state is read or written, so the
  // terminal has no path to a row that skipped re-encryption.
  if (command === 'UPDATE' || command === 'DELETE' || command === 'INSERT') {
    logQuery(sql, 'ERROR', 0);
    return { columns: [], rows: [], error: 'Direct writes (INSERT/UPDATE/DELETE) are disabled in the SQLite terminal for security. Please use the main interface.' };
  }

  logQuery(sql, 'ERROR', 0);
  return { columns: [], rows: [], error: `Unrecognized SQL command: "${command}". Only SELECT queries are supported.` };
}