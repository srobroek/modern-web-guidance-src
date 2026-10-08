---
name: expose-canvas-content-to-browser-features
description: Expose content rendered in a canvas to browser features like assistive technologies, translation, or reading mode.
web-feature-ids:
  - canvas-html
---

# Expose canvas content to browser features

Regular `<canvas>` content is not exposed to browser features such as screen readers, indexing, translation tools, accessibility assistive tools, find-in-page, print, etc. With `HTML in canvas`, you can render real DOM directly in a canvas element. Adding the `layoutsubtree` attribute to a `<canvas>` HTML element allows rendering descendant HTML elements within the canvas's rendering context. You can use it to style and lay out text in a canvas, expose canvas content to browser features (like accessibility, translation, or find-in-page), and apply 2D and 3D effects to HTML.

## How to implement

1. Check if HTML-in-Canvas is supported in the browser, and keep a working path for when it is not (see [Fallback strategies](#fallback-strategies)). Without support, children of a `<canvas>` are fallback content and are not rendered, so the fallback branch must show the HTML some other way:

```js
const supportsHtmlInCanvas = 'requestPaint' in HTMLCanvasElement.prototype;
if (supportsHtmlInCanvas) {
  // Use HTML in Canvas API
} else {
  // Use fallback strategy, e.g. canvas.after(htmlContent)
}
```

2. Add the `layoutsubtree` attribute to the `<canvas>` HTML element.
3. Place your HTML content inside the `<canvas>` element with the `layoutsubtree` attribute.

```html
<canvas id="canvas" layoutsubtree>
  <div id="html-content"></div>
</canvas>
```

4. Scale your canvas grid to match the device scale factor to prevent blurriness:

```js
const observer = new ResizeObserver(([entry]) => {
  const dpc = entry.devicePixelContentBoxSize;
  canvas.width = dpc
    ? dpc[0].inlineSize
    : Math.round(entry.contentRect.width * window.devicePixelRatio);
  canvas.height = dpc
    ? dpc[0].blockSize
    : Math.round(entry.contentRect.height * window.devicePixelRatio);
});

const supportsDevicePixelContentBox =
  typeof ResizeObserverEntry !== "undefined" &&
  "devicePixelContentBoxSize" in ResizeObserverEntry.prototype;
const options = supportsDevicePixelContentBox
  ? { box: "device-pixel-content-box" }
  : {};
observer.observe(canvas, options);
```

5. Render the HTML content to the canvas inside a `canvas.onpaint` event handler:

- In 2D context, use the `drawElementImage` method:

```js
canvas.onpaint = () => {
  ctx.reset();
  // Draw the form element at x:0, y:0
  let transform = ctx.drawElementImage(form_element, 0, 0);
};
```

- In WebGL context, use the `texElementImage2D` method. `gl.RGBA8` is a sized internal format, which WebGL 2 textures accept but WebGL 1 textures do not, so get the context with `getContext('webgl2')`:

```js
const gl = canvas.getContext('webgl2');

canvas.onpaint = () => {
  if (gl.texElementImage2D) {
    try {
      gl.texElementImage2D(gl.TEXTURE_2D, gl.RGBA8, uiElement);
    } catch (err) {
      console.error('texElementImage2D copy failed:', err);
    }
  }
};
```

- In WebGPU context, use the `copyElementImageToTexture` method. The destination texture needs `COPY_DST` and `RENDER_ATTACHMENT` usage:

```js
canvas.onpaint = () => {
  if (device.queue.copyElementImageToTexture) {
    try {
      const sourceDict = { source: uiElement };
      const destDict = {
        destination: { texture: targetTexture },
        width: targetTexture.width,
        height: targetTexture.height,
      };
      device.queue.copyElementImageToTexture(sourceDict, destDict);
    } catch (err) {
      console.error('copyElementImageToTexture copy failed:', err);
    }
  }
};
```

When using a `requestAnimationFrame` loop to render the scene, call `canvas.requestPaint()` within the loop to ensure that the HTML content is rendered to the canvas. Make sure you only re-render the canvas if there has been an update to the descendant HTML elements:

```js
function render() {
  // Request to update the canvas
  canvas.requestPaint();
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

canvas.onpaint = (event) => {
  if (event.changedElements && event.changedElements.length > 0) {
    // Update the texture with drawElementImage, texElementImage2D, or copyElementImageToTexture, and update the CSS transform as shown in step 6
  }
};
```

6. Update the CSS transform. Assistive technology, hit testing and other browser features use the element's DOM location, so it MUST match where the element is drawn.

- For the 2D context case, apply the transform returned by the rendering call to the `style.transform` property:

```js
canvas.onpaint = () => {
  ctx.reset();
  // Draw the form element at x:0, y:0
  let transform = ctx.drawElementImage(form_element, 0, 0);

  // Sync the DOM location with the drawn location
  form_element.style.transform = transform.toString();
};
```

- For the 3D case with WebGL or WebGPU, compute the CSS transform from your model-view-projection matrix with `canvas.getElementTransform()`, as shown step by step in {{ GUIDE_REF("interactive-content-in-3d-scenes") }}. That guide also covers the `is2D` workaround needed in Chromium 148 and earlier.

## Example code

### 2D Canvas

```html
<canvas id="canvas" layoutsubtree style="width: 400px; height: 200px;">
  <div id="ui-element">
    <p>
      This text is rendered inside the canvas but is present in the DOM tree.
    </p>
    <input type="email" name="email" placeholder="enter your email" />
    <button type="button">Submit</button>
  </div>
</canvas>

<script>
  const canvas = document.getElementById("canvas");
  const uiElement = document.getElementById("ui-element");

  if (!('requestPaint' in HTMLCanvasElement.prototype)) {
    // Fallback: without HTML-in-Canvas the canvas children are not rendered.
    // Show the content as regular DOM so every browser feature still reaches it.
    canvas.replaceWith(uiElement);
  } else {
    const ctx = canvas.getContext("2d");

    canvas.onpaint = () => {
      ctx.reset();
      // Draw the HTML element at x:0, y:0
      const transform = ctx.drawElementImage(uiElement, 0, 0);

      // Sync the DOM location with the drawn location
      uiElement.style.transform = transform.toString();
    };

    // Handle resizing to match device pixels
    const observer = new ResizeObserver(([entry]) => {
      const dpc = entry.devicePixelContentBoxSize;
      canvas.width = dpc
        ? dpc[0].inlineSize
        : Math.round(entry.contentRect.width * window.devicePixelRatio);
      canvas.height = dpc
        ? dpc[0].blockSize
        : Math.round(entry.contentRect.height * window.devicePixelRatio);
      canvas.requestPaint();
    });

    const supportsDevicePixelContentBox =
      typeof ResizeObserverEntry !== "undefined" &&
      "devicePixelContentBoxSize" in ResizeObserverEntry.prototype;
    const options = supportsDevicePixelContentBox
      ? { box: "device-pixel-content-box" }
      : {};
    observer.observe(canvas, options);
  }
</script>
```

### WebGL and WebGPU Canvas

For complete WebGL and WebGPU examples, including the support branch and the transform that keeps the DOM location in sync for assistive technology and hit testing, see {{ GUIDE_REF("interactive-content-in-3d-scenes") }}.

## Best Practices

- **MANDATORY**: Check browser support for the HTML-in-Canvas API before using it.
- **MANDATORY**: Always add the `layoutsubtree` attribute to the `<canvas>` element.
- **MANDATORY**: Use an `onpaint` event handler to render the HTML content to the canvas.
- **MANDATORY**: Use the `drawElementImage`, `texElementImage2D`, or `copyElementImageToTexture` methods to render the HTML content to the canvas.
- **MANDATORY**: Update the CSS transform of the HTML element to match the transform of the rendered content by setting the `style.transform` property of the HTML element.
- **MANDATORY**: Use `ResizeObserver` to observe the screen size and update the canvas size to match device pixels.
- **DO NOT** embed cross-origin content in a canvas, as it is not supported.
- **DO NOT** initialize `ResizeObserver` within the `onpaint` event handler, as it may lead to memory leaks.

## Fallback strategies

{{ BASELINE_STATUS("canvas-html") }}

HTML-in-Canvas is experimental. The explainer lists only a Chromium implementation, behind the `chrome://flags/#canvas-draw-element` flag; an origin trial ran in Chrome 148 to 150. The API is still changing: the current explainer replaces `layoutsubtree` with `content="drawable"` and renames the WebGL and WebGPU methods (`texElementSubImage2D()`, `drawElementImageToTexture()`). This guide shows the origin-trial API, so check the [explainer](https://github.com/WICG/html-in-canvas) before you ship.

Treat HTML-in-Canvas as a progressive enhancement. The point of this guide is that browser features reach the content, so the fallback MUST keep the content as real, rendered DOM:

- **Render the content as regular HTML** outside the canvas, or positioned on top of it with CSS, as the example above does. This keeps assistive technology, find-in-page, translation, reading mode, selection, autofill and printing working.
- **Do not rely on canvas fallback content alone.** Children of a canvas without HTML-in-Canvas support are exposed to assistive technology and can receive focus, but they are not rendered, so sighted users, find-in-page highlights, selection and printing never see them.
- **Do not count on a polyfill for these features.** The third-party `three-html-render` polyfill (MIT, 0.1.x) emulates the drawing API by moving the canvas children into an offscreen host element and rasterizing them through an SVG `foreignObject` image. Test assistive technology, find-in-page and translation with it before you rely on it; if you use it for the visual effect, pin an exact version (`npm install --save-exact three-html-render@0.1.2`).
