/**
 * Normalize Firestore / number expiry to milliseconds.
 * @param {unknown} expiryTime
 * @returns {number | null}
 */
export function getExpiryTimeMs(expiryTime) {
  if (expiryTime == null) return null;
  if (typeof expiryTime === "number" && Number.isFinite(expiryTime)) {
    return expiryTime;
  }
  if (
    typeof expiryTime === "object" &&
    typeof expiryTime.toMillis === "function"
  ) {
    return expiryTime.toMillis();
  }
  return null;
}

/**
 * @param {unknown} expiryTime
 * @param {number} [currentTime]
 * @returns {"Expired" | `Expires in ${number} hrs` | null}
 */
export function formatExpiryRemainingText(expiryTime, currentTime = Date.now()) {
  const ms = getExpiryTimeMs(expiryTime);
  if (ms == null) return null;
  const remaining = ms - currentTime;
  if (remaining <= 0) return "Expired";
  const hours = Math.ceil(remaining / (60 * 60 * 1000));
  return `Expires in ${hours} hrs`;
}
