/**
 * PIA's little `/etc` — a small system tree so the machine has somewhere for its
 * own files, the way a real Unix box does. Step 1 of the permissions idea (see
 * roadmap/permissions.md): the files *exist* and are *used* (the boot greeting
 * reads /etc/motd), but nothing is write-protected yet — `rm /etc/motd` still
 * works. Read-only enforcement and `sudo` elevation are later steps.
 */
import { VERSION } from "../meta.js";
import type { VFS } from "../vfs/vfs.js";

/**
 * The default message-of-the-day — the greeting the boot sequence prints. Seeded
 * into /etc/motd (yours to edit), and the fallback boot falls back to if the
 * file has been removed.
 */
export const DEFAULT_MOTD = [
  "hi. type 'help' to begin.",
  "new here? try `demo` for a tour, `tutor` to learn, or `man pia`.",
].join("\n");

/** Contents of /etc/os-release — machine-owned OS identity, in the standard
 * `KEY="value"` shape, refreshed to the running version each boot so
 * `cat /etc/os-release` and `neofetch` always agree. */
function osRelease(): string {
  return [
    'NAME="PIA"',
    'PRETTY_NAME="PIA — Personal Integrated Applications"',
    `VERSION="${VERSION}"`,
    "ID=pia",
    "HOME_URL=https://pia.tor2dbear.com",
    "",
  ].join("\n");
}

/**
 * Seed the /etc system tree. Two files, two policies:
 *  - `/etc/motd` is yours — seeded only when missing, so your edits survive, and
 *    it self-heals if you delete it (restored on the next boot).
 *  - `/etc/os-release` is the machine's — always refreshed to the running
 *    version, so it can't drift.
 * Idempotent: safe to call on every boot (guest, returning guest, logged-in).
 */
export function seedSystemFiles(vfs: VFS): void {
  // Nothing here is write-protected yet, so a user can have put anything at these
  // paths (`mkdir /etc/motd`, a file called `/etc`). Guard every step so a
  // conflicting node type is left alone rather than throwing — this runs at boot,
  // and an uncaught error would freeze the terminal before the prompt appears.
  const etc = vfs.getNode("/etc");
  if (etc && etc.type !== "dir") return; // a non-dir occupies /etc — leave it, don't crash boot
  vfs.mkdirp("/etc");

  // motd: seed only when the path is empty — a user's own file (edits survive) or
  // a stray directory there is both left untouched.
  if (!vfs.getNode("/etc/motd")) vfs.writeFile("/etc/motd", `${DEFAULT_MOTD}\n`);

  // os-release: machine-owned, refreshed each boot — unless a directory sits
  // there, in which case there's nothing safe to do but skip it.
  if (vfs.getNode("/etc/os-release")?.type !== "dir") vfs.writeFile("/etc/os-release", osRelease());
}

/** Read /etc/motd for the boot greeting; empty string if it isn't there. */
export function readMotd(vfs: VFS): string {
  const node = vfs.getNode("/etc/motd");
  return node && node.type === "file" ? vfs.readFile("/etc/motd") : "";
}
