---
name: passkey-authentication
description: Authenticate a returning user with a passkey for primary sign-in.
web-feature-ids:
  - webauthn
  - webauthn-signals
---

# Passkey Authentication

This guide details how to implement returning user authentication using discoverable credentials, both through explicit button triggers and seamless browser autofill suggestions (Conditional UI).

## Server-Side

### Options Generation

Create an endpoint that generates WebAuthn request parameters using a vetted library per standards.

1.  **Use the predefined RP ID**: Use the predefined proper RP ID as a constant string.
2.  **Generate challenge**: Generate a high-entropy, cryptographically secure random buffer, store it securely in the user's session, and encode it as Base64URL.
3.  **Discoverable Credentials mapping**: Specify an empty array `[]` for `allowCredentials`. This requests discoverable credentials, meaning the user does not need to enter their username first; the passkey provider will present available accounts.
4.  **User Verification level**: Set `userVerification: "preferred"` (or `"required"` if explicitly mandated by corporate compliance policies).
    - The requested `userVerification` constraint level MUST be persisted inside the server session record at the options endpoint, rather than passed back from the client via query strings. This allows the verification endpoint to enforce strict matching constraints safely without risk of client manipulation.

```javascript
// Options generation example (discoverable flow)
const options = {
  challenge: serverGeneratedBase64UrlChallenge, // High-entropy random challenge stored in session
  rpId: "example.com",
  allowCredentials: [], // Request discoverable passkeys
  userVerification: "preferred",
};

// Persist expected UV level to user session
req.session.expectedUserVerification = "preferred";
```

### Verification Endpoint

Securely verify the assertion returned by the client to authenticate the user:

1.  **Validate session challenge**: Enforce strict challenge matching between the client response and the expected challenge stored in the session.
2.  **Enforce UV Preferences**:
    - Allow UV-less authenticators (e.g., authenticator screen locks disabled) if the session's `expectedUserVerification` requested `"preferred"`, by passing `requireUserVerification: false` to your server-side verification library. If requested `"required"`, enforce biometrics/PIN entry strictly.
3.  **Clean Server Error 404**: If the credential ID returned by the client is not found in the database, return an explicit HTTP `404` error so the client can trigger the Signal API. Reserve `404` for this case only: answer challenge, signature, or user-verification failures with a different status (for example `400` or `401`), because the client treats `404` as proof that the credential no longer exists.

## Client-Side Logic

### HTML Form Annotation

Annotate your username and password inputs to natively leverage Conditional UI. Autocomplete tokens combine the webauthn spec parameters, and autofocus triggers the browser autofill popup immediately when the input is focused.

```html
<!-- Autocomplete tokens must contain webauthn space-separated -->
<form id="signin-form">
  <input
    type="text"
    name="username"
    autocomplete="username webauthn"
    autofocus
    data-testid="username-field"
  />
  <input type="password" name="password" autocomplete="current-password" />
  <button type="submit">Sign in</button>
</form>
```

### Explicit Button Flow

Trigger passkey authentication when a user clicks a "Sign in with passkey" button. Abort any ongoing form autofill (Conditional Get) calls before invoking the passkey prompt.

### Conditional Mediation Flow (Form Autofill)

Activate form autofill suggestions on page load to offer passkey authentication natively when users focus on sign-in fields:

1.  **Feature detect**: Call `PublicKeyCredential.getClientCapabilities()` on page load and **skip signing in with passkey** if `conditionalGet` is not available.
2.  **Decode options**: Decode fetched credential JSON object with `PublicKeyCredential.parseRequestOptionsFromJSON()`.
3.  **Invoke Conditional Get**: Call `navigator.credentials.get()` with `mediation: "conditional"` and pass an `AbortController` signal. This registers autofill silently without rendering a passkey dialog.
4.  **Try/Catch Exception Segregation**: Wrap `navigator.credentials.get` call in try/catch block:
    - `NotAllowedError`: The user cancelled or timed out the passkey login prompt.
    - `AbortError`: The authentication request was cancelled programmatically.
5.  **Handle every verification outcome**: Send the assertion to the verification endpoint and branch on the result:
    - Network error (the `fetch()` promise rejects): show a retry message. The server's answer is unknown, so do NOT call the Signal API.
    - HTTP `404` (credential not found): show an error message, then call `signalUnknownCredential()` if `PublicKeyCredential.signalUnknownCredential` exists. This is the only response that proves the server has no record of the credential. The user is still unauthenticated at this point, which is the case `signalUnknownCredential()` is designed for.
    - Any other non-ok status: show an error message and do NOT call the Signal API, because the passkey may still be valid.
    - The `credentialId` parameter passed to `signalUnknownCredential()` MUST strictly be the Base64URL-encoded credential ID string (e.g., `encoded.id`), NOT the raw ArrayBuffer object `credential.rawId`. The `rpId` parameter is required and MUST match the RP ID the server uses.
6.  **Encode the response**: Encode the credential `AuthenticatorAssertionResponse` with `.toJSON()` before sending it to the server for verification.

```javascript
// optionsFetch and loginVerifyFetch are app-defined wrappers around fetch() that resolve to the Response.
// showSignedIn and showSignInError are app-defined UI helpers.
import { optionsFetch, loginVerifyFetch } from "./api.js";

// The same RP ID constant the server uses when it generates options
const rpId = "example.com";

let autofillAbortController = new AbortController();

async function fetchRequestOptions() {
  const response = await optionsFetch();
  if (!response.ok) {
    throw new Error(`Passkey options request failed with HTTP ${response.status}`);
  }
  return PublicKeyCredential.parseRequestOptionsFromJSON(await response.json());
}

// Shared by both flows: verify the assertion and handle every HTTP outcome
async function verifyAssertion(credential) {
  const encoded = credential.toJSON();

  let response;
  try {
    response = await loginVerifyFetch(encoded);
  } catch (networkErr) {
    // The server's answer is unknown, so never signal the credential as unknown here
    console.error("Verification request error:", networkErr);
    showSignInError("Could not reach the server. Try again.");
    return;
  }

  if (response.ok) {
    showSignedIn();
    return;
  }

  if (response.status === 404) {
    // The server has no record of this credential. This runs before sign-in,
    // so the user is unauthenticated, as signalUnknownCredential() expects.
    showSignInError("This passkey is no longer registered. Choose another sign-in method.");
    if (PublicKeyCredential.signalUnknownCredential) {
      try {
        await PublicKeyCredential.signalUnknownCredential({
          rpId, // RP ID must match the one defined on the server
          credentialId: encoded.id, // Base64URL-encoded credential ID
        });
      } catch (signalErr) {
        console.warn("signalUnknownCredential failed:", signalErr);
      }
    }
    return;
  }

  // Any other failure: the passkey may still be valid, so do not signal it
  showSignInError("Passkey sign-in failed. Try again.");
}

async function initializeConditionalAutofill() {
  // Feature detect Conditional Get autofill support
  const capabilities = await PublicKeyCredential.getClientCapabilities();
  if (capabilities.conditionalGet !== true) {
    return;
  }

  let credential;
  try {
    const publicKey = await fetchRequestOptions();
    // Initiate Conditional UI form autofill suggestions
    credential = await navigator.credentials.get({
      publicKey,
      signal: autofillAbortController.signal,
      mediation: "conditional",
    });
  } catch (err) {
    // Silently swallow expected client WebAuthn exceptions
    if (["NotAllowedError", "AbortError"].includes(err.name)) {
      return;
    }
    console.error("Unexpected conditional get error:", err);
    return;
  }

  await verifyAssertion(credential);
}

async function triggerButtonAuthentication() {
  // Abort any pending Conditional Get call to prevent passkey prompt collisions
  autofillAbortController.abort();
  autofillAbortController = new AbortController(); // Reset controller for next triggers

  let credential;
  try {
    const publicKey = await fetchRequestOptions();
    // Passkey explicit prompt trigger
    credential = await navigator.credentials.get({
      publicKey,
      signal: autofillAbortController.signal,
    });
  } catch (err) {
    if (err.name === "NotAllowedError") {
      console.log("User cancelled passkey login.");
    } else if (err.name === "AbortError") {
      console.log("The authentication operation was aborted.");
    } else {
      console.error("Passkey sign-in error:", err);
      showSignInError("Passkey sign-in is unavailable right now. Try again.");
    }
    // Re-arm Conditional autofill Suggestions after cancelled explicit button prompts
    initializeConditionalAutofill();
    return; // Safe exit
  }

  await verifyAssertion(credential);
}

// Trigger Conditional Get on load
window.addEventListener("DOMContentLoaded", initializeConditionalAutofill);
```

## Fallback Strategies

### Passkey feature detection fallback

{{ BASELINE_STATUS("webauthn", "api.PublicKeyCredential.getClientCapabilities_static") }}

Import `webauthn-polyfills` once, before any WebAuthn call. The polyfill only installs `PublicKeyCredential.getClientCapabilities()` in browsers that lack it, and corrects the result on Safari 17.4–18.3, which reports `conditionalMediation` instead of `conditionalGet`. Browsers covered by the Baseline status above keep their native implementation. After the import, you can call `getClientCapabilities()` wherever `PublicKeyCredential` exists.

```js 
import 'webauthn-polyfills';
``` 

### Signal API Synchronization Fallback

{{ BASELINE_STATUS("webauthn-signals") }}

The WebAuthn Signal API (`webauthn-signals`) is a progressive optimization used to keep password managers in sync with the server credential state.

- **Fallback Experience**: Gate every call with `if (PublicKeyCredential.signalUnknownCredential)`, in both the Conditional UI and the explicit button flows. `webauthn-polyfills` does not add the Signal API methods. If they are unsupported (for example in Firefox), skip the call; the sign-in error message still tells the user what happened.

### Easy JSON Serialization Fallback

{{ BASELINE_STATUS("webauthn", "api.PublicKeyCredential.parseRequestOptionsFromJSON_static") }}

Import `webauthn-polyfills` once, before any WebAuthn call. The polyfill only installs `PublicKeyCredential.parseRequestOptionsFromJSON()` and `PublicKeyCredential.prototype.toJSON()` in browsers that lack them; browsers covered by the Baseline status above keep their native implementations. After the import, you can call both methods wherever `PublicKeyCredential` exists.

```js 
import 'webauthn-polyfills';
``` 
