# Character Rig Forge

**独立、可直接部署到 GitHub Pages 的立绘骨骼素材工作室。**

目标是把一张动漫立绘变成可以进入 2D 骨骼动画系统的资产：

`立绘 → ML 主体解析 → 人体关键点 → 骨骼候选 → 可动画图层 → rig manifest`

## 技术路线

当前浏览器版不是把“最强研究模型”硬塞进网页，而是选择能在 GitHub Pages 直接运行的 WebML 路线：

- Transformers.js 4.3 + WebGPU，浏览器端运行 ONNX 模型。
- `onnx-community/anime-seg-ONNX` 做动漫角色主体抠图。
- MediaPipe Pose Landmarker 做人体关键点。
- Rig Inference 把关键点转换成父子骨骼、pivot 和图层关系。
- PNG 图层保持原图坐标系，可直接继续接 Canvas / WebGL 骨骼播放器。

Transformers.js 4 已提供新的 WebGPU runtime，可在浏览器中直接运行 ONNX 模型。WebGPU 在 2026 年已经有较广泛的浏览器支持，但仍需要 WASM fallback。citeturn818367search1turn818367search0

## 为什么它还不是最终版

“单张动漫立绘 → 完整可动画图层”这个任务，2026 年已经出现了更接近终局的研究路线。

**See-through** 是目前与我们的目标最直接对应的研究项目之一：它针对单张 anime illustration 做 layer decomposition，可推断绘制顺序，并生成最多约 23 个语义层，包括头发、脸、眼睛、衣服、饰品等。citeturn534972search3

**SAM 3 / SAM 3.1** 则是更通用的前沿视觉基础模型，支持文本概念、视觉 exemplar、点/框提示，并在 2026 年推出了 3.1 的多对象 multiplex。citeturn201572search0turn201572search2

但是官方 SAM 3.1 完整实现仍以 PyTorch/CUDA 环境为主；它不能直接作为 GitHub Pages 的纯静态网页后端运行。citeturn178082search6 社区已经有浏览器 ONNX 化路线，例如 SAM 3 的 text-prompt ONNX 和 SAM 3 tracker 的 Transformers.js ONNX 版本。citeturn749219search0turn538786search0

因此这个项目的终局路线是：

`Browser WebGPU MVP`
→ `SAM 3 / 3.1 browser ONNX`
→ `Anime-specific part segmentation`
→ `See-through style inpainting + occlusion reconstruction`
→ `real bone-ready assets`

## GitHub Pages

这个仓库本身就是独立静态站点，不依赖 paperchalk-world，也不依赖旧 JOB-Trakcer 内容。

GitHub Pages 可以直接从仓库发布 HTML/CSS/JavaScript；也可以使用 GitHub Actions 自动部署。citeturn452276search3turn452276search4

首次使用时浏览器会下载模型权重，因此第一次分析会比较慢。WebGPU 浏览器会优先使用 GPU，无法使用时回退到 WASM。

## 运行

本地：

```bash
python -m http.server 8080
```

然后打开：

`http://localhost:8080/`

线上则使用该仓库的 GitHub Pages 地址。

## 输出

- `rig-manifest.json`
- 每个候选部件的透明 PNG
- joint / bone hierarchy
- pivot / parent bone 信息
- 推理模型与模式记录

## 后续专用训练模型

最终真正需要训练的不是普通“人物抠图”，而是**面向骨骼动画资产的 Anime Rig Segmentation / Matting 模型**。

训练标注建议包含：

`backHair, frontHair, head, face, neck, torso, upperArm, forearm, hand, thigh, shin, foot, clothes, accessory`

以及：

- 每个部件的像素级 alpha mask
- 父骨骼
- pivot
- 遮挡前后关系
- 被遮挡区域的重建目标

这样模型的输出就不是“看起来像拆图”，而是可以直接交给骨骼动画播放器的资产。

## License / Model Notice

本仓库代码与第三方模型的许可证并不等价。尤其 SAM 3 / SAM 3.1 及其社区导出的 ONNX 模型需要分别遵守其模型许可证。部署前应检查你实际使用的模型权重及其来源许可证。