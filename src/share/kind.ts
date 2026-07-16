/**
 * Which app opens a shared item. Driven by the filename extension, with a
 * content sniff so legacy checklists stored without a `.list` suffix still open
 * in the todo app rather than the text editor.
 */
export function kindOf(name: string, content: string): "list" | "text" {
  if (/\.list$/i.test(name)) return "list";
  const hasExtension = /\.[a-z0-9]+$/i.test(name);
  const looksLikeChecklist = content
    .split("\n")
    .some((line) => /^\s*\[[ xX]\]/.test(line));
  return !hasExtension && looksLikeChecklist ? "list" : "text";
}
