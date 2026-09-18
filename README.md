# Amazon Seller Workbench

## Auto News Update V1

`#/news` 现已包含独立的“待审核情报”区域。GitHub Actions 每天按北京时间 08:00、14:00、20:00 检查 Amazon Sell 官方公告、Amazon News Small Business 与 Amazon Ads 新闻中心。抓取结果只写入 `data/incoming-news.json`，不会自动进入正式 `news-data.js`，也不会触发 Dashboard / Action Center。

审核编辑结果保存在当前浏览器的 `localStorage`，状态显示为“已审核，待发布”。审核人员需导出正式 News JSON，人工检查后再合并到 `news-data.js`。静态 GitHub Pages 本身不会伪装成已写回仓库。

本地手动检查：

```powershell
node scripts/fetch-amazon-news.js
node tests/auto-news.test.js
```

自动检查坚持公开页面、透明 User-Agent、逐一请求、15 秒超时和部分失败容错；若全部来源失败，不修改候选池和来源状态。

一个运行在 GitHub Pages 的纯前端 Amazon 卖家经营分析工作台。

## 当前模块

- FBA真实利润模拟器：利润、广告盈亏、情景和敏感性分析。
- 库存与补货分析：导入 Amazon Seller Central 的 FBA/AWD CSV 报告，合并库存并识别缺货与积压风险。
- 广告与利润分析：导入周期汇总 CSV，按 SKU 分析 P&L、ACoS、TACoS、Break-even ACoS 和 Profit Leak。
- Amazon政策与运营动态：集中查看 Amazon 官方卖家政策、费用、履约、Listing、合规和平台功能更新。

## Amazon政策与运营动态

访问 `#/news`。V1 使用结构化、人工维护的数据文件，仅收录 Amazon 官方来源，不采集社区、媒体或第三方内容，也不会自动抓取网页。每条内容都保留 Amazon 官方原文链接、发布日期和最后人工核验日期。

页面内容用于卖家运营参考；政策、费用和功能可能持续调整，具体规则以 Amazon 官方原文和 Seller Central 实际通知为准。

Dashboard 首页通过 `NewsModule.getHighPriorityNews(3)` 和 `NewsModule.getLatestNews(5)` 展示精简的运营情报摘要；完整内容仍统一进入 `#/news` 查看。

## Seller Intelligence V2

Dashboard 的 Action Center 将需要处理的 Amazon 官方动态转化为行动事项，支持行动按钮、受影响业务模块跳转、标记已处理、查看已处理及恢复待处理。处理状态以新闻稳定 `id` 为键保存在浏览器 `localStorage` 的 `sellerWorkbench.newsStatus` 中。

News Center 支持 `importance`、`marketplace`、`category` 和 `module` 深度链接筛选，例如 `#/news?importance=high` 与 `#/news?module=profit`。新闻数据当前仍为人工维护；行动状态仅保存在当前浏览器，不会在不同设备之间同步。

## 广告与利润分析模块

访问 `#/profitability`。支持直接导入 Amazon Seller Central Business Report、Amazon Ads Advertised Product Report、Amazon Payments Transaction / Date Range Report，以及用户维护的 Product Cost CSV。系统自动识别报表、支持手动字段映射，并通过 SKU / ASIN 交叉映射合并数据。

支持的原生数据源：

- Business Reports → Detail Page Sales and Traffic by Child Item
- Sponsored Products → Advertised Product Report
- Payments → Transaction Report / Date Range Report
- Product Cost CSV 或页面映射

同类型新文件默认替换旧文件；重复文件会提示。销售、广告和费用必须使用相同分析周期与 Marketplace。费用以 Payments 实际数据为准，当前阶段不自动估算 Amazon Fee。

经营 CSV 仅在当前浏览器内解析，不上传服务器，也不会将原始数据写入 `localStorage`。所有成本字段默认表示所选分析周期内该 SKU 的总成本；组合 ACoS、TACoS 与净利润率按汇总金额重新计算，不平均 SKU 百分比。

## 库存模块

访问 `#/inventory`。支持 FBA Only、AWD Only 和 FBA + AWD 三种模式，包括：

- CSV字段自动识别与手动映射
- SKU/ASIN合并、重复库存求和
- 库存汇总、分布图、Top SKU图
- Days of Supply风险状态
- 数据质量、搜索、筛选、排序和分页

库存报告只在浏览器本地解析，不会上传到服务器，也不会长期写入
`localStorage`。不需要Seller Central账号凭证或SP-API授权。

## 第三方参考

库存模块的功能设计参考了MIT许可项目
[BWB03/inventory-dashboard](https://github.com/BWB03/inventory-dashboard)，并针对
Amazon Seller Workbench进行了重新实现。完整声明见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

CSV解析使用PapaParse，图表使用Chart.js。

广告与利润模块参考了 `sellerviewAI/amazon-profit-calculator` README 公开描述的 SKU-level P&L、ACoS、TACoS、Break-even ACoS 与 Profit Leak 产品概念；该模块的数据模型、中文界面和计算引擎均由本项目独立实现，并非复制其源代码。
