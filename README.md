# Character Rig Forge

立绘骨骼素材工作室：从单张立绘开始，运行浏览器端机器学习，生成主体遮罩、人体关键点、骨骼候选和可动画透明 PNG。

## 当前 MVP

立绘 → ML 主体抠图 → ML 人体关键点 → Rig Inference → 动画素材与 rig manifest。

当前版本把真实 ML 和工程化区域推断组合起来：主体 alpha 使用 Transformers.js 的 `Xenova/modnet`，人体关键点使用 MediaPipe Pose Landmarker；部件图层暂时由“ML 主体遮罩 ∩ 骨骼区域”生成。这样先得到真正可以交给骨骼播放器的透明素材，再逐步替换成专用动漫角色部件分割模型。

## 目标

后续专用模型负责：`backHair, head, face, neck, torso, upperArm, forearm, hand, thigh, shin, foot, clothing, accessory`，同时输出像素级 alpha mask、遮挡关系和 pivot / parent bone。

## 运行

不需要构建工具：

```bash
python -m http.server 8080
```

打开 `http://localhost:8080/`。首次分析会下载模型权重；推理在浏览器中运行。

## 输出

- `rig-manifest.json`：规范化 joints、bones、layer parent、pivot 与模型信息。
- 每个部件一个同尺寸透明 PNG，保持原图坐标系，方便直接进入 Canvas/WebGL 骨骼系统。

## 机器学习说明

Transformers.js 官方文档支持在浏览器中执行背景去除、图像分割等视觉任务，并使用 ONNX Runtime；MediaPipe Pose Landmarker 支持静态图片的人体关键点检测。两者都适合做第一阶段的本地推理基础。
