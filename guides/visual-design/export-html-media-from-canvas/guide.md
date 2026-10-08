---
name: export-html-media-from-canvas
description: Capture and export dynamic HTML content as images or video frames from within canvas.
web-feature-ids:
  - canvas-html
---

# Export HTML content from canvas

Web applications frequently need to capture and export rich HTML content—such as customized dashboards, styled documents, or interactive charts—as static images or video recordings. Historically, achieving this required bulky third-party libraries that manually parse DOM nodes and CSS properties to reconstruct a visual facsimile on a canvas. This approach is computationally expensive, error-prone, and frequently fails to support modern CSS layout features. With the HTML-in-Canvas API, developers can render real DOM elements directly into the canvas context. Because the browser's native rendering engine paints the HTML subtree with pixel-perfect accuracy, capturing the exact visual output as an image or video stream is highly efficient using built-in canvas methods like `toDataURL()`, `toBlob()`, or `captureStream()`.

## How to implement

1. Check if HTML-in-Canvas is supported in the browser, and keep a working path for when it is not (see [Fallback strategies](#fallback-strategies)). Without support, children of a `<canvas>` are fallback content and are not rendered, so the fallback branch must show the HTML some other way and either export it differently or say that export is unavailable:

```js
const supportsHtmlInCanvas = 'requestPaint' in HTMLCanvasElement.prototype;
if (supportsHtmlInCanvas) {
  // Use HTML in Canvas API
} else {
  // Use fallback strategy, e.g. canvas.after(htmlContent)
}
```

2. Initialize the canvas to support rendering of descendant HTML elements by adding the `layoutsubtree` attribute to the `<canvas>` HTML element. Place your HTML content inside the `<canvas>` element with the `layoutsubtree` attribute:

```html
<canvas id="canvas" layoutsubtree>
  <div id="html-content"></div>
</canvas>
```

3. Scale your canvas grid to match the device scale factor to prevent blurriness:

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

4. Render the HTML content to the canvas inside a `canvas.onpaint` event handler:

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
      // Update the texture with drawElementImage, texElementImage2D, or copyElementImageToTexture, and update the CSS transform as shown in step 5
    }
  };
  ```

5. Update the CSS transform.

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

6. Use regular canvas export methods like `toDataURL()`, `toBlob()`, or `captureStream()`. The exported data will include the rendered HTML content.

## Example code

```html
<body>
    <canvas id="canvas" style="width: 400px; height: 200px;" layoutsubtree>
        <input id="element">
    </canvas>
    
    <button id="download">Download Image</button>

    <script>
        const canvas = document.getElementById('canvas');
        const element = document.getElementById('element');
        const download = document.getElementById('download');

        if (!('requestPaint' in HTMLCanvasElement.prototype)) {
            // Fallback: without HTML-in-Canvas the canvas children are not
            // rendered. Show the input as regular DOM, and say that export is
            // unavailable (or export with a DOM-rasterizing library instead).
            canvas.replaceWith(element);
            download.disabled = true;
            download.textContent = 'Image export is not supported in this browser';
        } else {
            const ctx = canvas.getContext('2d');

            canvas.onpaint = (event) => {
                ctx.reset();
                // Draw the element into the canvas
                const transform = ctx.drawElementImage(element, 10, 10);
                // Synchronize DOM position for hit testing (typing)
                element.style.transform = transform.toString();
            };

            download.onclick = () => {
                // Export the canvas content as an image
                const dataURL = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = 'exported-canvas.png';
                link.href = dataURL;
                link.click();
            };

            // Re-initialize canvas size on screen resize
            const observer = new ResizeObserver(([entry]) => {
                const dpc = entry.devicePixelContentBoxSize;
                canvas.width = dpc ? dpc[0].inlineSize : Math.round(entry.contentRect.width * window.devicePixelRatio);
                canvas.height = dpc ? dpc[0].blockSize : Math.round(entry.contentRect.height * window.devicePixelRatio);
                canvas.requestPaint();
            });
            const supportsDevicePixelContentBox = 
                typeof ResizeObserverEntry !== 'undefined' && 
                'devicePixelContentBoxSize' in ResizeObserverEntry.prototype;
            const options = supportsDevicePixelContentBox ? { box: 'device-pixel-content-box' } : {};
            observer.observe(canvas, options);
        }
    </script>
</body>
```

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

Treat HTML-in-Canvas as a progressive enhancement. Without support, the canvas children are fallback content and are not rendered, so the fallback branch MUST keep the content visible and usable; a warning alone, shown after the content has vanished into the canvas, is not enough. Then pick an export path:

- For the use case where HTML content needs to be exported from a canvas, use libraries like `html2canvas`, `dom-to-image`, or `snapdom`, which rebuild an image from the DOM and do not match native rendering exactly.
- To capture HTML interactions frame by frame, for example, for streaming, capture DOM mutations using libraries like `rrweb`.
- If neither is acceptable, keep the HTML visible as regular DOM and tell the user that export is not available in this browser, as the example above does.