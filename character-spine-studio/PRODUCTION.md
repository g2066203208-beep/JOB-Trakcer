# 修女少女 / Sister — Spine 4.3 Production

## 目标
把用户提供的人物设计改造成可直接用于 2D 游戏的 Spine 风格骨骼动画角色。

## 强制素材规则
- 正式可动零件由 GPT Image 生成。
- **没有使用 Python 从人物母版切割零件。**
- 当前纹理文件 `assets/nun_parts_atlas.png` 来自 GPT Image 生成的透明部件图集。
- Spine / 网页仅使用 Atlas Region 引用这些已经生成好的零件区域。
- 用户原始图片只作为角色设计参考，不作为运行时裁切来源。

## 角色结构
- 默认视角：向右 3/4
- 25 Bones
- 22 Slots
- 22 GPT Image Attachments
- Spine 4.3 SkeletonJson

主要骨骼：
- root / body / chest
- head / face / hair_front / hair_back
- veil_back / veil_front
- arm_L_upper / arm_L_lower / hand_L
- arm_R_upper / arm_R_lower / hand_R
- leg_L_upper / leg_L_lower / foot_L
- leg_R_upper / leg_R_lower / foot_R
- skirt_front / skirt_back / apron / belt

## 动画
- Idle 2.40s：呼吸、头部轻摆、头巾/裙摆错峰跟随。
- Move 0.80s：左右腿与手臂反相的短步移动循环。
- Attack 0.85s：Anticipation → Action → Recovery，右手前击。
- Hurt 0.48s：快速后缩 + 头部/布料惯性回弹。
- Death 1.40s：失衡倒地，非循环。

## 文件
- `assets/nun_parts_atlas.png` — GPT Image 透明零件图集
- `data/character.json` — Spine 4.3 SkeletonJson
- `data/character.atlas` — Atlas Region 定义
- `data/parts.json` — Pivot / Draw Order / 素材来源元数据
- `vendor/spine43.js` — Spine 4.3 Web Runtime
- `index.html` / `app.js` — 浏览器工作室与 Runtime 预览

## QA
GitHub Actions 会实际用 Chrome 打开 GitHub Pages，检查：
1. Spine 4.3 Runtime 初始化
2. 25 Bones / 22 Slots / 22 Parts
3. 5 个动画存在并实际推进时间
4. Attack 动画切换
5. 骨骼检查器交互
6. JSON / Atlas / PNG / metadata 网络资源存在
