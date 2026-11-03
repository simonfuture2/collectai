/** Where the main Scan buttons go: the live camera on touch devices, the upload page elsewhere. */
export function scanEntryPath(): string {
  if (typeof window === "undefined") return "/scan";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  return coarse && !!navigator.mediaDevices?.getUserMedia ? "/scan/live" : "/scan";
}
