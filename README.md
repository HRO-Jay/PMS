# Payroll Management System

> 开弈集团多公司薪酬管理系统 — 替代 16 张 Excel 工作表的全栈 Web 应用

## ✨ 功能概览

| 模块 | 说明 |
|------|------|
| 🏢 花名册管理 | 27 家公司员工 CRUD、批量导入、社保基数管理 |
| 💰 薪资计算引擎 | 10 个核心公式、三种计税模式、公司差异化取整 |
| 🛡️ 社保公积金 | 上海/北京/天津/深圳/南京五地费率、个人+公司双向计算 |
| 📊 个税引擎 | 七级累进累计预扣法 + 劳务报酬 20% 法 + 免税模式 |
| 📋 考勤调整 | 病假/事假/年假/加班自动折算工资扣减 |
| 📤 报表导出 | 完整 Excel 模板导出（与原始格式一致）、工资条生成 |
| 🔐 权限控制 | Supabase Auth + RLS 行级安全、审计日志全记录 |

## 🏢 覆盖公司（27 家）

| 地区 | 公司 | 社保标准 |
|------|------|----------|
| 香港 (2) | 開弈（中國）人才服務有限公司、中國時代開弈投資集團有限公司 | 不计税 |
| 上海 (18) | 开弈信息科技（中国）有限公司、上海开弈人才服务（集团）有限公司、上海开弈人力资源管理有限公司 等 | 上海标准 (ROUND) |
| 北京 (1) | 北京开弈点才劳务服务有限公司 | 北京标准 (ROUNDUP) |
| 天津 (2) | 开弈英才（天津）劳务服务有限公司、弈享（天津）共享经济信息咨询有限公司 | 天津标准 |
| 深圳 (2) | 深圳市和弈劳务派遣有限公司、开弈信息技术（深圳）有限公司 | 深圳标准 (1位小数) |
| 南京 (1) | 南京开弈人力资源管理有限公司 | 南京标准 |

> 完整映射见 `company_mapping.json`

## 🛠️ 技术栈

```
Frontend  → React 18 + TypeScript + Ant Design 5 + AG Grid + ECharts
Backend   → Python FastAPI + SQLAlchemy 2.0 + Pydantic v2
Database  → Supabase (PostgreSQL 15) + Auth + RLS + Edge Functions
Cache     → Upstash Redis
CI/CD     → GitHub Actions → Vercel + Supabase
```

## 🚀 快速开始

### 前置条件

- [GitHub 账号](https://github.com) + [gh CLI](https://cli.github.com)
- [Supabase 账号](https://supabase.com) (免费层即可起步)
- [Vercel 账号](https://vercel.com) (免费层)
- Node.js 20+ / Python 3.11+ / Docker

### 一键部署流程

```bash
# 1️⃣ 克隆仓库
git clone https://github.com/YOUR_ORG/payroll-system.git
cd payroll-system
cp .env.example .env  # 填入你的密钥

# 2️⃣ 启动 Supabase 本地环境
supabase start

# 3️⃣ 初始化数据库 + 种子数据
supabase db push
python scripts/seed_companies.py

# 4️⃣ 启动后端 (Terminal 2)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

# 5️⃣ 启动前端 (Terminal 3)
cd frontend
npm install
npm start
```

打开 http://localhost:3000 即可使用。

### 部署到生产

```bash
# 推送 main 分支 → GitHub Actions 自动部署
git push origin main
# → 前端自动部署到 Vercel
# → 数据库迁移自动推送到 Supabase
```

## 📁 项目结构

```
payroll-system/
├── .github/workflows/ci.yml   # CI/CD 流水线
├── backend/                    # FastAPI 后端
├── frontend/                   # React 前端
├── supabase/                   # DB 迁移 + Edge Functions
├── scripts/                    # 工具脚本
├── company_mapping.json        # ★ 27 家公司简称↔全称映射
├── CLAUDE.md                  # ★ Claude Code 开发指引
└── README.md
```

## 🧪 测试

```bash
cd backend
pytest tests/ -v --cov=app --cov-fail-under=90
```

## 📄 文档

- `CLAUDE.md` — 给 Claude Code 的完整开发指引（公式、Schema、部署全在里面）
- `company_mapping.json` — 公司全称映射表（唯一权威来源）
- `supabase/seed.sql` — 数据库种子数据

## 🔐 安全

- 银行账号、身份证号 → AES-256 加密存储
- 所有表启用 RLS 行级安全
- 每次写入记录审计日志 (before/after JSONB)
- 锁定记录不可修改（需审批解锁）

## 📜 License

Private — 仅供开弈集团内部使用
