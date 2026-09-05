# Runtime dependencies

Three.js **0.180.0** is vendored locally under `three/`. The WebGL runtime, OrbitControls, GLTFLoader, BufferGeometryUtils, RoomEnvironment, and Reflector are included. All imports resolve inside this folder. The library's original MIT license is included at `three/LICENSE`. RoomEnvironment bootstraps lighting while a local probe captures the actual courtyard; the final environment comes from that captured scene.

These files were copied from the existing repository's installed Three.js package without changing that package. There is no runtime request to npm, a CDN, or a third-party host.

Primary API references: [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) and [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html). The implementation is checked against the vendored 0.180.0 source.
