/**
 * What Soma should do at launch, given what is on disk.
 *
 * This is deliberately a pure function with no I/O. Booting the app is the one
 * decision where being wrong is unrecoverable: `initDatabase()` creates a fresh
 * `soma.db` and walks the user into onboarding, and if their real database was
 * sitting next to it in encrypted form the whole time, the app has just told
 * someone their medical history is gone.
 *
 * The rule the previous version got wrong, stated plainly:
 *
 *   **A vault file on disk means the user has data. If Soma cannot open it,
 *   Soma stops and says so. It never starts a new database instead.**
 *
 * That covers three things that used to fall through to a normal boot: a
 * `vault_state` probe that threw, a vault whose header would not parse, and a
 * keychain-mode vault whose key the OS would not hand over.
 */

export type VaultMode = "keychain" | "passphrase";

export type KeychainKeyStatus = "present" | "missing" | "unavailable";

export type VaultState = {
  vaultExists: boolean;
  plaintextExists: boolean;
  plaintextSize: number;
  vaultSize: number;
  attachmentsVaultExists: boolean;
  mode: VaultMode | null;
  headerReadable: boolean;
  headerError: string | null;
  keychainKeyStatus: KeychainKeyStatus;
  keychainError: string | null;
  /** Absolute path of Soma's data directory, for the recovery screen. */
  dataDir: string;
};

/**
 * Why Soma refused to start. Each reason maps to its own explanation and its
 * own set of ways out, because "we don't know" and "the OS won't give us the
 * key" are not the same problem and must not read as the same message.
 */
export type BlockedReason =
  /** `vault_state` itself failed. We cannot rule out a vault, so we don't boot. */
  | "probeFailed"
  /** A vault is there and its header will not parse. */
  | "vaultUnreadable"
  /** Keychain-mode vault, and the keychain says there is no key at all. */
  | "keyMissing"
  /** Keychain-mode vault, and the keychain refused to release the key. */
  | "keyUnavailable"
  /** A plaintext database sits next to the vault but is far too small to be
   *  the user's — booting on it would show an empty app over full ciphertext. */
  | "plaintextSuspicious"
  /** We had a key or passphrase and the unlock still failed. */
  | "unlockFailed";

export type StartupPlan =
  /** Open the database normally. `restoreAttachments` unpacks a still-sealed
   *  `attachments.vault` first — best effort, never fatal. */
  | { action: "boot"; restoreAttachments: boolean }
  /** Decrypt with the OS keychain key, then boot. */
  | { action: "unlockKeychain" }
  /** Show the passphrase screen. `verifyOnly` when a newer plaintext database
   *  already exists: check the passphrase to re-arm the session, but do not let
   *  the older vault overwrite live data. */
  | { action: "promptPassphrase"; verifyOnly: boolean }
  /** Stop, explain, and offer the ways out. Never create a database. */
  | { action: "blocked"; reason: BlockedReason; detail: string | null };

/**
 * A live database may be larger than the vault (a session added data) but never
 * dramatically smaller: the vault is a whole copy of it as of the last clean
 * exit, and AES-GCM ciphertext is the same length as its plaintext. Anything
 * under this fraction of the vault was not written by a session holding the
 * user's records — an empty file from a crashed first boot, or from some other
 * process that opened the path. The old gate trusted any such file and walked
 * the user into onboarding with their real data untouched on disk beside it.
 */
const MIN_PLAUSIBLE_PLAINTEXT_RATIO = 0.5;

export function isPlaintextImplausible(state: VaultState): boolean {
  if (!state.vaultExists || !state.plaintextExists) return false;
  if (state.vaultSize === 0) return false;
  return state.plaintextSize < state.vaultSize * MIN_PLAUSIBLE_PLAINTEXT_RATIO;
}

/** The plan when the `vault_state` probe could not be read at all. */
export const PROBE_FAILED_PLAN: StartupPlan = {
  action: "blocked",
  reason: "probeFailed",
  detail: null,
};

export function planStartup(state: VaultState): StartupPlan {
  // No vault: ordinary launch, encrypted or not, first run or thousandth.
  if (!state.vaultExists) {
    return { action: "boot", restoreAttachments: false };
  }

  // A vault we cannot even identify. It may be truncated, it may be from a
  // newer Soma. Either way it is the user's data and we do not step past it.
  if (!state.headerReadable || state.mode === null) {
    return { action: "blocked", reason: "vaultUnreadable", detail: state.headerError };
  }

  // A plaintext database that cannot hold what the vault holds must not be
  // preferred over the vault, in either mode. Stop and let the user decide.
  if (isPlaintextImplausible(state)) {
    return {
      action: "blocked",
      reason: "plaintextSuspicious",
      detail: `${state.plaintextSize} bytes next to a ${state.vaultSize}-byte vault`,
    };
  }

  if (state.mode === "passphrase") {
    return { action: "promptPassphrase", verifyOnly: state.plaintextExists };
  }

  // Keychain mode. A plaintext database next to the vault is newer than the
  // vault — an unclean exit left it — so it wins, and the vault is re-sealed on
  // the next clean exit. The attachments, though, are still locked away and
  // would silently be missing from every record, so unpack them.
  if (state.plaintextExists) {
    return { action: "boot", restoreAttachments: state.attachmentsVaultExists };
  }

  switch (state.keychainKeyStatus) {
    case "present":
      return { action: "unlockKeychain" };
    case "missing":
      return { action: "blocked", reason: "keyMissing", detail: null };
    case "unavailable":
      return { action: "blocked", reason: "keyUnavailable", detail: state.keychainError };
  }
}

/**
 * The plan after an unlock attempt failed. Always blocked — an unlock that did
 * not work is never a reason to continue into an empty database.
 */
export function planAfterFailedUnlock(error: unknown): StartupPlan {
  return {
    action: "blocked",
    reason: "unlockFailed",
    detail: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Whether the ad-hoc-signing explanation applies. Soma ships without a paid
 * Apple Developer certificate, so each build is signed ad-hoc and macOS treats
 * an updated Soma as a *different* application — one the keychain entry's ACL
 * does not name. The key is untouched; the OS simply will not hand it to the
 * new binary. This will happen to every keychain-mode user on every update, so
 * the explanation belongs on screen rather than in a support thread.
 */
export function isMacKeychainSigningCase(
  plan: StartupPlan,
  platform: string = typeof navigator === "undefined" ? "" : navigator.platform,
): boolean {
  if (plan.action !== "blocked") return false;
  if (plan.reason !== "keyUnavailable" && plan.reason !== "keyMissing") return false;
  return /mac/i.test(platform);
}
