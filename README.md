# Character Rig Forge

**独立、可直接部署到 GitHub Pages 的立绘骨骼素材工作室。**

目标是把一张动漫立绘变成可以进入 2D 骨骼动画系统的资产：

`立绘 → ML 主体解析 → 人体关键点 → 骨骼候选 → 可动画图层 → rig manifest`

## 新版 AI 拆层路线

当前版本已经停止使用“根据骨骼坐标画椭圆/胶囊”的假拆层算法。

实际流程变为：

`立绘 → Anime 前景 matte → Florence-2 部件定位 → SAM3 真实轮廓分割 → RGBA 图层 → Rig manifest`

### 1. Florence-2

使用 `onnx-community/Florence-2-base-ft`，230M 参数，浏览器 WebGPU / WASM worker 推理。

它先做开放词汇的 phrase grounding，寻找：

- hair / face / neck
- clothing / dress / skirt / sleeve
- left/right arm / hand / leg / shoe
- ribbon / bow / accessory
- bag / backpack / weapon / tail / wing / hat / cape 等

这一步的作用是**理解“有哪些部件、它们在哪里”**，而不是生成骨骼。

### 2. SAM3

Florence-2 给出的每一个真实图像框，会单独交给 `onnx-community/sam3-tracker-ONNX` 做 promptable pixel mask。

这意味着最终图层来自真实图像边界，而不是骨骼坐标几何估计。

### 3. Pose / Rig

Pose Landmarker 仍然保留，但它只用于动画骨骼辅助：

`pose → joints → bones → pivot / parent`

**不再参与图像拆层。**

### 4. 仍未完成的高质量重建

遮挡区域补全是下一阶段。

真正的高质量路线会继续研究 See-through / Bunraku / Qwen-Image-Layered 的 single-image layer reconstruction，让“被头发、衣服、手臂遮住的像素”也可以被重建出来。

所以当前版本应该理解为：

**真实可见区域的 AI 拆层器 + rig 数据生成器**

而不是声称已经完成完整的 hidden-region reconstruction。

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

### 当前已接入的前沿浏览器分割

工作室现在同时接入 `onnx-community/sam3-tracker-ONNX` 作为 SAM3 多对象智能 mask 引擎，并已经把人体关键点自动转换成点 + 框双提示。它基于 Meta 的 SAM3，可用点、框等视觉提示生成对象 mask，并支持同一张图的多个对象批处理；Transformers.js 已提供对应的浏览器接口。citeturn131496search0turn131496search4turn929782search3

当前按钮“**SAM3 智能拆层**”会利用 ML 人体关键点作为每个候选部件的正向提示点，让 SAM3 负责边界，而不是继续使用纯几何胶囊。