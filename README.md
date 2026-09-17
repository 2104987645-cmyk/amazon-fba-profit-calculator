# Amazon Seller Workbench

一个运行在 GitHub Pages 的纯前端 Amazon 卖家经营分析工作台。

## 当前模块

- FBA真实利润模拟器：利润、广告盈亏、情景和敏感性分析。
- 库存与补货分析：导入 Amazon Seller Central 的 FBA/AWD CSV 报告，合并库存并识别缺货与积压风险。

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
