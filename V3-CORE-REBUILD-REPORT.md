# V3 Core Controlled Rebuild Report

## 1. 新增文件

- `seller-profile.js`
- `news-relevance.js`
- `news-impact.js`
- `seller-intelligence-engine.js`
- `tests/seller-profile.test.js`
- `tests/news-relevance.test.js`
- `tests/news-impact.test.js`
- `tests/seller-intelligence-engine.test.js`
- 本报告 `V3-CORE-REBUILD-REPORT.md`

未修改 Dashboard UI、News Center、Candidate News、`news-data.js` 或 V2/V2.5 业务代码。

## 2. 模块 API

### SellerProfile

- `getProfile()`
- `saveProfile(profile)`
- `clearProfile()`
- `normalizeProfile(profile)`
- `validateProfile(profile)`
- `create(storage)`：测试和受控运行时依赖注入。

### NewsRelevance

- `evaluate(profile, news)`
- `getRelevance(profile, news)`

### NewsImpact

- `analyze(news, relevance, evaluatedAt)`
- `assess(news, relevance, evaluatedAt)`

### SellerIntelligence

- `evaluateNews(newsItem)`
- `evaluateAll(newsItems)`
- `getRelevantNews(newsItems)`
- `getImpactItems(newsItems)`
- `getPendingActions(newsItems)`
- `getDashboardModel(newsItems)`
- `create(dependencies)`：保留依赖注入能力。

## 3. 模块规则

### Seller Profile Core

- 仅持久化 `marketplaces`，Key 为 `sellerWorkbench.profile`。
- 站点代码执行大写、去空格、去重和白名单过滤。
- 拒绝把 `GLOBAL`、`EU` 写入卖家 Profile。
- Profile 缺失时不猜测站点。
- JSON 损坏、localStorage 不可用及读写/清除失败均安全返回状态。
- 支持 `configured`、`valid`、`repaired`、`unavailable` 状态信号。

### News Relevance Core

- 支持新 `marketplaces` 与旧 `marketplace` 字段，新字段优先。
- `GLOBAL` 新闻对所有卖家相关。
- 精确站点交集为相关。
- `EU` 仅展开为 DE、FR、IT、ES，UK 不属于 EU。
- 已知但无交集为 `irrelevant`；字段缺失、非法或 Profile 缺失为 `unknown`。
- 输出结构化 reasonCodes，且不修改输入对象。

### News Impact Analyzer

- `irrelevant` 映射 `none`，未知相关性映射 `unknown`。
- 相关、高重要性、需行动且已生效或 30 天内生效映射 `critical`。
- required action 或高重要性映射 `high`；受影响模块映射 `medium`；其余相关项映射 `low`。
- 使用 UTC 日历日计算 `daysUntilEffective`。
- 支持 `overdue`、`effective-soon`、`upcoming`、`active`、`unknown` 紧迫度。
- 兼容旧 `actionRequired` 字符串值，并保留未知 `actionType`。
- `confidence` 只描述结构化字段完整度。

### Seller Intelligence Engine

- 组合 SellerProfile、NewsRelevance、NewsImpact 与 NewsActionState，不复制其业务规则。
- 输出隔离的统一 `SellerIntelligenceItem`。
- 配置 Profile 时执行真实相关性判断；未配置时维持 V2/V2.5 全量兼容，并返回 `profileConfigured: false`。
- 批量评估只读取一次 Profile。
- `completed` 项不进入 Pending Actions。
- Dashboard Model 包含 `criticalImpacts`、`pendingActions`、`relevantHighPriority`、`relevantLatest`、`unknownMarketplace` 与 `counts`。
- 本阶段未加入 DailyBrief。

## 4. 测试数量

- Seller Profile：18 个专项场景。
- News Relevance：18 个专项场景。
- News Impact：24 个专项场景。
- Seller Intelligence Engine：18 个专项场景。
- V3 Core 合计：78 个专项场景。
- 完整测试集：15 个测试文件（原基线 11 个 + V3 新增 4 个）。

## 5. 完整测试结果

- Phase 2 专项测试：18/18 通过；当时完整测试集 12 个文件，0 failures。
- Phase 3 专项测试：18/18 通过；当时完整测试集 13 个文件，0 failures。
- Phase 4 专项测试：24/24 通过；当时完整测试集 14 个文件，0 failures。
- Phase 5 专项测试：18/18 通过。
- 最终完整测试集：15/15 个测试文件通过，0 failures。
- Node 对未配置 `--localstorage-file` 输出 ExperimentalWarning；这不是测试失败，相关不可用路径已有专项覆盖。

## 6. Git commit 列表

- `e03c1da` `docs: preserve V3 decision contract before core rebuild`
- `7ae8143` `Add V3 seller profile core`
- `3659329` `Add V3 news relevance core`
- `e5b2685` `Add V3 news impact analyzer`
- `173d920` `Add V3 seller intelligence engine`

报告提交的最终 SHA 以分支历史为准。

## 7. 当前 git status

受控 Git 副本在报告提交后应为 clean。原始工作目录的 `.git` 是不可写的空基线，因此不作为本次提交状态来源；所有受控提交均以独立克隆副本的 `v3-core-rebuild` 为准。

## 8. 当前 branch

`v3-core-rebuild`

未在 `main` 上开发，未合并 `main`，未推送 `main`。

## 9. 与 main 的差异

相对创建分支时的 `main`，仅新增：

- 已保留的 `V3-DECISION-CONTRACT.md`
- 4 个 V3 Core 实现文件
- 4 个对应专项测试文件
- 本验收报告

既有生产文件和 UI 文件不在本次差异范围内。

## 10. Decision Model Implementation 就绪判断

具备进入 Decision Model Implementation 的核心前置条件：Profile、相关性、影响分析、行动状态组合和 Dashboard 数据模型均有独立 API 与回归测试保护。

进入下一阶段前仍应先审阅本分支差异并确认数据契约；本次任务到 Core Recovery 验收即停止，不开发 Phase 6 或 UI。
