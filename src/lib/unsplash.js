/**
 * Unsplash API utility for Krysed
 * Fetches a random crisis-themed background image.
 * Gracefully falls back to null if the Access Key is not set.
 */

const UNSPLASH_ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY;

/**
 * Fetch a random landscape photo from Unsplash matching a search keyword.
 * @param {string} keyword - e.g. "flood disaster", "snowstorm mountain"
 * @returns {Promise<{ url: string, credit: { name: string, link: string } } | null>}
 */
export async function fetchCrisisBackground(keyword) {
  if (!UNSPLASH_ACCESS_KEY) {
    console.info('[Unsplash] No access key found — using gradient fallback.');
    return null;
  }

  try {
    const params = new URLSearchParams({
      query: keyword,
      orientation: 'landscape',
      content_filter: 'low',
    });

    const res = await fetch(
      `https://api.unsplash.com/photos/random?${params.toString()}`,
      {
        headers: {
          Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
          'Accept-Version': 'v1',
        },
      }
    );

    if (!res.ok) {
      console.warn(`[Unsplash] HTTP ${res.status} for keyword "${keyword}"`);
      return null;
    }

    const data = await res.json();

    return {
      url: data.urls?.regular ?? null,
      credit: {
        name: data.user?.name ?? 'Unsplash',
        link: data.user?.links?.html ?? 'https://unsplash.com',
      },
    };
  } catch (err) {
    console.error('[Unsplash] Fetch failed:', err);
    return null;
  }
}
