(function (root) {
  'use strict';

  root.AmazonNewsData = [
    {
      id: 'amazon-us-referral-fba-fees-2026',
      title: '2026 年美国站销售佣金与 FBA 费用更新',
      publishedAt: '2025-10-15',
      effectiveAt: '2026-01-15',
      lastVerifiedAt: '2026-09-18',
      marketplaces: ['US'], category: 'fees', importance: 'high',
      sourceType: 'news-amazon', sourceName: 'News_Amazon', sourceTier: 1,
      officialUrl: 'https://sellercentral.amazon.com/seller-forums/discussions/t/f3fa3211-820b-4e2e-a023-158a9cf55f99',
      summary: 'Amazon 公布 2026 年美国站销售佣金与 FBA 费用调整，FBA 费用平均每件增加约 0.08 美元，多数变更于 2026 年 1 月 15 日生效。',
      sellerImpact: ['美国站 FBA 卖家', '低利润 SKU', '需要更新费用假设的商品'],
      actionRequired: true, actionLevel: 'review', actionText: '按 2026 新费率重新核算受影响 SKU 的利润', actionType: 'recalculate-profit',
      recommendedActions: ['检查当前费用假设', '按新费率重新测算 SKU 利润', '核对 Fee and Economics Preview 报告'],
      affectedModules: ['profit'], tags: ['FBA fee', 'Referral Fee', '美国站', '费用'], status: 'active', relatedKnowledgeIds: []
    },
    {
      id: 'featured-offer-eligibility-2026',
      title: 'Featured Offer 卖家资格要求逐步调整',
      publishedAt: '2026-07-09', effectiveAt: '2026-07-20', lastVerifiedAt: '2026-09-18',
      marketplaces: ['Global'], category: 'listing', importance: 'medium',
      sourceType: 'news-amazon', sourceName: 'News_Amazon', sourceTier: 1,
      officialUrl: 'https://sellercentral.amazon.com/seller-forums/discussions/t/7336583f-09ac-41de-99d1-667017a88db2',
      summary: 'Amazon 自 2026 年 7 月起逐步移除 Featured Offer 的卖家资格前置筛选，并计划在年底前扩展至全球站点；卖家现有 Offer 会自动纳入。',
      sellerImpact: ['使用 Featured Offer 的卖家', '多卖家竞争 Listing'], actionRequired: false, actionLevel: 'none',
      recommendedActions: ['无需为本次资格调整单独操作', '继续关注价格、配送速度与绩效表现'],
      affectedModules: ['profitability'], tags: ['Featured Offer', 'Buy Box', 'Listing'], status: 'active', relatedKnowledgeIds: []
    },
    {
      id: 'product-title-update-july-2026',
      title: '产品标题更新自 2026 年 7 月 27 日起实施',
      publishedAt: '2026-06-10', effectiveAt: '2026-07-27', lastVerifiedAt: '2026-09-18',
      marketplaces: ['Global'], category: 'listing', importance: 'high',
      sourceType: 'news-amazon', sourceName: 'News_Amazon', sourceTier: 1,
      officialUrl: 'https://sellercentral.amazon.com/seller-forums/discussions/t/33f0a42a-17f1-46ef-b110-ba7512a3c881',
      summary: '除媒体类目外，产品标题需控制在 75 个字符以内；Item Highlights 另提供 125 个字符用于展示材料、用途等关键信息。',
      sellerImpact: ['非媒体类目卖家', '标题超过 75 字符的 Listing', '品牌所有者'], actionRequired: true, actionLevel: 'review', actionText: '检查并更新不符合新规则的产品标题', actionType: 'read-news',
      recommendedActions: ['检查 Listing 标题长度', '审核 Item Highlights 内容', '关注 Amazon 推荐变更并及时复核'],
      affectedModules: ['news'], tags: ['产品标题', 'Item Highlights', 'Listing', '75 字符'], status: 'active', relatedKnowledgeIds: []
    },
    {
      id: 'report-brand-violations-guided-2026',
      title: '品牌违规举报整合为统一引导流程',
      publishedAt: '2026-07-31', effectiveAt: null, lastVerifiedAt: '2026-09-18',
      marketplaces: ['Global'], category: 'brand', importance: 'medium',
      sourceType: 'amazon-blog', sourceName: 'Amazon Announcements', sourceTier: 1,
      officialUrl: 'https://sell.amazon.com/blog/announcements/report-a-violation',
      summary: 'Amazon Brand Registry 的 Report a Violation 现将知识产权、店铺政策和监管合规举报整合到一个引导式入口，并提供提交历史追踪。',
      sellerImpact: ['已加入 Brand Registry 的品牌', '需要处理侵权或违规的卖家'], actionRequired: false, actionLevel: 'info',
      recommendedActions: ['了解新的统一举报入口', '需要举报时使用结构化表单并追踪处理状态'],
      affectedModules: ['news'], tags: ['Brand Registry', 'Report a Violation', '品牌保护'], status: 'active', relatedKnowledgeIds: []
    },
    {
      id: 'seller-university-for-everyone-2026',
      title: 'Seller University 现已向所有人开放',
      publishedAt: '2026-07-02', effectiveAt: null, lastVerifiedAt: '2026-09-18',
      marketplaces: ['Global'], category: 'seller-central', importance: 'low',
      sourceType: 'seller-university', sourceName: 'Amazon Seller University', sourceTier: 1,
      officialUrl: 'https://sell.amazon.com/blog/announcements/seller-university-is-for-everyone',
      summary: 'Amazon Seller University 的免费教育资源现无需卖家账户或登录即可访问，覆盖 Listing、定价、履约、广告等主题。',
      sellerImpact: ['新卖家', '卖家运营与支持团队'], actionRequired: false, actionLevel: 'info',
      recommendedActions: ['按需要使用官方课程进行团队培训'], affectedModules: ['knowledge'],
      tags: ['Seller University', '培训', 'Seller Central'], status: 'active', relatedKnowledgeIds: []
    },
    {
      id: 'seller-news-mobile-experience-2026',
      title: 'Seller News 推出新的移动端体验',
      publishedAt: '2026-06-04', effectiveAt: null, lastVerifiedAt: '2026-09-18',
      marketplaces: ['Global'], category: 'seller-central', importance: 'low',
      sourceType: 'seller-news', sourceName: 'Amazon Seller News', sourceTier: 1,
      officialUrl: 'https://sell.amazon.com/blog/announcements/new-seller-news-mobile-experience',
      summary: 'Amazon 更新 Seller News 移动端体验，方便卖家通过手机查看与业务相关的平台动态。',
      sellerImpact: ['通过移动设备管理业务的卖家'], actionRequired: false, actionLevel: 'info',
      recommendedActions: ['按需了解并使用新的移动端资讯体验'], affectedModules: ['news'],
      tags: ['Seller News', '移动端', 'Seller Central'], status: 'active', relatedKnowledgeIds: []
    },
    {
      id: 'ca-fba-prep-labeling-end-2026',
      title: '加拿大站 FBA 预处理与贴标服务停止',
      publishedAt: '2026-04-01', effectiveAt: '2026-07-01', lastVerifiedAt: '2026-09-18',
      marketplaces: ['CA'], category: 'fba', importance: 'high',
      sourceType: 'sp-api', sourceName: 'Amazon SP-API', sourceTier: 1,
      officialUrl: 'https://developer-docs.amazon.com/sp-api/changelog',
      summary: '自 2026 年 7 月 1 日起，Amazon 不再为加拿大站 FBA 货件提供预处理和商品贴标服务，相关 API 参数不再接受 AMAZON。',
      sellerImpact: ['加拿大站 FBA 卖家', '使用 Amazon 预处理或贴标服务的入库流程', 'SP-API 集成商'], actionRequired: true, actionLevel: 'required', actionText: '检查加拿大站 FBA 入库预处理与贴标流程', actionType: 'check-inventory',
      recommendedActions: ['确认商品在发货前已完成预处理与贴标', '检查 Fulfillment Inbound API 的 prepOwner 与 labelOwner 参数'],
      affectedModules: ['inventory'], tags: ['CA', 'FBA', 'prep', 'labeling', 'SP-API'], status: 'active', relatedKnowledgeIds: []
    },
    {
      id: 'eu-vat-calculation-service-2026',
      title: '欧盟 VAT Calculation Service 更新',
      publishedAt: '2026-03-25', effectiveAt: '2026-06-01', lastVerifiedAt: '2026-09-18',
      marketplaces: ['EU'], category: 'compliance', importance: 'high',
      sourceType: 'sp-api', sourceName: 'Amazon SP-API', sourceTier: 1,
      officialUrl: 'https://developer-docs.amazon.com/sp-api/changelog',
      summary: 'Amazon 更新 VAT Calculation Service：VAT 报告增加波兰电子发票相关字段，并在十个欧盟站点转向按货件层级计算税额。',
      sellerImpact: ['使用 Amazon VAT Calculation Service 的欧盟卖家', '处理波兰电子发票数据的团队', '税务报告集成商'], actionRequired: true, actionLevel: 'review', actionText: '复核 VAT 报告与利润测算中的税务数据口径', actionType: 'recalculate-profit',
      recommendedActions: ['检查 VAT 报告字段兼容性', '复核按货件层级的税额处理逻辑', '结合税务顾问确认申报流程'],
      affectedModules: ['profit'], tags: ['VAT', 'EU', 'Poland', 'e-invoice', 'SP-API'], status: 'active', relatedKnowledgeIds: []
    }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
