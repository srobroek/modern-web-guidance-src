---
name: passkey-registration
description: Register a passkey for an existing user account.
web-feature-ids:
  - webauthn
  - webauthn-signals
---

# Passkey Registration

This guide details how to enable users to register a passkey for their account, providing a highly secure, phishing-resistant passwordless sign-in alternative.

## Database Requirements

To support passkey registrations, your database credential table must store the following fields:

```typescript
export interface StoredPasskeyCredential {
  id: string; // Base64URL-encoded credential ID (unique lookup key)
  passkeyUserId: string; // Associated application user ID
  credentialPublicKey: string; // Base64URL-encoded public key used to verify assertion signatures
  credentialType: "public-key";
  credentialDeviceType: "singleDevice" | "multiDevice"; // Helps distinguish device-bound vs cloud-synced passkeys
  credentialBackedUp: boolean; // Boolean backup state reported by the authenticator
  aaguid: string; // Authenticator Attestation GUID
  providerIcon?: string; // Provider icon derived from the AAGUID registry (dark or light theme URLs)
  name: string; // Provider name derived from AAGUID registry
  transports: string[]; // Array of transport names (e.g. 'internal', 'hybrid') necessary for exclusion options
  lastUsedAt?: number; // Optional epoch timestamp of last sign-in
  registeredAt: number; // Registration epoch timestamp
  counter: number; // Authenticator sign-in signature counter used to prevent replay attacks
}
```

## Server-Side

### Options Generation

Create an endpoint that generates WebAuthn creation parameters. Rely on a vetted library per category standards instead of hand-rolling cryptography.

1.  **Use the predefined RP ID**: Use the predefined proper RP ID as a constant string.
2.  **Create a secure Challenge**: Generate a high-entropy, cryptographically secure random buffer on the server, store it securely in the user's session, and encode it as Base64URL for options delivery.
3.  **Avoid Duplicate Passkeys**: Map the user's existing pre-registered credential IDs to the `excludeCredentials` options array. This prevents the authenticator from registering duplicate credentials on the same passkey provider account.
4.  **Enforce Discoverable Credentials**: Set `requireResidentKey: true` and `residentKey: "required"` in the `authenticatorSelection` options to request a discoverable credential, which is necessary for discoverable sign-ins.
5.  **Configure User Verification**: Specify `userVerification: "preferred"` or `userVerification: "required"`. Many compliance use cases (e.g., finance, healthcare) require `'required'` to enforce user verification on creation.
6.  **Determine Attachment Scope**:
    - **Promotion Flow**: When proposing passkey creation right after standard password sign-ins or post-signup promotions, set `authenticatorAttachment: "platform"` to enforce platform authenticator and bypass external security key prompts.
    - **Management Flow**: When called from a dedicated settings or security panel where external security keys are supported in addition to platform authenticator, omit the `authenticatorAttachment` property entirely.
    - _Tip_: Accept a `promotion: boolean` request flag to conditionally handle both flows with a single endpoint.

```javascript
// Options generation example
const options = {
  challenge: serverGeneratedBase64UrlChallenge, // Cryptographically random challenge
  rp: { id: "example.com", name: "Secure Application" },
  user: {
    id: userBase64UrlId, // Unique base64url string identifying the account
    name: "user@example.com",
    displayName: "Jane Doe",
  },
  pubKeyCredParams: [
    {
      type: "public-key",
      alg: -7,
    },
    {
      type: "public-key",
      alg: -257,
    },
  ],
  excludeCredentials: userExistingCredentials.map((cred) => ({
    type: "public-key",
    id: cred.id,
    transports: cred.transports,
  })),
  authenticatorSelection: {
    residentKey: "required",
    requireResidentKey: true,
    userVerification: "preferred",
    ...(isPromotionFlow && { authenticatorAttachment: "platform" }),
  },
};
```

### Verification

1.  **Challenge Verification**: Securely verify the challenge against the expected session bound challenge.
2.  **Verify User Presence**:
    - Ensure that the User Present (UP) flag returned in the parsed authenticator data is `true` to confirm physical user presence at the time of creation.
3.  **Relaxing Verification for 'preferred'**:
    - When the creation options specified `userVerification: "preferred"`, the server-side verification call MUST be configured with `requireUserVerification: false`. Otherwise, authenticators that register without user verification (e.g., screen locks disabled) will trigger spurious server verification failures.
4.  **Answer with a definitive status**: Return HTTP `400` only when the server rejected the attestation (for example, the challenge or signature did not verify) and stored nothing. Use other statuses for every other failure, because the client treats `400` as proof that the new passkey is orphaned.

## Client-Side Logic

1.  **Gate the UI on page load**:
    - On page load, call `PublicKeyCredential.getClientCapabilities()` and **disable the "Create passkey" button** if `conditionalGet` or `passkeyPlatformAuthenticator` is not available.
2.  **Invoke creation & Serialize**: Decode server options with `PublicKeyCredential.parseCreationOptionsFromJSON()` and pass the resulting configuration to `navigator.credentials.create()`.
    - Call `credential.toJSON()` to encode the `AuthenticatorAttestationResponse` into a valid, JSON-serializable object before fetching the verification endpoint.
3.  **Handle WebAuthn Exceptions**:
    - `InvalidStateError`: A matching passkey already exists (matched by `excludeCredentials`).
    - `NotAllowedError`: The user cancelled or timed out the authentication passkey dialog.
    - `AbortError`: The operation has been aborted.
    - `SecurityError`: Secure origins (HTTPS) or RP ID mismatch errors (configuration issues).
4.  **Try/Catch Segregation for Signal API**:
    - Wrap server verification `fetch()` call in a try/catch block. Call `signalUnknownCredential()` ONLY when the server answers HTTP `400`, which proves it rejected the attestation and stored nothing, and ONLY after checking that `PublicKeyCredential.signalUnknownCredential` exists.
    - Do NOT signal on a network error, timeout, or `5xx` response. The server may have stored the credential before the response was lost, and signaling would remove a passkey the server accepts.

```javascript
// optionsFetch and registerVerifyFetch are app-defined HTTP methods
// registerVerifyFetch resolves to the fetch() Response
import { optionsFetch, registerVerifyFetch } from "./api.js";

// The same RP ID constant the server uses in rp.id
const rpId = "example.com";

async function registerPasskey(isPromotion = false) {
  // Verify passkey capability and conditional UI are available
  const capabilities = await PublicKeyCredential.getClientCapabilities();
  if (
    !capabilities.passkeyPlatformAuthenticator ||
    !capabilities.conditionalGet
  ) {
    // Hide "Create passkey" buttons and fall back to password flows instead
    showStandardPasswordFallbackUI();
    return;
  }

  const creationOptionsJSON = await optionsFetch({ promotion: isPromotion });
  const publicKey =
    PublicKeyCredential.parseCreationOptionsFromJSON(creationOptionsJSON);

  let credential;
  try {
    // passkey prompt execution
    credential = await navigator.credentials.create({ publicKey });
  } catch (err) {
    if (err.name === "InvalidStateError") {
      console.log("A passkey already exists for this account.");
      alert("A passkey already exists for this account.");
    } else if (err.name === "SecurityError") {
      console.error("Configuration RP ID or Secure Context error.");
      alert("Configuration RP ID or Secure Context error.");
    } else if (err.name === "NotAllowedError") {
      console.log("User cancelled the passkey dialog.");
    } else if (err.name === "AbortError") {
      console.log("The creation operation has been aborted.");
    }
    return; // Safe API exit, do not signal unknown for standard WebAuthn cancels
  }

  // Server Verification phase (Segregated Try/Catch)
  const encodedResponse = credential.toJSON();
  let response;
  try {
    response = await registerVerifyFetch(encodedResponse);
  } catch (serverErr) {
    // The server may have stored the credential before the connection failed: do not signal
    console.error("Server verification network failure:", serverErr);
    alert("Could not confirm the new passkey. Check your passkeys in account settings.");
    return;
  }

  if (response.ok) {
    console.log("Passkey registered.");
    return;
  }

  if (response.status === 400) {
    // The server rejected the attestation and stored nothing: the new passkey is orphaned
    alert("The passkey could not be registered. Try again.");
    if (PublicKeyCredential.signalUnknownCredential) {
      try {
        await PublicKeyCredential.signalUnknownCredential({
          rpId, // RP ID must match the one defined on the server
          credentialId: encodedResponse.id, // Base64URL-encoded credential ID
        });
      } catch (signalErr) {
        console.warn("signalUnknownCredential failed:", signalErr);
      }
    }
    return;
  }

  // 5xx and other failures: the credential may be stored, so keep it
  console.error("Passkey verification failed with HTTP", response.status);
  alert("Could not confirm the new passkey. Check your passkeys in account settings.");
}
```

## Fallback Strategies

### Signal API Synchronization Fallback

{{ BASELINE_STATUS("webauthn-signals") }}

The WebAuthn Signal API (`webauthn-signals`) is a progressive optimization used to keep password managers in sync with the server credential state.

- **Fallback Experience**: If `PublicKeyCredential.signalUnknownCredential` is unsupported by the browser, the call MUST be bypassed safely via feature detection gating (`if (PublicKeyCredential.signalUnknownCredential)`), and the server-side verification simply logs the failure without triggering manager updates. `webauthn-polyfills` does not add the Signal API methods.

### Passkey feature detection fallback

{{ BASELINE_STATUS("webauthn", "api.PublicKeyCredential.getClientCapabilities_static") }}

Import `webauthn-polyfills` once, before any WebAuthn call. The polyfill only installs `PublicKeyCredential.getClientCapabilities()` in browsers that lack it, and corrects the result on Safari 17.4–18.3, which reports `conditionalMediation` instead of `conditionalGet`. Browsers covered by the Baseline status above keep their native implementation. After the import, you can call `getClientCapabilities()` wherever `PublicKeyCredential` exists.

In browsers with no native `getClientCapabilities()`, the polyfilled method cannot detect a platform authenticator and leaves `passkeyPlatformAuthenticator` undefined, so the capability gate in the code example hides the "Create passkey" button there.

### Easy JSON Serialization Fallback

{{ BASELINE_STATUS("webauthn", "api.PublicKeyCredential.parseCreationOptionsFromJSON_static") }}

Import `webauthn-polyfills` once, before any WebAuthn call. The polyfill only installs `PublicKeyCredential.parseCreationOptionsFromJSON()` and `PublicKeyCredential.prototype.toJSON()` in browsers that lack them; browsers covered by the Baseline status above keep their native implementations. After the import, you can call both methods wherever `PublicKeyCredential` exists.

```js 
import 'webauthn-polyfills';
``` 
