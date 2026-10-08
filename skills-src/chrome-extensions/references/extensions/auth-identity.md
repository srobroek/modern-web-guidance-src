# Authentication with chrome.identity

## Setup

```json
{
  "permissions": ["identity"],
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email"
    ]
  }
}
```

## Getting an OAuth Token

```js
async function signIn() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}
```

Or with the promise-based API (Chrome 116+):
```js
const { token } = await chrome.identity.getAuthToken({ interactive: true });
```

## Fetching User Profile

```js
async function getUserProfile(token) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Failed to fetch profile');
  return response.json();
  // Returns: { sub, name, given_name, family_name, picture, email, email_verified }
}
```

## Sign Out

```js
async function signOut(token) {
  // Remove cached token
  await chrome.identity.removeCachedAuthToken({ token });

  // Optionally revoke the token server-side
  await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
}
```

## Error Handling

```js
try {
  const { token } = await chrome.identity.getAuthToken({ interactive: true });
  const profile = await getUserProfile(token);
  displayProfile(profile);
} catch (err) {
  // Error messages are not a stable API: log them, but do not branch on their text.
  console.error('Sign-in failed:', err.message);
  showMessage('Sign-in did not complete. Try again.');
}
```

## Setting Up Google Cloud Console

1. Go to console.cloud.google.com
2. Create a project (or select existing)
3. Enable "Google People API" or "Google OAuth2 API"
4. Create OAuth 2.0 credentials → Chrome Extension type
5. Set the Application ID to your extension's ID
6. Copy the client_id to your manifest.json

### Extension ID: Development vs Production

**This is critical and often missed.** The OAuth `client_id` is tied to a specific extension ID.
The extension ID changes depending on how you load the extension:

| Context | How ID is determined |
|---------|---------------------|
| Unpacked (development) | Derived from the extension's directory path — changes if you move the folder |
| Packed (.crx) | Derived from the private key used to pack |
| Chrome Web Store | Assigned by the store, permanent |

**To get a stable ID during development that matches the store ID**, add the store item's public
key as the `"key"` field in your manifest.json:

1. Zip the extension and upload it in the Chrome Developer Dashboard (**Add new item**) without
   publishing it.
2. On the item's **Package** tab, click **View public key**.
3. Copy the text between `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----`, remove the
   newlines, and add it to your manifest:

```json
{
  "key": "MIIBIjANBgkqhk...your-public-key-here...",
  "manifest_version": 3,
  "name": "My Extension"
}
```

The unpacked extension now loads with the same ID as the store item (compare it in
`chrome://extensions`), so one OAuth client covers development and production.

Alternatively, note your unpacked extension's ID from `chrome://extensions` and configure
the OAuth client for that specific ID. Just be aware it will change if the folder moves.

**Always tell users:** if the manifest does not carry the store item's key, the store-assigned
extension ID differs from the development ID — register the store ID in the OAuth client before
release.

## Non-Google OAuth (launchWebAuthFlow)

For third-party OAuth providers (GitHub, Twitter, etc.), use the authorization code flow with
`state` and PKCE. The extension is a public client: never ship a client secret in it. If the
provider requires a secret for the code exchange, do that exchange on your backend.

```js
function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const redirectUrl = chrome.identity.getRedirectURL();
// Returns: https://<extension-id>.chromiumapp.org/

// state binds the response to this request; the PKCE verifier makes a stolen code useless.
const state = crypto.randomUUID();
const codeVerifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
const codeChallenge = base64url(new Uint8Array(digest));

const authUrl = new URL('https://provider.example/oauth/authorize'); // provider's authorize endpoint
authUrl.search = new URLSearchParams({
  client_id: 'XXX',
  redirect_uri: redirectUrl,
  response_type: 'code',
  state,
  code_challenge: codeChallenge,
  code_challenge_method: 'S256',
});

const responseUrl = await chrome.identity.launchWebAuthFlow({
  url: authUrl.href,
  interactive: true
});

const params = new URL(responseUrl).searchParams;
if (params.get('state') !== state) throw new Error('OAuth state mismatch');
const code = params.get('code');
// Exchange `code` and `codeVerifier` at the provider's token endpoint (or on your backend).
```
