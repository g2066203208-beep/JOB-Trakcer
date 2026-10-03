# 蘑角兽 / Mushhorn — Spine Production Notes

## 角色定位
- 类型：小型敌人 / 魔法生物
- 默认朝向：向右 3/4
- 视觉核心：巨大菌伞、单眼、双发光菌角、卷曲菌丝尾
- 行为：四足小跑，受威胁时压缩身体后用菌角/头部突进

## GPT Image → Spine 制作链
1. GPT Image 生成角色概念与母版。
2. 从母版提取透明角色。
3. 拆分为 16 个透明部件并打入 512×512 Atlas。
4. Pivot 放在真实旋转中心，肢体切口保留重叠。
5. 建立 Spine 4.3 SkeletonJson：18 Bones / 16 Slots。
6. 制作 Idle / Move / Attack / Hurt / Death。
7. GitHub Pages 使用 Spine 4.3 Runtime 实际解析与播放。
8. Selenium 自动测试验证骨骼、动画、资源与交互。

## 动画
- Idle 2.40s：呼吸、伞帽错峰摆动、菌角与尾巴延迟。
- Move 0.80s：对角腿组交替，身体弹跳，头壳反相补偿。
- Attack 0.75s：Anticipation → Action → Recovery。
- Hurt 0.45s：快速后缩、壳体惯性、二次回弹。
- Death 1.40s：失衡、侧倒、菌角与菌丝尾延迟坠落，非循环。

## 文件
- assets/master_reference.png — GPT Image 母版
- assets/mushhorn.png — 拆件 Atlas
- data/mushhorn.json — Spine 4.3 SkeletonJson
- data/mushhorn.atlas — Spine Atlas
- data/parts.json — 工作室部件/Pivot 元数据
- vendor/spine43.js — Spine 4.3 Runtime
