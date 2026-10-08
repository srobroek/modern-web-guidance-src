---
name: passkey-reauthentication
description: Verify a signed-in user's identity using their existing passkeys before a sensitive action.
web-feature-ids:
  - webauthn
---

# Passkey Reauthentication

This delta-focused guide details how to implement step-up authentication or re-verification for a signed-in user before they perform sensitive account changes (e.g. passwords updates, financial transfers).

## Delta Flow Architecture

Unlike regular authentication, passkey reauthentication constrains passkey dialog prompts strictly to the logged-in user's pre-registered credentials to prevent account-mixing or passkey spoofing during active sessions.

## Server-Side

### Options Generation Delta

Create an endpoint that populates the allowed credentials parameters specifically for the active, known user:

**Constrain Credentials**: Populate the `allowCredentials` options array with specific `PublicKeyCredentialDescriptor` records mapping all registered credential IDs for the signed-in user. Leaving this empty or omitting it regresses to discoverable credentials, violating session safety.

**Reject users without passkeys**: If the signed-in user has no registered passkeys, the mapped list is empty. Do NOT send options with an empty `allowCredentials`; return an error (for example HTTP `409`) so the client offers another step-up method, such as a password or one-time code.

**Require user verification**: Set `userVerification: "required"` so the authenticator must verify the user with biometrics, PIN, or the device screen lock, not only a touch. Store the expected level in the session and enforce it in the verification endpoint.

```javascript
// Node.js step-up options generation example
router.post("/api/reauth/options", enforceActiveSession, async (req, res) => {
  const userPasskeys = await db.findCredentialsByUserId(req.user.id);
  if (userPasskeys.length === 0) {
    // An empty allowCredentials would accept any discoverable passkey
    return res.status(409).json({ error: "No passkeys registered for this account." });
  }

  const options = {
    challenge: serverGeneratedBase64UrlChallenge, // Random challenge stored in user session
    rpId: "example.com",
    // Enforce allowance strictly limited to the user's credentials list
    allowCredentials: userPasskeys.map((cred) => ({
      type: "public-key",
      id: cred.id,
      transports: cred.transports, // Speeds up resolution by indicating platform transports
    })),
    userVerification: "required", // A touch alone is not enough for a sensitive action
  };
  req.session.expectedUserVerification = "required";
  return res.json(options);
});
```

### Verification Endpoint Delta

Verify the assertion returned by the client:

**Verify Account Ownership**: The verification endpoint MUST explicitly verify that the resulting authenticated credential ID returned by the client resolves to a stored credential record whose associated user ID strictly matches the active signed-in user (`storedCredential.passkeyUserId === req.user.id`). If a valid passkey of a _different_ user is returned, authentication MUST be rejected immediately.

**Enforce User Verification**: Because the session expects `"required"`, pass `requireUserVerification: true` to your server-side verification library so an assertion without the User Verified (UV) flag is rejected.

## Client-Side Flow Deltas

Applications choose from two reauthentication interfaces depending on the transaction UI:

### A. Button Flow (No Input Fields)

Trigger reauthentication when a user presses a "Verify Identity" or "Proceed with Transaction" button.

```html
<button id="reauth-btn" data-testid="reauth-button">Confirm Transaction</button>
```

```javascript
// showTransactionSuccessUI, showAlternativeStepUp and showReauthError are app-defined UI helpers

// The same RP ID constant the server uses when it generates options
const rpId = "example.com";

let reauthAbortController = new AbortController();

async function triggerButtonReauth() {
  // Abort any background suggestion flows to avoid passkey prompt collisions
  reauthAbortController.abort();
  reauthAbortController = new AbortController();

  const optionsResponse = await fetch("/api/reauth/options", {
    method: "POST",
  });
  if (optionsResponse.status === 409) {
    // The user has no passkeys: offer another step-up method
    showAlternativeStepUp();
    return;
  }
  if (!optionsResponse.ok) {
    showReauthError("Could not start verification. Try again.");
    return;
  }
  const optionsJSON = await optionsResponse.json();
  const publicKey =
    PublicKeyCredential.parseRequestOptionsFromJSON(optionsJSON);

  try {
    const credential = await navigator.credentials.get({
      publicKey,
      signal: reauthAbortController.signal,
    });

    if (credential) {
      const encodedCredential = credential.toJSON();
      const verifyResponse = await fetch("/api/reauth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(encodedCredential),
      });

      if (verifyResponse.ok) {
        showTransactionSuccessUI();
        return;
      }
      showReauthError("Verification failed. Try again.");
      if (verifyResponse.status === 404 && PublicKeyCredential.signalUnknownCredential) {
        await PublicKeyCredential.signalUnknownCredential({
          rpId, // RP ID must match the one defined on the server
          credentialId: encodedCredential.id
        });
      }
    }
  } catch (err) {
    if (err.name === "NotAllowedError") {
      console.log("User cancelled reauthentication.");
    }
  }
}

document
  .getElementById("reauth-btn")
  .addEventListener("click", triggerButtonReauth);
```

## Fallback Strategies

### Passkey feature detection fallback

{{ BASELINE_STATUS("webauthn", "api.PublicKeyCredential.getClientCapabilities_static") }}

Import `webauthn-polyfills` once, before any WebAuthn call. The polyfill only installs `PublicKeyCredential.getClientCapabilities()` in browsers that lack it, and corrects the result on Safari 17.4–18.3, which reports `conditionalMediation` instead of `conditionalGet`. Browsers covered by the Baseline status above keep their native implementation. After the import, you can call `getClientCapabilities()` wherever `PublicKeyCredential` exists.

```js 
import 'webauthn-polyfills';
``` 

### Easy JSON Serialization Fallback

{{ BASELINE_STATUS("webauthn", "api.PublicKeyCredential.parseRequestOptionsFromJSON_static") }}

Import `webauthn-polyfills` once, before any WebAuthn call. The polyfill only installs `PublicKeyCredential.parseRequestOptionsFromJSON()` and `PublicKeyCredential.prototype.toJSON()` in browsers that lack them; browsers covered by the Baseline status above keep their native implementations. After the import, you can call both methods wherever `PublicKeyCredential` exists.

```js 
import 'webauthn-polyfills';
``` 
