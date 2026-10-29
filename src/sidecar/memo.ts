/**
 * Results that are a pure function of a file's bytes.
 *
 * `inspect` and `pmi` are deterministic in the model and cost seconds on a large assembly
 * (an `inspect` of a 34 MB part is around half a minute), and the assistant asks for the
 * same one on every turn of a conversation. Recomputing it is the single largest avoidable
 * cost in the loop.
 *
 * The key is `(path, revision)` because that pair *is* the input: `revision` is a hash of
 * the file's bytes, so a changed file cannot produce a hit, and no invalidation logic is
 * needed to be correct — only to be tidy. The entry outlives the resident model on purpose:
 * the store holds one model at a time, and two files the user alternates between should not
 * evict each other's summaries.
 *
 * Two rules for a cached value: it must be a complete answer for its key (not a partial
 * read that a later call would extend), and callers must treat what they get back as
 * read-only — the same object is handed to every caller.
 */

/** Cached values, keyed by `path \0 revision \0 name`. */
const cache = new Map<string, unknown>();

/**
 * Read a memoised value, computing it only on the first request.
 * @param filePath - canonical path of the model.
 * @param revision - content revision the value describes.
 * @param name - what is being memoised, so two different answers cannot collide.
 * @param run - how to compute the value, called at most once per key.
 * @returns the cached or freshly computed value.
 */
export async function memoiseByRevision<T>(
  filePath: string,
  revision: string,
  name: string,
  run: () => Promise<T>,
): Promise<T> {
  const key = `${filePath}\u0000${revision}\u0000${name}`;
  if (cache.has(key)) return cache.get(key) as T;
  const value = await run();
  cache.set(key, value);
  return value;
}
