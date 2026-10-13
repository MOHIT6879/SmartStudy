export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

// Global fetch enhancer:
// 1. Automatically strips double slashes from URLs (e.g. dev//api -> dev/api)
// 2. Injects 'ngrok-skip-browser-warning: true' header so ngrok's free tier interstitial page never blocks API calls
if (typeof window !== 'undefined' && window.fetch) {
  const originalFetch = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

    // Clean up accidental double slashes in URL path (preserve protocol https://)
    if (typeof input === 'string') {
      input = input.replace(/([^:]\/)\/+/g, '$1');
      url = input;
    }

    // If calling ngrok tunnel or configured API_BASE_URL, attach ngrok header
    if (url.includes('ngrok') || (API_BASE_URL && url.startsWith(API_BASE_URL))) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : {}));
      if (!headers.has('ngrok-skip-browser-warning')) {
        headers.set('ngrok-skip-browser-warning', 'true');
      }
      return originalFetch(input, { ...init, headers });
    }

    return originalFetch(input, init);
  };
}
