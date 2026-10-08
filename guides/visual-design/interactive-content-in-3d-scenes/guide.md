---
name: interactive-content-in-3d-scenes
description: Integrate interactive HTML elements into a 3D scene.
web-feature-ids:
  - canvas-html
---

# Enable interactive HTML content in 3D scenes

The HTML-in-Canvas API allows rendering real DOM directly inside a canvas element. When applied to 3D rendering contexts like WebGL, WebGPU, or Three.js, adding the `layoutsubtree` attribute enables descendant HTML elements to be seamlessly projected into the 3D scene. Crucially, because the HTML elements remain part of the active DOM layout tree, they retain full interactivity—allowing users to click buttons, select text, and trigger focus states natively without requiring complex raycasting or custom event handling.

## How to implement

### WebGL and WebGPU
When using WebGL or WebGPU, follow these steps:

1. Check if HTML-in-Canvas is supported in the browser, and keep a working path for when it is not (see [Fallback strategies](#fallback-strategies)). Without support, children of a `<canvas>` are fallback content and are not rendered, so the fallback branch must show the HTML some other way:

```js
const supportsHtmlInCanvas = 'requestPaint' in HTMLCanvasElement.prototype;
if (supportsHtmlInCanvas) {
  // Use HTML in Canvas API
} else {
  // Use fallback strategy, e.g. canvas.after(htmlContent)
}
```

2. Initialize `<canvas>` to support descendant HTML elements by adding the `layoutsubtree` attribute to the `<canvas>` HTML element. Place your HTML content inside the `<canvas>` element with the `layoutsubtree` attribute.

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

- In WebGPU context, use the `copyElementImageToTexture` method. The destination texture needs `COPY_DST` and `RENDER_ATTACHMENT` usage (see the WebGPU example below):

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
    // Update the texture with texElementImage2D, and update the CSS transform as shown in step 5
  }
};
```

5. Update the CSS transform.

The browser needs to map from the 3D coordinate space into the CSS coordinate space using a viewport transform. To facilitate this, do the following:

- Convert the MVP Matrix to DOM Matrix.
- Normalize the HTML element. HTML elements are sized in pixels (for example, 200px wide). WebGL, however, usually treats objects as "unit squares", for example, ranging from 0 to 1. If you don't normalize, your 200px button will look 200 times larger.
- Map to the canvas viewport. This step is the "re-scaling" phase: it stretches that unit-space math back out to match the actual pixel dimensions of your `<canvas>` element on the screen. It also flips the Y-axis, because in WebGL, up is positive, but in CSS, down is positive.
- Calculate the final transform. Multiply the matrices in order: Viewport * MVP * Normalization. Combining them into one final transform produces a "map" that tells the browser exactly where that HTML element layer should sit to align with the 3D drawing.
- Apply the transform to the HTML element. This moves the HTML element layer to sit directly on top of its rendered pixels. This ensures that when a user clicks a button or selects text, they are actually hitting the real HTML element.

```js
if (canvas.getElementTransform) {
  // 1. Convert WebGL MVP Matrix to DOM Matrix
  const mvpDOM = new DOMMatrix(Array.from(htmlElementMVP));

  // 2. Normalize the HTML element (Canvas Grid pixels -> WebGL Model Space)
  const dprX = canvas.width / canvas.clientWidth;
  const dprY = canvas.height / canvas.clientHeight;
  const gridWidth = targetHTMLElement.offsetWidth * dprX;
  const gridHeight = targetHTMLElement.offsetHeight * dprY;

  const toGLModel = new DOMMatrix()
    // Scale pixels to 1 unit, flip Y (as in CSS it points down, and in WebGL it points up)
    .scale(1 / gridWidth, -1 / gridHeight, 1 / gridHeight)
    // Center the origin: (0,0) becomes (-width/2, -height/2) before scaling
    .translate(-gridWidth / 2, -gridHeight / 2);

  // 3. Map to the canvas viewport
  const clipToCanvasViewport = new DOMMatrix()
    // Move center (0,0) to center of canvas
    .translate(canvas.width / 2, canvas.height / 2)
    // Scale normalized clip (-1..1) to viewport size
    .scale(canvas.width / 2, -canvas.height / 2, canvas.height / 2);

  // 4. Multiply: (Clip -> Pixels) * (MVP) * (pixels -> unit square)
  const screenSpaceTransform = clipToCanvasViewport
    .multiply(mvpDOM)
    .multiply(toGLModel);

  // 5. Apply to the transform
  const computedTransform = canvas.getElementTransform(
    targetHTMLElement,
    screenSpaceTransform,
  );
  targetHTMLElement.style.transform = computedTransform.toString();
}
```

6. [Troubleshooting] If the developer is experiencing a mismatch in the DOM logical layout in 3D even after applying the CSS transform from step 5, check if the developer is experiencing the issue in Chromium 148 or earlier. If that's the case, check if `is2D` is correctly set to false on the 3D DOMMatrix returned by `getElementTransform()`. If not, re-initialize that DOMMatrix, which corrects `is2D` to be false, and apply the re-initialized matrix to the target HTML element. A DOMMatrix with `is2D` set to true serializes as a 2D `matrix()` and drops its 3D components. This issue is fixed in Chromium 149+, and if the developer is experiencing it in newer Chromium versions, the is2D value is not the cause:

```js
let computedTransform = canvas.getElementTransform(
  targetHTMLElement,
  screenSpaceTransform,
);
if (computedTransform.is2D) {
  // Workaround for Chromium bug https://crbug.com/512171941
  // affecting Chrome versions under 149 where `is2D`
  // is incorrectly true for a 3D DOMMatrix. Re-creating the matrix
  // from its 16 values yields a 3D DOMMatrix with is2D false.
  computedTransform = DOMMatrix.fromFloat64Array(computedTransform.toFloat64Array());
}
targetHTMLElement.style.transform = computedTransform.toString();
```

### Three.js

`HTMLTexture` and the `InteractionManager` addon are available from three.js r184, with both `WebGLRenderer` and `WebGPURenderer`. The renderer moves the texture's element into its canvas and sets `layoutsubtree`; `InteractionManager` sets the element's CSS transform every frame so pointer events reach it.

1. Check if HTML-in-Canvas is supported in the browser. Without support, `HTMLTexture` uploads nothing, so take a real fallback branch: install the polyfill (see [HTML-in-Canvas polyfill](#html-in-canvas-polyfill)) or show the HTML outside the scene.

2. Create a custom geometry and material for the HTML content.

3. Pass the DOM element into `HTMLTexture`, and register the mesh with `InteractionManager`:
```js
  material.map = new THREE.HTMLTexture(element);
  mesh = new THREE.Mesh( geometry, material );
  scene.add( mesh );
  interactions.add( mesh );
```

## Example code

### WebGL Canvas

```html
<canvas id="canvas" layoutsubtree style="width: 400px; height: 400px;">
  <div id="ui-element">
    <p>WebGL UI Element</p>
    <button>Action</button>
  </div>
</canvas>

<script>
  const canvas = document.getElementById("canvas");
  const uiElement = document.getElementById("ui-element");
  const gl = canvas.getContext("webgl2");

  if (!('requestPaint' in HTMLCanvasElement.prototype) || !gl || !gl.texElementImage2D) {
    // Fallback: without HTML-in-Canvas or WebGL 2, the canvas children are not
    // rendered. Show the UI as regular DOM, outside the 3D scene.
    canvas.after(uiElement);
  } else {
    // Setup WebGL texture...
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    canvas.onpaint = () => {
      // 1. Update texture with HTML content
      try {
        gl.texElementImage2D(gl.TEXTURE_2D, gl.RGBA8, uiElement);
      } catch (err) {
        console.error('texElementImage2D copy failed:', err);
      }

      // ... Render your 3D scene here, calculating htmlElementMVP matrix ...

      // 2. Sync DOM position with 3D scene
      const mvpDOM = new DOMMatrix(Array.from(htmlElementMVP));

      // Recalculate the DPR compensation mapping
      const dprX = canvas.width / canvas.clientWidth;
      const dprY = canvas.height / canvas.clientHeight;
      const gridWidth = uiElement.offsetWidth * dprX;
      const gridHeight = uiElement.offsetHeight * dprY;

      const cssToUnitSpace = new DOMMatrix()
        .scale(1 / gridWidth, -1 / gridHeight, 1 / gridHeight)
        .translate(-gridWidth / 2, -gridHeight / 2);

      const clipToCanvasViewport = new DOMMatrix()
        .translate(canvas.width / 2, canvas.height / 2)
        .scale(canvas.width / 2, -canvas.height / 2, canvas.height / 2);

      const screenSpaceTransform = clipToCanvasViewport
        .multiply(mvpDOM)
        .multiply(cssToUnitSpace);

      const computedTransform = canvas.getElementTransform(
        uiElement,
        screenSpaceTransform,
      );
      uiElement.style.transform = computedTransform.toString();
    };
  }
</script>
```

### WebGPU Canvas

```html
<canvas id="canvas" layoutsubtree style="width: 400px; height: 400px;">
  <div id="ui-element">
    <p>WebGPU UI Element</p>
  </div>
</canvas>

<script type="module">
  const canvas = document.getElementById("canvas");
  const uiElement = document.getElementById("ui-element");

  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();

  if (!('requestPaint' in HTMLCanvasElement.prototype) || !device ||
      !device.queue.copyElementImageToTexture) {
    // Fallback: without HTML-in-Canvas or WebGPU, the canvas children are not
    // rendered. Show the UI as regular DOM, outside the 3D scene.
    canvas.after(uiElement);
  } else {
    const context = canvas.getContext("webgpu");
    context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat() });

    // Texture that receives the HTML snapshot, sized in canvas grid pixels
    const targetTexture = device.createTexture({
      size: [
        Math.round(uiElement.offsetWidth * devicePixelRatio),
        Math.round(uiElement.offsetHeight * devicePixelRatio),
      ],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    canvas.onpaint = () => {
      // 1. Copy HTML content to texture
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

      // ... Render your 3D scene here, calculating htmlElementMVP matrix ...

      // 2. Sync DOM position (same matrix math as WebGL)
      const mvpDOM = new DOMMatrix(Array.from(htmlElementMVP));

      // Recalculate the DPR compensation mapping
      const dprX = canvas.width / canvas.clientWidth;
      const dprY = canvas.height / canvas.clientHeight;
      const gridWidth = uiElement.offsetWidth * dprX;
      const gridHeight = uiElement.offsetHeight * dprY;

      const cssToUnitSpace = new DOMMatrix()
        .scale(1 / gridWidth, -1 / gridHeight, 1 / gridHeight) // Retain Z scale
        .translate(-gridWidth / 2, -gridHeight / 2);

      const clipToCanvasViewport = new DOMMatrix()
        .translate(canvas.width / 2, canvas.height / 2)
        .scale(canvas.width / 2, -canvas.height / 2, canvas.height / 2); // Retain Z scale

      const screenSpaceTransform = clipToCanvasViewport
        .multiply(mvpDOM)
        .multiply(cssToUnitSpace);

      const computedTransform = canvas.getElementTransform(
        uiElement,
        screenSpaceTransform,
      );
      uiElement.style.transform = computedTransform.toString();
    };
  }
</script>
```

### Three.js

```js
// three.js r184 or later
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { InteractionManager } from 'three/addons/interaction/InteractionManager.js';
import { installHtmlInCanvasPolyfill } from 'three-html-render/polyfill';

// 1. Feature support: without HTML-in-Canvas, HTMLTexture uploads nothing.
if (!('requestPaint' in HTMLCanvasElement.prototype)) {
  installHtmlInCanvasPolyfill(); // or show the HTML outside the scene instead
}

// 2. Initialize the renderer, camera and scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 2000);
camera.position.z = 500;
const scene = new THREE.Scene();

// 3. Initialize the source HTML DOM element (the renderer moves it into its canvas)
const element = document.createElement('div');
element.innerHTML = '<h1>Hello World</h1><button>Click me</button>';

// 4. Create geometry and material, and pass the DOM element into THREE.HTMLTexture
const geometry = new RoundedBoxGeometry(100, 100, 100, 10, 10);
const material = new THREE.MeshBasicMaterial();
material.map = new THREE.HTMLTexture(element);

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// 5. Keep the element's CSS transform aligned with the mesh so clicks reach it
const interactions = new InteractionManager();
interactions.connect(renderer, camera);
interactions.add(mesh);

// 6. Render loop
renderer.setAnimationLoop(() => {
  interactions.update();
  renderer.render(scene, camera);
});
```

## Best Practices

- **MANDATORY**: Check browser support for the HTML-in-Canvas API before using it.
- **MANDATORY**: When using WebGL or WebGPU, always add the `layoutsubtree` attribute to the `<canvas>` element.
- **MANDATORY**: When using WebGL or WebGPU, use an `onpaint` event handler to render the HTML content to the canvas.
- **MANDATORY**: When using WebGL or WebGPU, use `texElementImage2D` for WebGL, or `copyElementImageToTexture` for WebGPU, to render the HTML content to the canvas.
- **MANDATORY**: When using WebGL or WebGPU, update the CSS transform of the HTML element to match the transform of the rendered content by setting the `style.transform` property of the HTML element.
- **MANDATORY**: Observe the screen size and update the canvas size to match device pixels, for example, by using `ResizeObserver`.
- **DO NOT** embed cross-origin content in a canvas, as it is not supported.
- **DO NOT** initialize `ResizeObserver` within the `onpaint` event handler, as it may lead to memory leaks.

### Fallback strategies

{{ BASELINE_STATUS("canvas-html") }}

HTML-in-Canvas is experimental. The explainer lists only a Chromium implementation, behind the `chrome://flags/#canvas-draw-element` flag; an origin trial ran in Chrome 148 to 150. The API is still changing: the current explainer replaces `layoutsubtree` with `content="drawable"`, `texElementImage2D()` with `texElementSubImage2D()`, `copyElementImageToTexture()` with `drawElementImageToTexture()`, and the two-argument `getElementTransform()` with `updateElementGeometry()`. This guide shows the origin-trial API, so check the [explainer](https://github.com/WICG/html-in-canvas) before you ship.

Treat HTML-in-Canvas as a progressive enhancement, not as the default rendering path. The page MUST work without it, and the fallback branch MUST run before any scene setup that assumes the HTML is drawn into the canvas.

The fallback strategy depends on the use case. For example, for an interactive HTML content in canvas, if HTML-in-Canvas is not supported, place the HTML content on top of the canvas using CSS, or after the canvas as in the examples above. Without support, children of the canvas are fallback content and are not rendered.

### HTML-in-Canvas polyfill

The third-party `three-html-render` package (MIT, 0.1.x, first published in April 2026) emulates the API in browsers that do not support it; the three.js `HTMLTexture` examples use it. It moves the canvas children into an offscreen host element and rasterizes them through an SVG `foreignObject` image, so rendering, performance and input handling differ from the native API; read its known limitations before you rely on it. Pin an exact version.

1. Install the library and call `installHtmlInCanvasPolyfill()` (it does nothing when the native API is present):

```
npm install --save-exact three-html-render@0.1.2
```

```js
import { installHtmlInCanvasPolyfill } from 'three-html-render/polyfill';

installHtmlInCanvasPolyfill();
```

2. Or, without a bundler, load the pinned build with Subresource Integrity. This classic script installs the polyfill as soon as it loads:

```html
<script src="https://cdn.jsdelivr.net/npm/three-html-render@0.1.2/dist/polyfill.js"
  integrity="sha384-MpD3wWXNXVuH2lbj5VNsH4o1Fn7ha/39AC9BJBqZjICRHgcPkedcfFScYS4sGz9p"
  crossorigin="anonymous"></script>
```
