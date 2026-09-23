# JOB-Trakcer · JobTracker CN

2027 届能源 / 风电 / CAE / 结构仿真校园招聘导航与个人投递进度管理。

## 已实现
- 公开浏览企业与官方招聘入口
- 搜索与筛选
- 邮箱注册 / 登录（Supabase Auth）
- 每个账号独立保存投递阶段与私人备注
- PostgreSQL + RLS：用户只能读取和修改自己的记录
- GitHub Pages 静态发布
- 手机 / 桌面适配

## 第一次上线
1. GitHub 仓库 **Settings → Pages**。
2. 在 **Build and deployment → Source** 选择 **Deploy from a branch**。
3. Branch 选择 **main**，Folder 选择 **/(root)**，点击 **Save**。
4. 公网站点会发布到：
   `https://g2066203208-beep.github.io/JOB-Trakcer/`

## 开启多人注册 / 登录
1. 在 Supabase 新建项目。
2. 在 SQL Editor 执行 `supabase-schema.sql`。
3. 把 Supabase Project URL 和 anon/publishable key 填进 `supabase-config.js`。
4. Supabase Authentication → URL Configuration：
   - Site URL: `https://g2066203208-beep.github.io/JOB-Trakcer/`
   - Redirect URLs: 加入同一地址

> anon/publishable key 是前端公开 key；严禁把 service_role key 放进 GitHub。真正的数据隔离由 RLS 实现。

## 注意
仓库名目前是 `JOB-Trakcer`（Trakcer）。如果之后改名为 `JOB-Tracker`，GitHub Pages 地址和 Supabase Redirect URL 也要一起更新。
