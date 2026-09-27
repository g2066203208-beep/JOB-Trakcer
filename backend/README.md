# Character Rig Forge — High Quality GPU Backend

浏览器版负责轻量、隐私优先的视觉预解析；高质量模式可以接入本地 GPU / 云 GPU。

## Contract

POST /v1/decompose

Content-Type: multipart/form-data
- image: PNG / JPEG / WebP
- mode: `fast` | `hq`
- split: `auto` | `semantic` | `live2d`

Response:

```json
{
  "schemaVersion": "0.3.0",
  "source": {"width": 0, "height": 0},
  "inference": {
    "mode": "hq",
    "semanticModel": "...",
    "decomposition": "..."
  },
  "layers": [
    {
      "id": "layer-01",
      "label": "hair",
      "zOrder": 10,
      "parent": "head",
      "pivot": {"x": 0.0, "y": 0.0},
      "bbox": [0, 0, 0, 0],
      "rgba": "layer-01.png",
      "hiddenRegionReconstructed": true
    }
  ]
}
```

## Target model stack

### Stage A — perception
- Anime-aware foreground matting
- Florence-2 / equivalent compact vision grounding
- EfficientSAM3 / SAM3 for object masks
- Anime-specific part segmentation when available

### Stage B — reconstruction
- See-through-style single-image layer decomposition
- Hidden-region completion
- Layer order and alpha reconstruction

### Stage C — animation structure
- Per-layer alpha → content-conforming triangle mesh
- Joint deformation prediction across layers
- Export to the same manifest consumed by the browser viewer

## Research references

- See-through: single-image layer decomposition for anime characters.
- Bunraku: single illustration → editable Live2D character.
- Qwen-Image-Layered: layered RGBA image generation.

This backend is intentionally optional. GitHub Pages remains functional without a backend.
