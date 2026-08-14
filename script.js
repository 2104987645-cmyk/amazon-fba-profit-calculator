const form = document.querySelector('#profit-form');
const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2 });

const ids = ['price', 'purchase', 'domestic', 'firstLeg', 'customs', 'fba', 'commissionRate', 'adRate', 'vatRate', 'returnRate'];
const inputs = Object.fromEntries(ids.map(id => [id, document.querySelector(`#${id}`)]));
const output = id => document.querySelector(`#${id}`);
const value = id => Math.max(0, Number.parseFloat(inputs[id].value) || 0);
const pct = n => `${Number.isFinite(n) ? n.toFixed(2) : '0.00'}%`;

function calculate() {
  const revenue = value('price');
  const commission = revenue * value('commissionRate') / 100;
  const advertising = revenue * value('adRate') / 100;
  const vatRate = value('vatRate') / 100;
  const vat = vatRate ? revenue * vatRate / (1 + vatRate) : 0;
  const returnLoss = revenue * value('returnRate') / 100;
  const fixedCosts = value('purchase') + value('domestic') + value('firstLeg') + value('customs') + value('fba');
  const totalCost = fixedCosts + commission + advertising + vat + returnLoss;
  const netProfit = revenue - totalCost;
  const margin = revenue ? netProfit / revenue * 100 : 0;
  const roi = totalCost ? netProfit / totalCost * 100 : 0;

  output('revenue').textContent = money.format(revenue);
  output('commission').textContent = `-${money.format(commission)}`;
  output('advertising').textContent = `-${money.format(advertising)}`;
  output('vat').textContent = `-${money.format(vat)}`;
  output('returnLoss').textContent = `-${money.format(returnLoss)}`;
  output('totalCost').textContent = money.format(totalCost);
  output('netProfit').textContent = money.format(netProfit);
  output('margin').textContent = pct(margin);
  output('roi').textContent = pct(roi);

  const status = output('profitStatus');
  status.textContent = netProfit >= 0 ? '盈利' : '亏损';
  status.classList.toggle('loss', netProfit < 0);
  output('netProfit').style.color = netProfit >= 0 ? 'var(--lime)' : '#ff9d9d';
}

form.addEventListener('input', calculate);
form.addEventListener('reset', () => requestAnimationFrame(calculate));
calculate();
