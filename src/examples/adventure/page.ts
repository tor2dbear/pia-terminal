import "../../style.css";
import { mountAdventure } from "./adventure.js";

// Browser entry for the adventure demo page (/adventure/). It reuses PIA's
// terminal styling and mounts the adventure onto the shared engine. #screen is
// now a multiplexer shell (a flex column whose scroll/padding live on
// `.term-pane`), so give this single terminal a pane to mount into.
const root = document.getElementById("screen");
if (root) {
  const pane = document.createElement("div");
  pane.className = "term-pane";
  root.append(pane);
  mountAdventure(pane);
}
