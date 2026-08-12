import { chromium } from "playwright-core";
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
for (const opt of [
  { name: "proxy-option", args: ["--no-sandbox"], proxy: { server: "http://127.0.0.1:43591" } },
  { name: "proxy-arg", args: ["--no-sandbox", "--proxy-server=http://127.0.0.1:43591"] },
]) {
  try {
    const b = await chromium.launch({ executablePath: EXE, headless: true, args: opt.args, proxy: opt.proxy });
    const p = await b.newPage();
    const r = await p.goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 30000 });
    console.log(opt.name, "→ example.com status:", r?.status());
    await b.close();
  } catch (e) {
    console.log(opt.name, "→ ERROR:", e.message.split("\n")[0]);
  }
}
