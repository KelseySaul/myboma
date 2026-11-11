import { QueryClient } from '@tanstack/react-query';

/**
 * App-wide TanStack Query client. Polling cadence for individual queries lives in
 * src/lib/queries.ts (via the constants in polling.ts); background tabs never poll.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchIntervalInBackground: false,
      retry: 1,
    },
  },
});

/** Drops every cached query (call on sign-out so no data leaks to the next user). */
export const clearQueryCache = () => {
  queryClient.cancelQueries();
  queryClient.clear();
};
