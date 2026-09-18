/**
 * Guest Token Manager
 * 
 * Manages guest tokens for non-authenticated users.
 * - Stores guest token from response headers to localStorage and cookies
 * - Automatically adds guest token to all fetch requests via headers
 * - Adds guest token to all form submissions as a hidden field
 * - Ensures guest cart persists even after page reload and across login
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'guestToken';
  const LEGACY_STORAGE_KEY = 'guest_wishlist_token';
  const COOKIE_NAME = 'guest_token';
  const HEADER_NAME = 'x-guest-token';
  const FORM_FIELD_NAME = 'guest_token';

  /**
   * Get the stored guest token from localStorage
   */
  function getStoredToken() {
    try {
      const token = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || null;
      if (token && !localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, token);
      }
      return token;
    } catch (e) {
      console.warn('Guest token storage unavailable:', e);
      return null;
    }
  }

  /**
   * Store guest token to localStorage AND as a cookie
   */
  function storeToken(token) {
    if (!token) return;
    try {
      // Store in localStorage
      localStorage.setItem(STORAGE_KEY, token);
      localStorage.setItem(LEGACY_STORAGE_KEY, token);
      
      // Also store as a cookie (sent automatically with all requests)
      document.cookie = `${COOKIE_NAME}=${token}; path=/; max-age=2592000; SameSite=Lax`;
      
      console.log('[GuestToken] Stored token:', token);
    } catch (e) {
      console.warn('Failed to store guest token:', e);
    }
  }

  /**
   * Intercept form submissions to add guest token
   */
  function interceptFormSubmissions() {
    document.addEventListener('submit', function(event) {
      const form = event.target;
      if (!form || form.tagName !== 'FORM') return;
      
      const token = getStoredToken();
      if (!token) return;
      
      // Check if token field already exists
      let tokenInput = form.querySelector(`input[name="${FORM_FIELD_NAME}"]`);
      
      // If not, create and add it
      if (!tokenInput) {
        tokenInput = document.createElement('input');
        tokenInput.type = 'hidden';
        tokenInput.name = FORM_FIELD_NAME;
        tokenInput.value = token;
        form.appendChild(tokenInput);
        console.log('[GuestToken] Added token field to form:', form.action);
      } else {
        // Update existing field
        tokenInput.value = token;
      }
    }, true); // Use capture phase to run before other handlers
  }

  /**
   * Capture guest token from response headers
   */
  function captureTokenFromResponse(response) {
    if (!response || typeof response.headers === 'undefined') return;

    try {
      // For fetch API Response object
      if (typeof response.headers.get === 'function') {
        const token = response.headers.get(HEADER_NAME);
        if (token) {
          storeToken(token);
        }
      }
      // For XMLHttpRequest getResponseHeader
      else if (typeof response.getResponseHeader === 'function') {
        const token = response.getResponseHeader(HEADER_NAME);
        if (token) {
          storeToken(token);
        }
      }
    } catch (e) {
      console.warn('Failed to capture guest token from response:', e);
    }
  }

  /**
   * Add guest token to fetch headers
   */
  function addTokenToFetchHeaders(options = {}) {
    const token = getStoredToken();
    if (!token) return options;

    const headers = options.headers || {};
    headers[HEADER_NAME] = token;

    return { ...options, headers };
  }

  /**
   * Intercept fetch API
   */
  function interceptFetchAPI() {
    const originalFetch = window.fetch;

    window.fetch = function(...args) {
      let [resource, config] = args;

      // Add token to request
      config = addTokenToFetchHeaders(config);

      // Call original fetch and capture token from response
      return originalFetch.apply(this, [resource, config]).then(response => {
        // Clone response so we can read headers without consuming body
        const responseClone = response.clone();
        captureTokenFromResponse(responseClone);
        return response;
      });
    };
  }

  /**
   * Intercept XMLHttpRequest
   */
  function interceptXHR() {
    const OriginalXHR = window.XMLHttpRequest;
    const XHRPrototype = OriginalXHR.prototype;

    // Store original setRequestHeader
    const originalSetRequestHeader = XHRPrototype.setRequestHeader;

    XHRPrototype.setRequestHeader = function(header, value) {
      return originalSetRequestHeader.call(this, header, value);
    };

    // Intercept open() to add token
    const originalOpen = XHRPrototype.open;

    XHRPrototype.open = function(method, url, ...args) {
      this._guestTokenRequest = true;
      return originalOpen.apply(this, [method, url, ...args]);
    };

    // Intercept send() to add token header
    const originalSend = XHRPrototype.send;

    XHRPrototype.send = function(...args) {
      if (this._guestTokenRequest) {
        const token = getStoredToken();
        if (token) {
          this.setRequestHeader(HEADER_NAME, token);
        }
      }
      return originalSend.apply(this, args);
    };

    // Capture token from response headers
    const originalGetResponseHeader = XHRPrototype.getResponseHeader;

    XHRPrototype.getResponseHeader = function(header) {
      if (header.toLowerCase() === HEADER_NAME.toLowerCase()) {
        const token = originalGetResponseHeader.call(this, HEADER_NAME);
        if (token) {
          storeToken(token);
        }
        return token;
      }
      return originalGetResponseHeader.call(this, header);
    };

    // Also capture from getAllResponseHeaders
    const originalGetAllResponseHeaders = XHRPrototype.getAllResponseHeaders;

    XHRPrototype.getAllResponseHeaders = function() {
      const allHeaders = originalGetAllResponseHeaders.call(this);
      const match = allHeaders.match(new RegExp(`${HEADER_NAME}:\\s*([^\\r\\n]+)`, 'i'));
      if (match && match[1]) {
        storeToken(match[1]);
      }
      return allHeaders;
    };
  }

  /**
   * Initialize guest token manager
   */
  function init() {
    // Only initialize for non-authenticated users
    // Check if user is logged in (adjust selector based on your app)
    const isLoggedIn = document.querySelector('[data-user-id]') !== null || 
                       document.body.classList.contains('authenticated');

    if (isLoggedIn) {
      // User is logged in, no need for guest token management
      return;
    }

    // Intercept fetch and XMLHttpRequest
    try {
      interceptFetchAPI();
      interceptXHR();
    } catch (e) {
      console.error('Failed to initialize fetch/XHR interceptors:', e);
    }

    // Intercept form submissions to add guest token field
    try {
      interceptFormSubmissions();
    } catch (e) {
      console.error('Failed to initialize form interceptor:', e);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export for manual use if needed
  window.GuestTokenManager = {
    getToken: getStoredToken,
    storeToken: storeToken,
    clearToken: () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch (e) {
        console.warn('Failed to clear guest token:', e);
      }
    }
  };

})();
