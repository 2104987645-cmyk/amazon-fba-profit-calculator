(function (root) {
  'use strict';
  const Engine = root.InventoryEngine;
  const PREFS_KEY = 'amazonSellerWorkbench.inventoryPreferences.v1';
  const STATUS_LABELS = { critical: '严重缺货风险', low: '补货风险', healthy: '健康', high: '偏高', overstock: '积压风险', unknown: '未知' };
  let host = null;
  let state = null;

  function freshState() {
    const prefs = readPrefs();
    return {
      awdRows: [], fbaRows: [], fileMeta: { awd: null, fba: null }, pending: {}, analysis: null,
      filters: { query: '', status: 'all', source: 'all' }, sort: { key: 'totalAvailable', direction: 'desc' },
      page: 1, pageSize: prefs.pageSize || 50, topCount: 10,
      thresholds: { ...Engine.DEFAULT_THRESHOLDS, ...(prefs.thresholds || {}) }, charts: { location: null, top: null }
    };
  }

  function readPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch (_) { return {}; } }
  function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ pageSize: state.pageSize, thresholds: state.thresholds })); } catch (_) {} }
  function el(id) { return host.querySelector(`#${id}`); }
  function formatUnits(value) { return value == null ? '—' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 }); }
  function bytes(value) { if (value < 1024) return `${value} B`; if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1048576).toFixed(1)} MB`; }

  function markup() {
    return `<section class="inventory-page route-page">
      <header class="inventory-header"><div><p>INVENTORY &amp; RESTOCK</p><h1>库存与补货分析</h1><span>合并 Amazon FBA 与 AWD 库存报告，快速查看可售库存、在途库存、库存覆盖天数与缺货/积压风险。</span></div><b><i></i>本地数据分析</b></header>
      <div class="inventory-privacy">库存报告仅在浏览器本地解析，不会上传到服务器。</div>
      <section class="inventory-section"><div class="inventory-section-title"><span>01</span><div><h2>数据导入</h2><p>支持单独分析 FBA、单独分析 AWD，或自动合并两份报告。</p></div><button type="button" id="inventoryReset" class="inventory-secondary">清空库存数据</button></div>
        <div class="upload-grid">${uploadCard('awd', 'AWD库存报告', 'Amazon Warehousing and Distribution')}${uploadCard('fba', 'FBA库存报告', 'Fulfillment by Amazon')}</div>
        <div id="inventoryLoading" class="inventory-message" hidden>正在解析库存报告...</div><div id="inventoryError" class="inventory-message error" hidden></div><div id="mappingPanel"></div>
      </section>
      <section id="inventoryEmpty" class="inventory-empty"><strong>上传 Amazon Seller Central 库存报告开始分析</strong><span>支持 FBA Inventory Report / AWD Inventory Report（CSV）</span></section>
      <div id="inventoryResults" hidden>
        <section class="inventory-section"><div class="inventory-section-title"><span>02</span><div><h2>库存概览</h2><p>数据模式：<strong id="inventoryMode">—</strong></p></div></div><div id="inventorySummary" class="inventory-summary"></div></section>
        <section class="inventory-section"><div class="inventory-section-title"><span>03</span><div><h2>库存分布</h2><p>按库存位置与SKU可售库存查看结构。</p></div></div><div class="inventory-chart-grid"><article><h3>库存位置分布</h3><div class="chart-frame"><canvas id="inventoryLocationChart"></canvas></div></article><article><div class="chart-heading"><h3>库存最高 SKU</h3><select id="inventoryTopCount"><option value="10">Top 10</option><option value="20">Top 20</option></select></div><div class="chart-frame"><canvas id="inventoryTopChart"></canvas></div></article></div></section>
        <section class="inventory-section"><div class="inventory-section-title"><span>04</span><div><h2>补货风险</h2><p>仅为库存覆盖天数风险提示，不构成自动补货结论。</p></div></div><div class="threshold-row"><label>严重≤<input id="criticalMax" type="number" min="0"></label><label>补货≤<input id="lowMax" type="number" min="0"></label><label>健康≤<input id="healthyMax" type="number" min="0"></label><label>偏高≤<input id="highMax" type="number" min="0"></label><button id="applyThresholds" type="button" class="inventory-secondary">应用阈值</button></div><div id="inventoryRiskCards" class="risk-grid"></div><div class="restock-note">补货建议功能将在接入销量与 Lead Time 后启用。</div></section>
        <section class="inventory-section"><div class="inventory-section-title"><span>05</span><div><h2>SKU库存明细</h2><p>搜索、筛选、排序与分页均在浏览器本地完成。</p></div></div>
          <div id="inventoryQuality" class="quality-panel"></div>
          <div class="inventory-toolbar"><input id="inventorySearch" type="search" placeholder="搜索 SKU / ASIN / 产品名称"><select id="inventoryStatusFilter"><option value="all">全部库存状态</option>${Object.entries(STATUS_LABELS).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select><select id="inventorySourceFilter"><option value="all">全部数据来源</option><option>FBA Only</option><option>AWD Only</option><option>FBA + AWD</option></select><label>每页 <select id="inventoryPageSize"><option>25</option><option selected>50</option><option>100</option><option value="all">All</option></select></label></div>
          <div class="inventory-table-wrap"><table><thead><tr><th>状态</th><th>产品</th><th>SKU</th><th>ASIN</th>${sortableHeader('AWD','awdAvailable')}${sortableHeader('FBA','fbaAvailable')}${sortableHeader('Inbound','fbaInbound')}${sortableHeader('总可售','totalAvailable')}${sortableHeader('总库存','totalStockIncludingInbound')}${sortableHeader('覆盖天数','daysOfSupply')}<th>库存状态</th><th>来源</th></tr></thead><tbody id="inventoryTableBody"></tbody></table></div>
          <div class="inventory-pagination"><span id="inventoryCount"></span><div><button id="prevInventoryPage" type="button">上一页</button><span id="inventoryPageInfo"></span><button id="nextInventoryPage" type="button">下一页</button></div></div>
        </section>
      </div>
    </section>`;
  }
  function uploadCard(type, title, subtitle) { return `<article class="upload-card" id="${type}Drop"><input id="${type}File" type="file" accept=".csv,text/csv"><label for="${type}File"><b>${title}</b><span>${subtitle}</span><em>点击上传或拖放 CSV 文件</em></label><div id="${type}FileStatus" class="file-status">尚未选择文件</div></article>`; }
  function sortableHeader(label, key) { return `<th><button type="button" data-sort="${key}">${label}</button></th>`; }

  function showError(message) { const node = el('inventoryError'); node.hidden = !message; node.textContent = message || ''; }
  function setLoading(loading) { el('inventoryLoading').hidden = !loading; }
  function looksGarbled(text) { return /�|锟斤拷/.test(text); }
  function findHeaderIndex(rows, source) {
    return rows.findIndex(row => {
      const headers = row.map(value => String(value || '').trim()).filter(Boolean);
      if (!headers.length) return false;
      const detected = Engine.detectMapping(headers, source);
      return detected.mapping.sku || (detected.mapping.asin && (detected.mapping.fbaAvailable || detected.mapping.awdAvailable));
    });
  }
  function arraysToObjects(rows, headerIndex) {
    const headers = rows[headerIndex].map((h, index) => String(h || `Column ${index + 1}`).replace(/^\uFEFF/, '').trim());
    const data = rows.slice(headerIndex + 1).filter(row => row.some(value => String(value ?? '').trim())).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
    return { headers, data };
  }

  function parseFile(file, source) {
    if (!file || !/\.csv$/i.test(file.name)) { showError('请选择 CSV 文件。'); return; }
    if (file.size === 0) { showError('CSV 文件为空。'); return; }
    if (!root.Papa) { showError('CSV 解析组件加载失败，请检查网络后刷新页面。'); return; }
    setLoading(true); showError('');
    root.Papa.parse(file, { header: false, skipEmptyLines: true, complete(results) {
      try {
        if (results.errors?.length) throw new Error(`CSV解析出现 ${results.errors.length} 个错误。`);
        if (!results.data?.length) throw new Error('CSV没有可读取的数据。');
        let headerIndex = findHeaderIndex(results.data, source);
        if (headerIndex < 0) headerIndex = results.data.findIndex(row => row.filter(value => String(value ?? '').trim()).length >= 2);
        if (headerIndex < 0) throw new Error('没有找到可用的标题行。');
        const parsed = arraysToObjects(results.data, headerIndex);
        if (looksGarbled(parsed.headers.join(' '))) throw new Error('文件编码可能不是 UTF-8。');
        state.pending[source] = { ...parsed, file };
        const detected = Engine.detectMapping(parsed.headers, source);
        if (detected.missing.length) { renderMapping(source, parsed, detected); return; }
        acceptParsed(source, file, parsed, detected.mapping);
      } catch (error) { showError(`解析失败：${error.message}`); }
      finally { setLoading(false); }
    }, error(error) { setLoading(false); showError(`CSV解析失败：${error.message || '未知错误'}`); } });
  }

  function renderMapping(source, parsed, detected) {
    const panel = el('mappingPanel'); panel.replaceChildren();
    const card = document.createElement('section'); card.className = 'mapping-card';
    const title = document.createElement('h3'); title.textContent = `${source.toUpperCase()} 字段映射`;
    const note = document.createElement('p'); note.textContent = `未识别字段：${detected.missing.join('、')}。当前列名：${parsed.headers.join('、')}`;
    card.append(title, note);
    const fields = source === 'awd' ? ['sku','asin','productName','awdAvailable','daysOfSupply'] : ['sku','asin','productName','fbaAvailable','fbaInbound','daysOfSupply'];
    fields.forEach(field => {
      const label = document.createElement('label'); label.textContent = `${field} `;
      const select = document.createElement('select'); select.dataset.mapField = field; select.dataset.source = source;
      select.append(new Option('请选择', ''));
      parsed.headers.forEach(header => select.append(new Option(header, header)));
      if (detected.mapping[field]) select.value = detected.mapping[field];
      label.append(select); card.append(label);
    });
    const button = document.createElement('button'); button.type = 'button'; button.className = 'inventory-primary'; button.textContent = '应用映射并分析';
    button.addEventListener('click', () => {
      const mapping = Object.fromEntries([...card.querySelectorAll('select')].map(select => [select.dataset.mapField, select.value || null]));
      const check = Engine.detectMapping(parsed.headers, source, mapping);
      if (check.missing.length) { showError(`仍未找到 ${check.missing.join('、')} 列，请完成映射。`); return; }
      acceptParsed(source, state.pending[source].file || { name: '已映射CSV', size: 0 }, parsed, mapping);
    });
    card.append(button); panel.append(card);
  }

  function acceptParsed(source, file, parsed, mapping) {
    state[`${source}Rows`] = parsed.data;
    state.fileMeta[source] = { name: file.name, size: file.size, rows: parsed.data.length, mapping };
    state.pending[source] = { ...parsed, file };
    el('mappingPanel').replaceChildren();
    const status = el(`${source}FileStatus`); status.replaceChildren();
    const name = document.createElement('strong'); name.textContent = `✓ ${file.name}`;
    const details = document.createElement('span'); details.textContent = `${bytes(file.size)} · ${parsed.data.length} 行 · 解析成功`;
    status.append(name, details); el(`${source}Drop`).classList.add('uploaded');
    analyzeAndRender();
  }

  function analyzeAndRender() {
    state.analysis = Engine.analyze({ awdRows: state.awdRows, fbaRows: state.fbaRows, mappings: {
      awd: state.fileMeta.awd?.mapping || {}, fba: state.fileMeta.fba?.mapping || {}
    }, thresholds: state.thresholds });
    if (!state.analysis.ok) { showError('仍有必要字段未完成映射。'); return; }
    el('inventoryEmpty').hidden = true; el('inventoryResults').hidden = false; el('inventoryMode').textContent = state.analysis.sourceMode;
    renderSummary(); renderRisks(); renderQuality(); renderTable(); renderCharts();
  }

  function renderSummary() {
    const cards = [
      ['SKU总数', state.analysis.summary.totalSkus], ['AWD可售库存', state.analysis.summary.awdAvailable],
      ['FBA可售库存', state.analysis.summary.fbaAvailable], ['FBA在途库存', state.analysis.summary.fbaInbound],
      ['总可售库存', state.analysis.summary.combinedAvailable], ['总库存（含Inbound）', state.analysis.summary.totalStock]
    ];
    const box = el('inventorySummary'); box.replaceChildren();
    cards.forEach(([label,value]) => { const article=document.createElement('article'); const span=document.createElement('span'); span.textContent=label; const strong=document.createElement('strong'); strong.textContent=formatUnits(value); article.append(span,strong); box.append(article); });
  }
  function renderRisks() {
    const t=state.thresholds;
    const config = [['critical','严重缺货风险',`≤${t.criticalMax} Days`],['low','补货风险',`${t.criticalMax+1}–${t.lowMax} Days`],['healthy','健康',`${t.lowMax+1}–${t.healthyMax} Days`],['high','偏高',`${t.healthyMax+1}–${t.highMax} Days`],['overstock','积压风险',`>${t.highMax} Days`],['unknown','未知','缺少DOS']];
    const box=el('inventoryRiskCards'); box.replaceChildren();
    config.forEach(([key,label,range])=>{ const button=document.createElement('button'); button.type='button'; button.className=`risk-card ${key}`; button.dataset.status=key; const b=document.createElement('b'); b.textContent=formatUnits(state.analysis.riskCounts[key]); const span=document.createElement('span'); span.textContent=label; const small=document.createElement('small'); small.textContent=range; button.append(b,span,small); button.addEventListener('click',()=>{state.filters.status=key;el('inventoryStatusFilter').value=key;state.page=1;renderTable();}); box.append(button); });
    ['criticalMax','lowMax','healthyMax','highMax'].forEach(key=>{el(key).value=state.thresholds[key];});
  }
  function renderQuality() {
    const q=state.analysis.quality; const box=el('inventoryQuality'); box.replaceChildren();
    const title=document.createElement('strong'); title.textContent='Data Quality'; box.append(title);
    const lines=[`${q.processed} 个SKU已处理`,`${q.duplicateSkus} 个重复SKU已合并`,`${q.missingAsin} 个SKU缺少ASIN`,`${q.missingProductName} 个SKU缺少产品名称`,`${q.missingDaysOfSupply} 个SKU缺少Days of Supply`,`${q.awdOnly} 个AWD独有SKU`,`${q.fbaOnly} 个FBA独有SKU`,`${q.warnings.length} 条数据校验警告`];
    const list=document.createElement('ul'); lines.forEach(line=>{const li=document.createElement('li');li.textContent=line;list.append(li);}); box.append(list);
    if(q.warnings.length){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='查看数据警告';const warningList=document.createElement('ul');q.warnings.slice(0,100).forEach(w=>{const li=document.createElement('li');li.textContent=w;warningList.append(li);});details.append(summary,warningList);box.append(details);}
  }

  function renderTable() {
    const items=Engine.filterAndSort(state.analysis.items,state.filters,state.sort); const all=state.pageSize==='all'; const pageSize=all?Math.max(items.length,1):Number(state.pageSize); const pages=Math.max(1,Math.ceil(items.length/pageSize)); state.page=Math.min(state.page,pages); const pageItems=all?items:items.slice((state.page-1)*pageSize,state.page*pageSize);
    const body=el('inventoryTableBody'); body.replaceChildren(); pageItems.forEach(item=>{
      const row=document.createElement('tr'); const values=[STATUS_LABELS[item.inventoryStatus],item.productName||'—',item.sku||'—',item.asin||'—',formatUnits(item.awdAvailable),formatUnits(item.fbaAvailable),formatUnits(item.fbaInbound),formatUnits(item.totalAvailable),formatUnits(item.totalStockIncludingInbound),item.daysOfSupply==null?'—':formatUnits(item.daysOfSupply),STATUS_LABELS[item.inventoryStatus],item.sourceMode];
      values.forEach((value,index)=>{const cell=document.createElement('td'); if(index===0){const chip=document.createElement('span');chip.className=`inventory-chip ${item.inventoryStatus}`;chip.textContent=value;cell.append(chip);}else cell.textContent=value;row.append(cell);}); body.append(row);
    });
    el('inventoryCount').textContent=`共 ${items.length} 个SKU`; el('inventoryPageInfo').textContent=`${state.page} / ${pages}`; el('prevInventoryPage').disabled=state.page<=1; el('nextInventoryPage').disabled=state.page>=pages;
    host.querySelectorAll('[data-sort]').forEach(button=>{button.classList.toggle('active',button.dataset.sort===state.sort.key);button.dataset.direction=button.dataset.sort===state.sort.key?state.sort.direction:'';});
  }

  function destroyCharts() { Object.keys(state.charts).forEach(key=>{state.charts[key]?.destroy();state.charts[key]=null;}); }
  function renderCharts() {
    destroyCharts(); if(!root.Chart) return;
    const s=state.analysis.summary; const location=[]; if(s.awdAvailable!=null)location.push(['AWD',s.awdAvailable,'#145a45']);if(s.fbaAvailable!=null)location.push(['FBA Available',s.fbaAvailable,'#58a382']);if(s.fbaInbound!=null)location.push(['FBA Inbound',s.fbaInbound,'#9bb7aa']);
    state.charts.location=new root.Chart(el('inventoryLocationChart'),{type:'doughnut',data:{labels:location.map(x=>x[0]),datasets:[{data:location.map(x=>x[1]),backgroundColor:location.map(x=>x[2]),borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label(ctx){const total=ctx.dataset.data.reduce((a,b)=>a+b,0);const pct=total?ctx.raw/total*100:0;return `${ctx.label}: ${formatUnits(ctx.raw)} units (${pct.toFixed(1)}%)`;}}}}}});
    const top=[...state.analysis.items].sort((a,b)=>b.totalAvailable-a.totalAvailable).slice(0,state.topCount);
    state.charts.top=new root.Chart(el('inventoryTopChart'),{type:'bar',data:{labels:top.map(i=>i.sku||i.asin||'未匹配'),datasets:[{data:top.map(i=>i.totalAvailable),backgroundColor:'#1d7458'}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false},tooltip:{callbacks:{title(items){const item=top[items[0].dataIndex];return item.productName||item.sku||'未命名产品';},label(ctx){return `Total Units: ${formatUnits(ctx.raw)}`;}}}},scales:{x:{beginAtZero:true}}}});
  }

  function resetData() {
    if(!confirm('确认清空当前库存数据吗？利润计算器、站点和汇率设置不会受到影响。'))return;
    destroyCharts(); state=freshState(); host.innerHTML=markup(); bind();
  }
  function bindDrop(source) {
    const drop=el(`${source}Drop`); const input=el(`${source}File`); input.addEventListener('change',()=>parseFile(input.files[0],source));
    drop.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('dragging');});drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('dragging');parseFile(event.dataTransfer.files[0],source);});
  }
  function bind() {
    bindDrop('awd');bindDrop('fba');el('inventoryReset').addEventListener('click',resetData);
    el('inventorySearch').addEventListener('input',event=>{state.filters.query=event.target.value;state.page=1;renderTable();});
    el('inventoryStatusFilter').addEventListener('change',event=>{state.filters.status=event.target.value;state.page=1;renderTable();});
    el('inventorySourceFilter').addEventListener('change',event=>{state.filters.source=event.target.value;state.page=1;renderTable();});
    el('inventoryPageSize').value=String(state.pageSize);el('inventoryPageSize').addEventListener('change',event=>{state.pageSize=event.target.value;state.page=1;savePrefs();renderTable();});
    el('inventoryTopCount').addEventListener('change',event=>{state.topCount=Number(event.target.value);renderCharts();});
    el('prevInventoryPage').addEventListener('click',()=>{if(state.page>1){state.page--;renderTable();}});el('nextInventoryPage').addEventListener('click',()=>{state.page++;renderTable();});
    host.onclick=event=>{const button=event.target.closest('[data-sort]');if(!button)return;const key=button.dataset.sort;state.sort={key,direction:state.sort.key===key&&state.sort.direction==='desc'?'asc':'desc'};renderTable();};
    el('applyThresholds').addEventListener('click',()=>{const values=['criticalMax','lowMax','healthyMax','highMax'].map(id=>Number(el(id).value));if(values.some(v=>!Number.isFinite(v)||v<0)||!(values[0]<values[1]&&values[1]<values[2]&&values[2]<values[3])){showError('阈值必须是依次递增的非负数字。');return;}state.thresholds={criticalMax:values[0],lowMax:values[1],healthyMax:values[2],highMax:values[3]};savePrefs();showError('');analyzeAndRender();});
  }

  function mount(container) { unmount(); host=container;state=freshState();host.innerHTML=markup();bind(); }
  function unmount() { if(state)destroyCharts();host=null;state=null; }
  root.InventoryModule=Object.freeze({mount,unmount});
})(typeof globalThis!=='undefined'?globalThis:this);
