---
name: passkey-conditional-create
description: Silently register a passkey for an existing user after a successful password login.
web-feature-ids:
  - webauthn
  - webauthn-signals
---

# Passkey Conditional Create (Post-Login Promotion)

This guide details how to automatically and silently register a passkey for a user immediately after a successful password-based sign-in, minimizing friction and boosting passkey adoption.

## The Right Trigger Moment

Automatic passkey creation (also known as Conditional Create or silent post-login promotion) MUST only be triggered **immediately after a successful, full sign-in that involved a password**. 
* Do not attempt conditional creation for passwordless flows (e.g., magic links, SMS OTP, or identity federation).
* If multi-factor authentication is required, you MUST wait until all factors have succeeded before initiating conditional creation.
* Ensure a valid, authenticated user session is active before making requests to creation endpoints.

## Implementation Steps

### 1. Abort Prior Autofill Actions
If the sign-in page utilizes form autofill (Conditional UI/Get), the active credential get call must be aborted to prevent browser conflicts.
* Call `abortController.abort()` on the `AbortController` attached to the pending `navigator.credentials.get()` autofill request before calling `navigator.credentials.create()`.

### 2. Feature Detection
Determine whether Conditional Create is available by checking `conditionalCreate` with `PublicKeyCredential.getClientCapabilities()`.

```javascript
const capabilities = await PublicKeyCredential.getClientCapabilities();
if (capabilities.conditionalCreate) {
  // Conditional create is available
}
```

### 3. Create a passkey with Conditional Create
* Pass `mediation: 'conditional'` within the `navigator.credentials.create()` options. This signals the browser to handle the passkey creation flow silently in the background or contextually without throwing obtrusive modal dialogs.
* Populate `excludeCredentials` with the user's existing passkey credential IDs to avoid registering duplicate keys.

### 4. Silent Error Handling
* Wrap the passkey creation prompt (`navigator.credentials.create`) in a try/catch block. You MUST catch and silently ignore typical user-facing exceptions (`InvalidStateError`, `NotAllowedError`, `AbortError`) without rendering any error UI to the user.

### 5. Server-Side User Presence Verification
* The server-side verification endpoint MUST relax the User Presence (UP) requirement (`requireUserPresence: false`) **ONLY** when verifying credentials produced by a conditional-create trigger. Strict presence verification must remain active for standard explicit creations.
* Decide whether a ceremony is conditional from server-held state, never from a flag the client sends with the attestation. The options endpoint accepts a `conditional` request only when the session records a password sign-in that just completed, and stores that decision in the session next to the challenge. The verification endpoint reads the decision from the session, uses it once, and ignores anything the client claims about the ceremony type.

### 6. Handle Failed Server Verification gracefully
* The verification endpoint MUST answer HTTP `400` only when it rejected the attestation (for example, the challenge or signature did not verify) and stored nothing. Use other statuses for every other failure.
* If `navigator.credentials.create()` succeeds but the server answers `400`, the new passkey exists only in the passkey provider. Invoke `PublicKeyCredential.signalUnknownCredential()` (after feature detection) to prevent the orphaned credential from lingering there.
* Do NOT signal on a network error, timeout, or `5xx` response. The server may have stored the credential before the response was lost, and signaling would remove a passkey the server accepts.

```javascript
// Server: decide conditional mode from server-held state and bind it to the challenge.
// generateRegistrationOptions and verifyRegistrationResponse come from your server-side WebAuthn library.
router.post("/api/register/options", checkUserAuthenticated, async (req, res) => {
  // Set by the password sign-in handler after all factors succeeded
  const conditional = req.body.conditional === true && req.session.passwordSignInJustCompleted === true;
  req.session.passwordSignInJustCompleted = false;

  const options = await generateRegistrationOptions(/* rpID, user, excludeCredentials, ... */);
  req.session.registration = { challenge: options.challenge, conditional };
  return res.json(options);
});

router.post("/api/register/verify", checkUserAuthenticated, async (req, res) => {
  const ceremony = req.session.registration;
  delete req.session.registration; // Each challenge is single-use
  if (!ceremony) {
    // Not a verdict on this credential (it may be a repeated request), so not 400
    return res.status(409).json({ error: "No registration in progress." });
  }

  let result;
  try {
    result = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: ceremony.challenge,
      expectedOrigin: "https://example.com",
      expectedRPID: "example.com",
      // Relax UP only for a ceremony the server itself started as conditional
      requireUserPresence: !ceremony.conditional,
      requireUserVerification: false,
    });
  } catch {
    return res.status(400).json({ error: "Attestation rejected." }); // Nothing stored
  }
  if (!result.verified) {
    return res.status(400).json({ error: "Attestation rejected." }); // Nothing stored
  }

  await db.saveCredential(/* credential from result.registrationInfo */);
  return res.json({ status: "ok" });
});
```

## Code Example

```javascript
// optionsFetch and registerVerifyFetch are app-defined server endpoint requests
// registerVerifyFetch resolves to the fetch() Response
import { optionsFetch, registerVerifyFetch } from './api.js';

// The same RP ID constant the server uses when it generates options
const rpId = 'example.com';

async function triggerConditionalCreate(loginAbortController) {
  const capabilities = await PublicKeyCredential.getClientCapabilities();
  if (capabilities.conditionalCreate !== true) {
    return; // Platform does not support conditional creation
  }

  // 1. Abort any active autofill conditional-get controllers to clear the WebAuthn pipeline
  loginAbortController.abort();

  // 2. Fetch creation options signaling the backend that this is a conditional request
  const creationOptionsJSON = await optionsFetch({ conditional: true });
  const publicKey = PublicKeyCredential.parseCreationOptionsFromJSON(creationOptionsJSON);

  let credential;
  try {
    // 3. Invoke silent credentials creation prompt
    credential = await navigator.credentials.create({ 
      publicKey,
      mediation: 'conditional' // Silent background creation mediation
    });
  } catch (e) {
    // 4. Silently swallow common WebAuthn browser exceptions
    if (['InvalidStateError', 'NotAllowedError', 'AbortError'].includes(e.name)) {
      return; 
    }
    console.error('Unexpected conditional create error:', e);
    return;
  }

  // 5. Server verification step using dedicated Try/Catch block
  const encodedResponse = credential.toJSON();
  let response;
  try {
    response = await registerVerifyFetch(encodedResponse);
  } catch (networkErr) {
    // The server may have stored the credential before the connection failed: do not signal
    console.error('Verification network failure:', networkErr);
    return;
  }

  // 6. Only a 400 proves the server rejected the attestation and stored nothing
  if (response.status === 400 && PublicKeyCredential.signalUnknownCredential) {
    try {
      await PublicKeyCredential.signalUnknownCredential({
        rpId, // RP ID must match the one defined on the server
        credentialId: encodedResponse.id
      });
    } catch (signalErr) {
      console.warn('signalUnknownCredential failed:', signalErr);
    }
  } else if (!response.ok) {
    // 5xx and other failures: the credential may be stored, so keep it
    console.error('Conditional create verification failed with HTTP', response.status);
  }
}
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
*   **Fallback Experience**: Gated via `if (PublicKeyCredential.signalUnknownCredential)`. `webauthn-polyfills` does not add the Signal API methods. If they are unsupported, the cleanup call is skipped without throwing browser exceptions.

### Easy JSON Serialization Fallback

{{ BASELINE_STATUS("webauthn", "api.PublicKeyCredential.parseCreationOptionsFromJSON_static") }}

Import `webauthn-polyfills` once, before any WebAuthn call. The polyfill only installs `PublicKeyCredential.parseCreationOptionsFromJSON()` and `PublicKeyCredential.prototype.toJSON()` in browsers that lack them; browsers covered by the Baseline status above keep their native implementations. After the import, you can call both methods wherever `PublicKeyCredential` exists.

```js 
import 'webauthn-polyfills';
``` 
