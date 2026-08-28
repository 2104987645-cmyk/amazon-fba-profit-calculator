(function () {
  'use strict';

  const routes = {
    '/': { type: 'dashboard', title: '工作台' },
    '/research/batch': { title: '批量选品分析', description: '批量导入 Amazon 产品数据，进行清洗、分类、筛选和市场机会分析。' },
    '/research/market': { title: '市场研究', description: '研究市场规模、需求趋势、竞争结构和机会方向。' },
    '/products': { title: '候选产品库', description: '集中管理进入研究流程的候选产品与统一 Product ID / ASIN。' },
    '/products/competitors': { title: '竞品 / ASIN', description: '研究候选 ASIN 的价格、销量、评论、竞争结构和产品表现。' },
    '/products/voc': { title: 'VOC 评论分析', description: '分析竞品评论中的高频痛点、购买动机、差评原因和产品改进机会。' },
    '/products/lifecycle': { title: '生命周期分析', description: '结合历史销量、BSR、关键词趋势等数据判断产品和市场生命周期。' },
    '/profit': { type: 'profit', title: 'FBA真实利润模拟器', topbar: '利润与风险', context: 'FBA Profit Simulator' },
    '/decision': { title: '决策中心', description: '未来汇总市场、竞争、VOC、利润和风险信息，形成统一选品决策。' },
    '/data/import': { title: '数据导入', description: '未来用于导入产品、市场和经营数据，并映射到统一 ProductRecord。' }
  };

  const modules = [
    ['01', '批量选品分析', 'Batch Product Analysis', '批量导入 Amazon 产品数据，进行清洗、分类、筛选和市场机会分析。', '/research/batch', false],
    ['02', '竞品 / ASIN 分析', 'Competitor & ASIN Analysis', '集中研究候选 ASIN 的价格、销量、评论、竞争结构和产品表现。', '/products/competitors', false],
    ['03', 'VOC 评论分析', 'Voice of Customer', '分析竞品评论中的高频痛点、购买动机、差评原因和产品改进机会。', '/products/voc', false],
    ['04', 'FBA真实利润模拟器', 'FBA Profit Simulator', '计算真实单件利润、利润率、ROI、广告盈亏平衡和压力测试。', '/profit', true],
    ['05', '生命周期分析', 'Lifecycle Analysis', '结合历史销量、BSR、关键词趋势等数据判断产品和市场生命周期。', '/products/lifecycle', false],
    ['06', '决策中心', 'Decision Center', '未来汇总市场、竞争、VOC、利润和风险信息形成统一选品决策。', '/decision', false]
  ];

  const calculator = document.querySelector('.app-shell');
  const calculatorFooter = document.querySelector('body > footer');
  const shell = document.createElement('div');
  shell.className = 'workbench-shell';
  shell.innerHTML = `
    <aside class="workbench-sidebar" id="workbenchSidebar">
      <div class="workbench-brand"><strong>Amazon Seller Workbench</strong><span>亚马逊选品与运营工作台</span></div>
      <nav class="workbench-nav" aria-label="主导航">
        <a href="#/" data-route="/"><b>01</b><span>工作台<small>Dashboard</small></span></a>
        <div class="nav-group"><p>选品研究</p><a href="#/research/batch" data-route="/research/batch">批量选品分析<em>即将推出</em></a><a href="#/research/market" data-route="/research/market">市场研究<em>即将推出</em></a></div>
        <div class="nav-group"><p>产品研究</p><a href="#/products" data-route="/products">候选产品库<em>即将推出</em></a><a href="#/products/competitors" data-route="/products/competitors">竞品 / ASIN<em>即将推出</em></a><a href="#/products/voc" data-route="/products/voc">VOC 评论分析<em>即将推出</em></a><a href="#/products/lifecycle" data-route="/products/lifecycle">生命周期分析<em>即将推出</em></a></div>
        <div class="nav-group"><p>利润与风险</p><a href="#/profit" data-route="/profit">FBA真实利润模拟器<span class="available-dot">可用</span></a></div>
        <a href="#/decision" data-route="/decision"><b>05</b><span>决策中心<small>即将推出</small></span></a>
        <div class="nav-group"><p>数据管理</p><a href="#/data/import" data-route="/data/import">数据导入<em>即将推出</em></a></div>
      </nav>
    </aside>
    <button class="sidebar-overlay" id="sidebarOverlay" aria-label="关闭菜单"></button>
    <section class="workbench-content">
      <header class="workbench-topbar"><button id="menuButton" class="menu-button" aria-label="打开导航" aria-expanded="false">☰</button><div><strong id="routeTitle">工作台</strong><span id="routeContext">Amazon Seller Workbench</span></div></header>
      <main id="workbenchView" class="workbench-view"></main>
    </section>`;
  document.body.prepend(shell);

  function createToolHeader({ title, subtitle, description, status, version, actions = [] }) {
    return `<div class="tool-header-main"><div class="tool-header-title"><div><h1>${title}</h1>${subtitle ? `<span>${subtitle}</span>` : ''}</div><div class="tool-header-meta">${version ? `<small>${version}</small>` : ''}${status ? `<b><i></i>${status}</b>` : ''}${actions.join('')}</div></div><p>${description}</p><div class="tool-header-breadcrumb">利润与风险 <span>/</span> ${subtitle}</div></div>`;
  }

  document.querySelector('#profitToolHeader').className = 'tool-header';
  document.querySelector('#profitToolHeader').innerHTML = createToolHeader({
    title: 'FBA真实利润模拟器',
    subtitle: 'FBA Profit Simulator',
    description: '计算真实单件利润、净利润率、ROI、广告盈亏边界与压力情景。',
    status: '实时模拟',
    version: 'V2'
  });

  const view = document.querySelector('#workbenchView');
  const sidebar = document.querySelector('#workbenchSidebar');
  const menuButton = document.querySelector('#menuButton');
  calculator.classList.add('profit-module');
  const profitHost = document.createElement('div');
  profitHost.id = 'profitModule';
  profitHost.className = 'route-page profit-route';
  profitHost.hidden = true;
  profitHost.append(calculator, calculatorFooter);
  view.append(profitHost);

  function dashboardMarkup() {
    return `<section class="dashboard-page route-page">
      <header class="dashboard-intro"><p>AMAZON SELLER WORKBENCH</p><h1>亚马逊选品与运营工作台</h1><span>从市场发现、产品研究、VOC、利润测算到采购决策的一体化工作台。</span></header>
      <section class="dashboard-start"><div><small>开始新的产品研究</small><h2>选择下一步工作</h2></div><div><a class="button secondary" href="#/data/import">导入产品数据</a><a class="button primary" href="#/profit">打开利润模拟器</a></div></section>
      <section class="module-section"><div class="module-heading"><h2>工作模块</h2><span>当前可用 2 个页面：工作台与利润模拟器</span></div><div class="module-grid">${modules.map(item => `<article class="module-card ${item[5] ? 'is-available' : ''}"><div><b>${item[0]}</b><span class="status ${item[5] ? 'available' : 'soon'}">${item[5] ? 'Available' : 'Coming Soon'}</span></div><h3>${item[1]}</h3><small>${item[2]}</small><p>${item[3]}</p><a href="#${item[4]}">${item[5] ? '打开工具' : '查看模块'}</a></article>`).join('')}</div></section>
    </section>`;
  }

  function placeholderMarkup(route) {
    return `<section class="placeholder-page route-page"><span class="status soon">Coming Soon</span><h1>${route.title}</h1><p>${route.description}</p><dl><div><dt>当前状态</dt><dd>即将推出</dd></div><div><dt>数据原则</dt><dd>未来围绕 Product ID / ASIN 使用统一 ProductRecord</dd></div></dl><a class="button primary" href="#/">返回工作台</a></section>`;
  }

  function currentPath() {
    const path = location.hash.replace(/^#/, '') || '/';
    return routes[path] ? path : '/';
  }

  function closeMenu() {
    document.body.classList.remove('sidebar-open');
    menuButton.setAttribute('aria-expanded', 'false');
  }

  function renderRoute() {
    const path = currentPath();
    const route = routes[path];
    document.querySelector('#routeTitle').textContent = route.topbar || route.title;
    document.querySelector('#routeContext').textContent = route.context || 'Amazon Seller Workbench';
    document.title = `${route.title} · Amazon Seller Workbench`;
    document.querySelectorAll('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === path));
    profitHost.hidden = route.type !== 'profit';
    view.querySelectorAll('.route-page:not(#profitModule)').forEach(node => node.remove());
    if (route.type === 'dashboard') view.insertAdjacentHTML('afterbegin', dashboardMarkup());
    else if (route.type !== 'profit') view.insertAdjacentHTML('afterbegin', placeholderMarkup(route));
    closeMenu();
    window.scrollTo(0, 0);
  }

  menuButton.addEventListener('click', () => {
    const open = document.body.classList.toggle('sidebar-open');
    menuButton.setAttribute('aria-expanded', String(open));
  });
  document.querySelector('#sidebarOverlay').addEventListener('click', closeMenu);
  window.addEventListener('hashchange', renderRoute);
  if (!location.hash) history.replaceState(null, '', '#/');
  renderRoute();
})();
