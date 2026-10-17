# Three.js 0.161.0 — CAE viewer runtime subset

Unmodified files from the official npm `three@0.161.0` package:
<https://registry.npmjs.org/three/-/three-0.161.0.tgz>

The npm archive SHA-512 integrity was verified before extraction. `PROVENANCE.json`
records the archive SHA-256, npm integrity value, and each included file's SHA-256.

This subset contains the module runtime, OrbitControls, GLTFLoader, OBJLoader,
STLLoader, and their required BufferGeometryUtils dependency. The original MIT
license is in `LICENSE`. Versions and source code are unchanged.

The CAE page imports this local subset so the result viewer does not depend on a
third-party CDN. Optional compressed glTF decoders were not previously configured
and are not included in this subset.
