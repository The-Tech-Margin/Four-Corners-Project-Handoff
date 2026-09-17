/**
 * Robust clipboard copy with a legacy fallback.
 *
 * `navigator.clipboard.writeText` can reject for reasons unrelated to user
 * intent: the document isn't focused, the page is in an iframe missing the
 * `clipboard-write` permission, or the browser is older than 2018. Fall
 * back to a hidden-textarea + `document.execCommand("copy")` so a missing
 * Clipboard API doesn't cost the user the copy.
 *
 * Returns true if either path succeeded.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to execCommand fallback
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
