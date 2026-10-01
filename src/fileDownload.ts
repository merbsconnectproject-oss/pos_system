/**
 * Handing the browser a file the server produced.
 *
 * Shared because both callers are behind the session: a plain `<a href>` sends
 * no credentials and the shop downloads a 401, so the body has to be fetched
 * and then handed to an anchor as a blob.
 */

/** Saves a blob under `filename`, then releases the object URL. */
export const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next tick: revoking synchronously can beat the click in
  // some browsers and the file arrives empty.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/** Reads the name the server offered, falling back to a caller's default. */
export const filenameFrom = (disposition: string | null, fallback: string): string => {
  const match = disposition?.match(/filename="?([^";]+)"?/i);
  return match ? match[1] : fallback;
};

/**
 * The API's own error shape when it has one.
 *
 * A status alone tells a shop owner nothing about what to do next, and these
 * endpoints fail for reasons the operator can actually act on — an outlet that
 * has not been published yet, a bucket with no keys set.
 */
export const messageFromFailure = async (response: Response, fallback: string): Promise<string> => {
  try {
    const body = await response.json();
    return body?.message || fallback;
  } catch {
    return fallback;
  }
};
