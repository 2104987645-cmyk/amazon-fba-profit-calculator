'use strict';

module.exports = [
  {
    id: 'amazon-sell-announcements',
    name: 'Amazon Sell 官方公告',
    url: 'https://sell.amazon.com/blog/announcements',
    allowedHost: 'sell.amazon.com',
    linkPattern: /^\/blog\/(?!announcements\/?$)[a-z0-9][a-z0-9-]*\/?$/i,
    requireDate: true,
    sourceType: 'amazon-blog'
  },
  {
    id: 'amazon-small-business-news',
    name: 'Amazon News · Small Business',
    url: 'https://www.aboutamazon.com/news/small-business',
    allowedHost: 'www.aboutamazon.com',
    linkPattern: /^\/news\/small-business\/[a-z0-9][a-z0-9-]*\/?$/i,
    sourceType: 'news-amazon'
  },
  {
    id: 'amazon-ads-newsroom',
    name: 'Amazon Ads 官方新闻中心',
    url: 'https://advertising.amazon.com/library/newsroom',
    allowedHost: 'advertising.amazon.com',
    linkPattern: /^\/library\/news\/[a-z0-9][a-z0-9-]*\/?$/i,
    sourceType: 'amazon-ads'
  }
];
