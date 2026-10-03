# Reverse: 1999 动画学习资料库

来源：`myssal/Reverse-1999-CN-Asset`（master）。本目录只作为 Rig Motion Lab 的研究/学习参考，保留上游来源信息；不要把这些商业游戏资产当作我们自己的原创资产发布。

## 分类

1. **01-classic-combat / 红弩箭**：标准人形 Fight / Room / UI、Bloom 与基础战斗节奏。
2. **02-cloth-performance / 伊索尔德**：长发、衣摆、次级运动与舞台式表演。
3. **03-prop-motion / 北方哨歌**：长道具/武器跟随、远程姿态和身体—道具节奏。
4. **04-mechanical-rig / 露西**：机械角色、多附件、高复杂度战斗骨架。
5. **05-fx-layering / 环状水星**：Bloom/光效分层、柔和循环与 UI 表演。
6. **06-high-complexity / 天使娜娜**：高复杂度 Fight，适合研究多附件、分层动作和高密度战斗表演。
7. **07-modern-pipeline / 诺谛卡**：较新角色的 Fight / Room / UI 组织，可作为现代管线样本。
8. **08-nonhuman-floating / 未锈铠**：悬浮/非标准人体结构，并含 `fight_special`，适合研究非人形骨骼设计。

每套样本尽量完整保留：`.atlas + 主 PNG + bloom PNG + fight.skel + room.skel + ui.skel`；未锈铠额外保留 `fight_special.skel`。

## Live2D 对照目标

下一层研究优先对照伊索尔德、露西、环状水星的 Cubism：分别覆盖表演型动作、机械/高参数模型和特效型参数动画。机器可读索引见 `catalog.json`。
