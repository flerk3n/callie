/** Removes delivery annotations such as `[calm]` from visible voice transcripts. */
export function toVisibleTranscriptText(text: string) {
  return text
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
}
