# UniJob AI · 大学生就业智能平台

UniJob AI 是从 JOB-Trakcer 重构而来的全专业大学生就业平台。

## 当前已落地

- 445 家企业目标库，覆盖建筑基建、能源、新能源、汽车、机械、互联网/AI、金融、医药、消费、教育、半导体、航空航天、船舶等行业
- 154 个常见专业，覆盖工学、理学、经济学、管理学、文学、法学、教育学、医学、农学、艺术学、哲学、历史学
- 20 个行业分类
- 岗位大厅：关键词、行业、专业、地区、学历、7天内截止、排序
- 企业库：按行业、企业性质、是否已有岗位筛选
- 专业导航：按学科门类浏览专业并进入对应岗位
- 求职画像：学校、学历、专业、毕业年份、目标城市、目标行业、技能
- 可解释匹配：根据专业、学历、城市、行业和技能计算匹配度并给出匹配原因
- 我的求职：收藏、已申请、被拒
- 一键全网扫描：扫描多专业招聘关键词和企业招聘信息，并把发现结果写入当前浏览器岗位库
- 深色模式与移动端适配

## 项目结构

```
/
├── index.html
├── styles.css
├── src/
│   ├── app.js
│   ├── data-store.js
│   ├── matcher.js
│   └── scanner.js
├── data/
│   ├── jobs.json
│   ├── companies.json
│   ├── majors.json
│   ├── industries.json
│   └── skills.json
├── database/
│   └── schema.sql
├── crawler/
└── .github/workflows/
```

## 数据库

`database/schema.sql` 已建立 Supabase/PostgreSQL v2 数据模型：

- companies
- jobs
- majors
- skills
- user_profiles
- user_applications
- user_favorites

并包含用户数据 RLS 隔离策略。

## 当前部署

https://g2066203208-beep.github.io/JOB-Trakcer/

## 下一阶段

- Supabase 云端账户正式接入
- 后台招聘数据持久化入库
- 简历 PDF 解析
- AI 岗位匹配解释
- 面试助手
- 招聘数据审核与去重后台
