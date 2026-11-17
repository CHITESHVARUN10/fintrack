// Registry of lazily-loaded route chunks, keyed by pathname.
// App.tsx registers each page loader here once; the sidebar warms a chunk on
// hover/focus so navigation does not wait on the network.
type Prefetcher = () => Promise<unknown>

const prefetchers = new Map<string, Prefetcher>()

export function registerPrefetcher(path: string, prefetcher: Prefetcher) {
  prefetchers.set(path, prefetcher)
}

export function prefetchRoute(path: string) {
  prefetchers.get(path)?.().catch(() => {})
}
