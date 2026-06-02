const apiBaseUrl = () => (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

const publicRequest = async <T>(path: string, body: unknown): Promise<T> => {
  const response = await fetch(`${apiBaseUrl()}/api${path}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload.error === 'string' ? payload.error : 'Request failed. Please try again.',
    );
  }

  return payload as T;
};

export const joinWaitlist = (email: string) =>
  publicRequest<{status: 'subscribed'}>('/waitlist', {email, source: 'landing-page'});

export const unsubscribeFromWaitlist = (input: {email?: string; token?: string}) =>
  publicRequest<{status: 'unsubscribed'}>('/waitlist/unsubscribe', input);
