---
name: language-detection
description:
  Detect the language of user-generated content or already present site content.
web-feature-ids:
  - languagedetector
---

# Language Detection

The **Language Detector API** is a client-side web API designed to identify the language of a given text string. By performing detection locally in the browser, it enhances user privacy and reduces the need for heavy external libraries or costly server-side calls.

## Key Use Cases

- **Translation Prep:** Identifying the source language before sending text to a translator.
- **Safety & Filtering:** Loading specific models for tasks like toxicity detection.
- **Accessibility:** Labeling content with the correct `lang` attribute for screen readers.
- **UI Localization:** Adjusting application interfaces based on the user's input language.

## Platform Requirements

- **Desktop only:** The Language Detector API works in Chrome on desktop. It does not work on mobile devices.
- **Small expert model:** Chrome runs language detection on a small expert model fine-tuned for this task, not on the Gemini Nano foundation model. The foundation-model hardware limits (22 GB free storage, GPU VRAM, or 16 GB RAM) do **not** apply. The model may already be present because other Chrome features use it.
- **DO NOT** gate or warn on hardware specs. Use `LanguageDetector.availability()` as the source of truth.

## Implementation Guide

### 1. Model Management & User Activation

Check model availability before attempting to instantiate the detector or trigger download.

**MANDATORY:** Instantiating the language detector or triggering a model download with `LanguageDetector.create()` **MUST** be initiated by a user gesture (such as a button click) to prevent a `NotAllowedError` when the model is in a `downloadable` or `downloading` state.

```javascript
let detector;

// Check if the model is available or downloadable
const availability = await LanguageDetector.availability();

if (availability === 'available') {
  // The model is already on the device: no user gesture is needed.
  detector = await LanguageDetector.create();
} else if (availability !== 'unavailable') {
  button.addEventListener('click', async () => {
    // Assign to the outer variable so the detection code below can use it.
    detector ??= await LanguageDetector.create({
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          console.log(`Downloaded ${e.loaded * 100}%`);
        });
      },
    });
  });
}
```

### 2. Running Detection

The API returns a ranked list of potential languages with a confidence score between `0.0` and `1.0`.

```javascript
// Run detection only after `detector` has been created (see step 1).
const someUserText = 'Hallo und herzlich willkommen!';
const results = await detector.detect(someUserText);

for (const result of results) {
  // result.detectedLanguage (e.g., 'de')
  // result.confidence (e.g., 0.999)
  console.log(result.detectedLanguage, result.confidence);
}
```

Avoid using the detector on very short phrases or single words, as accuracy drops significantly.

## Security and Environment

- **Iframes:** Cross-origin iframes require an explicit Permissions Policy to access the API.
  ```html
  <iframe
    src="https://cross-origin.example.com/"
    allow="language-detector"
  ></iframe>
  ```
- **Web Workers:** The API is **not** currently available in Web Workers due to Permission Policy complexities.
- **Privacy:** No data is sent to Google or third parties during the detection process.

## Fallback Strategy

{{ BASELINE_STATUS("languagedetector") }}

Before use, check if the `LanguageDetector` object is available in the global scope:

```javascript
if ('LanguageDetector' in self) {
  // The Language Detector API is supported.
} else {
  // Execute fallback strategy
}
```

If the `LanguageDetector` API is unsupported or availability checks return `'unavailable'`, you must gracefully fall back:
1. **Remote API Fallback**: Redirect the detection request to a server endpoint or a cloud API (such as the Vertex AI Gemini API) to identify the language.
2. **Graceful Degradation**: Disable language detection elements/buttons and inform the user that client-side detection is currently unsupported in this browser, preventing any unhandled exceptions or crashes.
