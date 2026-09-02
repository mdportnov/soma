import { describe, expect, it } from "vitest";
import {
  isMacKeychainSigningCase,
  isPlaintextImplausible,
  planAfterFailedUnlock,
  planStartup,
  PROBE_FAILED_PLAN,
  type BlockedReason,
  type StartupPlan,
  type VaultState,
} from "./startup-gate";

/** A machine with no encryption ever enabled. */
const plain: VaultState = {
  vaultExists: false,
  plaintextExists: true,
  plaintextSize: 900_000,
  vaultSize: 0,
  attachmentsVaultExists: false,
  mode: null,
  headerReadable: true,
  headerError: null,
  keychainKeyStatus: "missing",
  keychainError: null,
  dataDir: "/tmp/com.soma.health",
};

/** A cleanly-locked keychain-mode install: vault present, no plaintext. */
const locked: VaultState = {
  ...plain,
  vaultExists: true,
  plaintextExists: false,
  plaintextSize: 0,
  vaultSize: 946_242,
  attachmentsVaultExists: true,
  mode: "keychain",
  keychainKeyStatus: "present",
};

/** A crashed session: the vault is still there and a full live database too. */
const uncleanExit: VaultState = { ...locked, plaintextExists: true, plaintextSize: 1_000_000 };

function reasonOf(plan: StartupPlan) {
  return plan.action === "blocked" ? plan.reason : null;
}

describe("planStartup", () => {
  it("boots normally when no vault exists", () => {
    expect(planStartup(plain)).toEqual({ action: "boot", restoreAttachments: false });
  });

  it("boots on a genuine first run — no vault, no database", () => {
    expect(planStartup({ ...plain, plaintextExists: false })).toEqual({
      action: "boot",
      restoreAttachments: false,
    });
  });

  it("unlocks with the keychain key when one is available", () => {
    expect(planStartup(locked)).toEqual({ action: "unlockKeychain" });
  });

  // ── the regression this module exists for ────────────────────────────────

  it("never boots a fresh database while a vault is on disk", () => {
    const hostile: VaultState[] = [
      { ...locked, keychainKeyStatus: "missing" },
      { ...locked, keychainKeyStatus: "unavailable", keychainError: "denied" },
      { ...locked, headerReadable: false, mode: null, headerError: "truncated" },
      { ...locked, mode: null },
    ];
    for (const state of hostile) {
      const plan = planStartup(state);
      expect(plan.action, JSON.stringify(state)).toBe("blocked");
    }
  });

  it("blocks rather than booting when the state probe itself failed", () => {
    // The old gate assumed "no encryption" here and created an empty database.
    expect(PROBE_FAILED_PLAN).toEqual({
      action: "blocked",
      reason: "probeFailed",
      detail: null,
    });
  });

  it("names the keychain key missing and unavailable as different problems", () => {
    expect(reasonOf(planStartup({ ...locked, keychainKeyStatus: "missing" }))).toBe("keyMissing");
    expect(reasonOf(planStartup({ ...locked, keychainKeyStatus: "unavailable" }))).toBe(
      "keyUnavailable",
    );
  });

  it("passes the keychain error through so the screen can show it", () => {
    const plan = planStartup({
      ...locked,
      keychainKeyStatus: "unavailable",
      keychainError: "User interaction is not allowed.",
    });
    expect(plan).toEqual({
      action: "blocked",
      reason: "keyUnavailable",
      detail: "User interaction is not allowed.",
    });
  });

  it("blocks on an unreadable vault header and reports why", () => {
    const plan = planStartup({
      ...locked,
      headerReadable: false,
      mode: null,
      headerError: "This vault was created by a newer version of Soma (format v3)",
    });
    expect(plan).toEqual({
      action: "blocked",
      reason: "vaultUnreadable",
      detail: "This vault was created by a newer version of Soma (format v3)",
    });
  });

  // ── passphrase mode ──────────────────────────────────────────────────────

  it("always prompts in passphrase mode", () => {
    expect(planStartup({ ...locked, mode: "passphrase", keychainKeyStatus: "missing" })).toEqual({
      action: "promptPassphrase",
      verifyOnly: false,
    });
  });

  it("verifies rather than decrypts when a newer plaintext database survived", () => {
    expect(planStartup({ ...uncleanExit, mode: "passphrase" })).toEqual({
      action: "promptPassphrase",
      verifyOnly: true,
    });
  });

  // ── the unclean-exit case ────────────────────────────────────────────────

  it("keeps a newer plaintext database instead of decrypting the older vault over it", () => {
    expect(planStartup(uncleanExit).action).toBe("boot");
  });

  it("unpacks attachments that are still sealed even when the database is not", () => {
    expect(planStartup(uncleanExit)).toEqual({ action: "boot", restoreAttachments: true });
    expect(planStartup({ ...uncleanExit, attachmentsVaultExists: false })).toEqual({
      action: "boot",
      restoreAttachments: false,
    });
  });

  // ── an empty database appearing next to a full vault ─────────────────────

  it("refuses to boot on a plaintext database far too small to be the user's", () => {
    // The shape of the incident: a 4 KB freshly-migrated database sitting next
    // to a 946 KB vault. The old gate opened it and offered onboarding.
    const plan = planStartup({ ...uncleanExit, plaintextSize: 4_096 });
    expect(plan).toMatchObject({ action: "blocked", reason: "plaintextSuspicious" });
  });

  it("blocks on a suspicious plaintext database in passphrase mode too", () => {
    const plan = planStartup({ ...uncleanExit, mode: "passphrase", plaintextSize: 4_096 });
    expect(reasonOf(plan)).toBe("plaintextSuspicious");
  });

  it("accepts a live database that grew past the vault, or shrank only a little", () => {
    for (const plaintextSize of [946_242, 1_200_000, 900_000, 473_121]) {
      const plan = planStartup({ ...uncleanExit, plaintextSize });
      expect(plan.action, `${plaintextSize}`).toBe("boot");
    }
  });

  it("never calls a plaintext database suspicious when there is no vault", () => {
    expect(isPlaintextImplausible({ ...plain, plaintextSize: 1 })).toBe(false);
    expect(isPlaintextImplausible({ ...locked, plaintextExists: false })).toBe(false);
    expect(isPlaintextImplausible({ ...uncleanExit, vaultSize: 0 })).toBe(false);
  });
});

describe("planAfterFailedUnlock", () => {
  it("blocks and carries the message, whatever was thrown", () => {
    expect(planAfterFailedUnlock(new Error("keychain refused"))).toEqual({
      action: "blocked",
      reason: "unlockFailed",
      detail: "keychain refused",
    });
    expect(planAfterFailedUnlock("plain string")).toEqual({
      action: "blocked",
      reason: "unlockFailed",
      detail: "plain string",
    });
  });
});

describe("isMacKeychainSigningCase", () => {
  const blocked = (reason: BlockedReason): StartupPlan => ({
    action: "blocked",
    reason,
    detail: null,
  });

  it("explains the re-signing trap only where it applies", () => {
    expect(isMacKeychainSigningCase(blocked("keyUnavailable"), "MacIntel")).toBe(true);
    expect(isMacKeychainSigningCase(blocked("keyMissing"), "MacIntel")).toBe(true);
    expect(isMacKeychainSigningCase(blocked("keyUnavailable"), "Win32")).toBe(false);
    expect(isMacKeychainSigningCase(blocked("vaultUnreadable"), "MacIntel")).toBe(false);
    expect(isMacKeychainSigningCase({ action: "unlockKeychain" }, "MacIntel")).toBe(false);
  });
});
