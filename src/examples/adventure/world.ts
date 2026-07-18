/**
 * A tiny text-adventure world. Pure game state and rules — no I/O, no DOM. The
 * commands in `adventure.ts` drive this and print its messages, exactly the way
 * PIA's commands drive the VFS. It exists to prove the terminal engine runs an
 * app that shares *none* of PIA's vocabulary.
 */

interface Room {
  name: string;
  description: string;
  /** direction → room id */
  exits: Record<string, string>;
  items: string[];
  /** If set, entering requires carrying this item. */
  locked?: { needs: string; message: string };
}

const ROOMS: Record<string, Room> = {
  hall: {
    name: "Entrance Hall",
    description: "A dim stone hall, colder than it should be. A doorway yawns to the north.",
    exits: { north: "library" },
    items: [],
  },
  library: {
    name: "Dusty Library",
    description:
      "Shelves of rotting books lean at odd angles. A brass KEY glints on a lectern. Ways lead south and east.",
    exits: { south: "hall", east: "vault" },
    items: ["key"],
  },
  vault: {
    name: "The Vault",
    description: "A cramped stone vault. A heap of glittering TREASURE waits in the corner.",
    exits: { west: "library" },
    items: ["treasure"],
    locked: { needs: "key", message: "The vault door is locked. You'll need a key." },
  },
};

const DIRECTIONS: Record<string, string> = {
  n: "north",
  s: "south",
  e: "east",
  w: "west",
  north: "north",
  south: "south",
  east: "east",
  west: "west",
};

export class World {
  private room = "hall";
  private readonly carried = new Set<string>();
  won = false;

  /** Lines describing the current room. */
  look(): string[] {
    const r = ROOMS[this.room];
    const lines = [r.name, r.description];
    if (r.items.length) lines.push(`You see: ${r.items.join(", ")}.`);
    lines.push(`Exits: ${Object.keys(r.exits).join(", ")}.`);
    return lines;
  }

  /** Move in a direction; returns the message to print. */
  go(dir: string): string {
    const canon = DIRECTIONS[dir.toLowerCase()];
    if (!canon) return `"${dir}" is not a direction.`;
    const dest = ROOMS[this.room].exits[canon];
    if (!dest) return `You can't go ${canon} from here.`;
    const lock = ROOMS[dest].locked;
    if (lock && !this.carried.has(lock.needs)) return lock.message;
    this.room = dest;
    return this.look().join("\n");
  }

  /** Pick up an item in the room; returns the message to print. */
  take(item: string): string {
    const r = ROOMS[this.room];
    const name = item.toLowerCase();
    const i = r.items.indexOf(name);
    if (i === -1) return `There is no ${name} here.`;
    r.items.splice(i, 1);
    this.carried.add(name);
    if (name === "treasure") {
      this.won = true;
      return "You heave the treasure into your pack. You win! 🏆  (type 'look' to keep exploring)";
    }
    return `You take the ${name}.`;
  }

  inventory(): string {
    return this.carried.size ? `Carrying: ${[...this.carried].join(", ")}.` : "You are carrying nothing.";
  }
}
