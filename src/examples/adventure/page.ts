import "../../style.css";
import { mountAdventure } from "./adventure.js";

// Browser entry for the adventure demo page (/adventure/). It reuses PIA's
// terminal styling and mounts the adventure onto the shared engine.
const root = document.getElementById("screen");
if (root) mountAdventure(root);
