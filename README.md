# Rig Motion Lab · 骨骼动画工作室

专业级、纯网页、GitHub Pages 可托管的骨骼动画工作室。当前仓库内置由用户提供的阿米娅 Spine 3.5.51 工程转换得到的 12 套骨骼动作案例，保留骨骼层级、Setup Pose、IK/Transform/Path 约束元数据和骨骼动画时间线。

## 已实现

- 案例库：12 套阿米娅工程（4 外观 × 战斗正面/战斗背面/基建）
- Spine JSON / ZIP 导入（浏览器端，不上传第三方服务器）
- 骨骼层级树、骨骼选择、锁定、隐藏、搜索
- Setup Pose 与动画时间线预览
- 播放 / 暂停 / 循环 / 速度 / FPS / 帧步进 / 时间跳转
- 2D 骨骼画布：平移、缩放、网格、关节、骨名、洋葱皮
- Inspector：X/Y/旋转/缩放/长度，直接编辑
- 创建空工程 / Humanoid 预设 / 新建骨骼 / 复制 / 删除 / 重设
- 当前帧关键帧写入覆盖层；撤销 / 重做
- Pose 镜像、重置、快照、参考叠加与姿态评分
- IndexedDB 本地持久化；工程 JSON 导入/导出
- 原始 Spine 3.5 JSON 可被解析为骨骼工作工程
- GitHub Pages 静态托管，无后端依赖

## 数据说明

内置案例是 **bone-motion 精简工程**，目标是骨骼动作学习、观察、修改和训练。原始 ZIP 中的 slot/mesh/deform/texture attachment 数据不会被工作室篡改；如果需要查看原始工程，可直接把 ZIP 或 JSON 拖入网页。

## GitHub Pages

入口为 `index.html`。仓库启用 Pages 后可直接通过 GitHub Pages 地址使用。
