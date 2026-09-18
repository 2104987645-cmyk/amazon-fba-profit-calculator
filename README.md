# Amazon Seller Workbench

一个运行在 GitHub Pages 的纯前端 Amazon 卖家经营分析工作台。

## 当前模块

- FBA真实利润模拟器：利润、广告盈亏、情景和敏感性分析。
- 库存与补货分析：导入 Amazon Seller Central 的 FBA/AWD CSV 报告，合并库存并识别缺货与积压风险。
- 广告与利润分析：导入周期汇总 CSV，按 SKU 分析 P&L、ACoS、TACoS、Break-even ACoS 和 Profit Leak。

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
