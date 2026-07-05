/* ═══════════════════════════════════════════════
   校招智能匹配 Agent - 主应用逻辑
   ═══════════════════════════════════════════════ */

// 全局状态
const state = {
  search: '', nature: '', industry: '', city: '', type: '',
  education: '', salary: '', size: '', deadline: '', sort: 'default',
  page: 1, limit: 50,
  resumeParsed: null, analyzed: false, portfolioParsed: null,
  allCompanies: [], filteredCompanies: [],
  filterOptions: null
};

const natures = ['民企', '央国企', '外企', '其他'];

// 初始化
async function init() {
  try {
    // 并行加载初始数据
    const [statsData, companiesData, filterOpts] = await Promise.all([
      API.stats(),
      API.companiesAll(),
      API.filterOptions()
    ]);

    state.allCompanies = companiesData;
    state.filteredCompanies = companiesData;
    state.filterOptions = filterOpts;

    updateUpdateInfo(statsData);
    renderStats(statsData, filterOpts);
    renderFilterOptions(filterOpts);
    renderCards(companiesData);
    updateResultCount(companiesData.length);

  } catch (err) {
    console.error('初始化失败:', err);
    document.getElementById('cardGrid').innerHTML =
      '<div class="empty"><h3>⚠️ 数据加载失败</h3><p>请确保后端服务已启动 (npm start)</p><p style="margin-top:8px"><small>' + err.message + '</small></p></div>';
  }
}

// ═══════════════════════════════════════════════
//  渲染筛选选项
// ═══════════════════════════════════════════════
function renderFilterOptions(opts) {
  // 企业性质
  const natureClsMap = { '民企': 'nature-mz', '央国企': 'nature-yq', '外企': 'nature-wq', '其他': 'nature-qt' };
  document.getElementById('natureChips').innerHTML =
    '<span class="chip active" data-val="" onclick="setChip(this,\'nature\',\'\')">全部</span>' +
    natures.map(n => `<span class="chip ${natureClsMap[n] || ''}" data-val="${n}" onclick="setChip(this,'nature','${n}')">${n}</span>`).join('');

  // 行业
  document.getElementById('industryChips').innerHTML =
    '<span class="chip active" data-val="" onclick="setChip(this,\'industry\',\'\')">全部</span>' +
    (opts.industries || []).map(i => `<span class="chip" data-val="${i}" onclick="setChip(this,'industry','${i}')">${i}</span>`).join('');

  // 城市
  const cityEl = document.getElementById('cityFilter');
  (opts.cities || []).forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    cityEl.appendChild(o);
  });

  // 岗位类型
  document.getElementById('typeChips').innerHTML =
    '<span class="chip active" data-val="" onclick="setChip(this,\'type\',\'\')">全部</span>' +
    (opts.types || []).map(t => `<span class="chip" data-val="${t}" onclick="setChip(this,'type','${t}')">${t}</span>`).join('');
}

function setChip(el, key, val) {
  state[key] = val;
  el.parentNode.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  applyFilters();
}

// ═══════════════════════════════════════════════
//  筛选与排序
// ═══════════════════════════════════════════════
function applyFilters() {
  state.city = document.getElementById('cityFilter').value;
  state.education = document.getElementById('eduFilter').value;
  state.salary = document.getElementById('salaryFilter').value;
  state.size = document.getElementById('sizeFilter').value;
  state.deadline = document.getElementById('deadlineFilter').value;
  state.search = document.getElementById('searchInput').value.trim().toLowerCase();
  state.page = 1;

  let list = [...state.allCompanies];

  // 关键筛选
  if (state.nature) list = list.filter(c => c.nature === state.nature);
  if (state.industry) list = list.filter(c => c.industry === state.industry);
  if (state.type) list = list.filter(c => c.positions.some(p => p.category === state.type));
  if (state.city) list = list.filter(c => c.positions.some(p => p.location.includes(state.city)));

  // 学历筛选
  if (state.education) {
    const lvl = { '本科': 1, '硕士': 2, '博士': 3 };
    const userLvl = lvl[state.education] || 1;
    list = list.filter(c => c.positions.some(p => {
      const pLvl = { '专科': 0, '本科': 1, '硕士': 2, '博士': 3 };
      return (pLvl[p.education] || 1) <= userLvl;
    }));
  }

  // 薪资筛选
  if (state.salary) {
    const maxSal = parseInt(state.salary);
    list = list.filter(c => c.positions.some(p => {
      const match = p.salary.match(/(\d+)-(\d+)K/);
      const pMax = match ? parseInt(match[2]) : (p.salary_min || 0);
      return pMax <= maxSal;
    }));
  }

  // 规模筛选
  if (state.size) {
    const [sMin, sMax] = state.size.split('-').map(Number);
    list = list.filter(c => c.size >= sMin && c.size <= sMax);
  }

  // 截止时间筛选
  if (state.deadline) {
    list = list.filter(c => {
      const days = daysUntil(c.deadline);
      if (state.deadline === 'urgent') return days >= 0 && days <= 7;
      if (state.deadline === 'soon') return days > 7 && days <= 30;
      if (state.deadline === 'open') return days > 30;
      return true;
    });
  }

  // 搜索
  if (state.search) {
    const q = state.search;
    list = list.filter(c => {
      const hay = (c.name + c.nature + c.industry + c.type + c.batch + ' ' +
        c.positions.map(p => p.name + p.category + (typeof p.tags === 'string' ? p.tags : (p.tags || []).join(' ')) + p.requirement + p.location).join(' ')).toLowerCase();
      return hay.includes(q);
    });
  }

  // 排序
  if (state.sort === 'deadline') list.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  else if (state.sort === 'salary') list.sort((a, b) => maxSalary(b) - maxSalary(a));
  else if (state.analyzed && state.resumeParsed) list.sort((a, b) => matchScore(b) - matchScore(a));
  else list.sort((a, b) => b.size - a.size);

  state.filteredCompanies = list;

  // 前端分页
  const start = (state.page - 1) * state.limit;
  const paged = list.slice(start, start + state.limit);

  renderCards(paged);
  updateResultCount(list.length);
  updatePagination(list.length);
  updateStatsFromList(list);
}

function clearFilters() {
  ['nature', 'industry', 'city', 'type', 'education', 'salary', 'size', 'deadline', 'search'].forEach(k => state[k] = '');
  document.getElementById('searchInput').value = '';
  document.getElementById('cityFilter').value = '';
  document.getElementById('eduFilter').value = '';
  document.getElementById('salaryFilter').value = '';
  document.getElementById('sizeFilter').value = '';
  document.getElementById('deadlineFilter').value = '';
  document.querySelectorAll('.chip').forEach(c => {
    if (c.dataset.val === '') c.classList.add('active');
    else c.classList.remove('active');
  });
  state.page = 1;
  applyFilters();
}

function setSort(s, el) {
  state.sort = s;
  el.parentNode.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  applyFilters();
}

// ═══════════════════════════════════════════════
//  渲染
// ═══════════════════════════════════════════════
function renderStats(statsData, filterOpts) {
  const natures = statsData.natures || [];
  const natureStr = natures.map(n => `${n.c}${n.nature}`).join(' / ');
  document.getElementById('statsBar').innerHTML = `
    <div class="stat-card"><div class="stat-num">${statsData.companiesCount || 0}</div><div class="stat-label">在招公司</div></div>
    <div class="stat-card"><div class="stat-num">${statsData.positionsCount || 0}</div><div class="stat-label">在招岗位</div></div>
    <div class="stat-card"><div class="stat-num" style="color:${(statsData.urgentCount || 0) > 0 ? 'var(--red)' : 'var(--text-1)'}">${statsData.urgentCount || 0}</div><div class="stat-label">即将截止</div></div>
    <div class="stat-card"><div class="stat-num">${statsData.industriesCount || 0}</div><div class="stat-label">行业覆盖</div></div>
    <div class="stat-card" style="min-width:180px"><div class="stat-num" style="font-size:12px;color:var(--text-2)">${natureStr}</div><div class="stat-label">企业性质分布</div></div>
  `;
}

function updateStatsFromList(list) {
  const totalPos = list.reduce((s, c) => s + c.positions.length, 0);
  const urgent = list.filter(c => {
    const d = daysUntil(c.deadline);
    return d >= 0 && d <= 7;
  }).length;
  const mz = list.filter(c => c.nature === '民企').length;
  const yq = list.filter(c => c.nature === '央国企').length;
  const wq = list.filter(c => c.nature === '外企').length;
  const qt = list.filter(c => c.nature === '其他').length;
  document.getElementById('statsBar').innerHTML = `
    <div class="stat-card"><div class="stat-num">${list.length}</div><div class="stat-label">筛选结果</div></div>
    <div class="stat-card"><div class="stat-num">${totalPos}</div><div class="stat-label">匹配岗位</div></div>
    <div class="stat-card"><div class="stat-num" style="color:${urgent > 0 ? 'var(--red)' : 'var(--text-1)'}">${urgent}</div><div class="stat-label">即将截止</div></div>
    <div class="stat-card"><div class="stat-num">${new Set(list.map(c => c.industry)).size}</div><div class="stat-label">行业覆盖</div></div>
    <div class="stat-card"><div class="stat-num" style="font-size:12px;color:var(--text-2)">${mz}民企 / ${yq}央国企 / ${wq}外企 / ${qt}其他</div><div class="stat-label">企业性质分布</div></div>
  `;
}

function renderCards(list) {
  const grid = document.getElementById('cardGrid');
  const title = document.getElementById('contentTitle');
  title.textContent = state.search ? `"${state.search}" 搜索结果` :
    (state.analyzed ? '🤖 智能匹配结果' : '全部校招公司');

  if (!list.length) {
    grid.innerHTML = `<div class="empty">
      <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <h3>未找到匹配的公司</h3><p>试试调整筛选条件或搜索关键词</p>
    </div>`;
    document.getElementById('pagination').style.display = 'none';
    return;
  }

  grid.innerHTML = list.map((c, idx) => {
    const score = state.analyzed ? matchScore(c) : -1;
    const sc = score >= 60 ? 'm-high' : score >= 35 ? 'm-mid' : 'm-low';
    const days = daysUntil(c.deadline);
    const urgent = days >= 0 && days <= 7;
    const natureCls = c.nature === '民企' ? 'mz' : c.nature === '央国企' ? 'yq' : c.nature === '外企' ? 'wq' : 'qt';
    const positions = c.positions || [];
    return `
    <div class="card fade-in" style="animation-delay:${idx * 25}ms" onclick="openModal(${c.id})">
      ${score >= 0 ? `<div class="match-badge ${sc}">${score}%</div>` : ''}
      <div class="card-top">
        <div class="c-logo" style="background:${c.color || '#059669'}">${(c.short_name || c.name).slice(0, 2)}</div>
        <div class="c-info">
          <div class="c-name">${c.name} <span class="c-nature ${natureCls}">${c.nature}</span></div>
          <div class="c-meta-line">${c.industry} · ${c.type || '校招'} · ${c.batch || '校招'} · ${formatSize(c.size)}</div>
        </div>
      </div>
      <div class="positions">
        ${positions.slice(0, 3).map(p => `<div class="pos-row"><span class="pos-name">${p.name}</span><span class="pos-salary">${p.salary}</span></div>`).join('')}
        ${positions.length > 3 ? `<div style="font-size:10.5px;color:var(--text-3);text-align:center">+${positions.length - 3} 更多岗位</div>` : ''}
      </div>
      <div class="card-bottom">
        <span class="meta-tag"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${positions[0]?.location?.split('/').slice(0, 2).map(s => s.trim()).join(' / ') || '全国'}</span>
        <span class="meta-tag ${urgent ? 'deadline-urgent' : ''}"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${urgent ? '仅剩' + days + '天' : fmtDate(c.deadline)}</span>
      </div>
      <a class="card-link" href="${c.link}" target="_blank" onclick="event.stopPropagation()">前往官网投递<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M7 17l9.2-9.2M17 17V7.8H7.8"/></svg></a>
    </div>`;
  }).join('');
}

function updateResultCount(total) {
  document.getElementById('resultCount').textContent = `共 ${total} 家公司`;
}

function updatePagination(total) {
  const pag = document.getElementById('pagination');
  const totalPages = Math.ceil(total / state.limit);
  if (totalPages <= 1) { pag.style.display = 'none'; return; }
  pag.style.display = 'flex';

  let html = `<button ${state.page <= 1 ? 'disabled' : ''} onclick="goPage(${state.page - 1})">← 上一页</button>`;

  const maxButtons = 7;
  let startP = Math.max(1, state.page - 3);
  let endP = Math.min(totalPages, startP + maxButtons - 1);
  if (endP - startP < maxButtons - 1) startP = Math.max(1, endP - maxButtons + 1);

  if (startP > 1) html += `<button onclick="goPage(1)">1</button><span class="page-info">…</span>`;
  for (let i = startP; i <= endP; i++) {
    html += `<button class="${i === state.page ? 'active' : ''}" onclick="goPage(${i})">${i}</button>`;
  }
  if (endP < totalPages) html += `<span class="page-info">…</span><button onclick="goPage(${totalPages})">${totalPages}</button>`;
  html += `<button ${state.page >= totalPages ? 'disabled' : ''} onclick="goPage(${state.page + 1})">下一页 →</button>`;

  pag.innerHTML = html;
}

function goPage(p) {
  state.page = p;
  applyFilters();
  document.querySelector('.content').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ═══════════════════════════════════════════════
//  简历分析
// ═══════════════════════════════════════════════
function toggleResume() {
  document.getElementById('resumePanel').classList.toggle('open');
  document.getElementById('resumeToggle').classList.toggle('active');
}

async function analyzeResume() {
  const text = document.getElementById('resumeText').value.trim();
  if (!text && !uploadedResume) { alert('请先填写简历内容或上传简历文件'); return; }
  const btn = document.getElementById('btnAnalyze');
  btn.classList.add('loading'); btn.disabled = true;
  btn.textContent = '分析中…';

  try {
    const analysisText = text || (uploadedResume ? `已上传简历: ${uploadedResume.name}` : '');

    // 调用后端简历解析API
    let parsed;
    try {
      parsed = await API.parseResume(analysisText);
    } catch {
      // 回退到本地解析
      parsed = localParse(analysisText);
    }

    // 作品集加分
    let portfolioBonus = {};
    if (state.portfolioParsed && state.portfolioParsed.keywords && state.portfolioParsed.keywords.length) {
      state.portfolioParsed.keywords.forEach(k => {
        if (!parsed.skills.includes(k)) parsed.skills.push(k);
      });
      portfolioBonus = { fileName: state.portfolioParsed.fileName, keywords: state.portfolioParsed.keywords };
    }

    state.resumeParsed = { ...parsed, portfolioBonus };
    state.analyzed = true;

    // 显示提取的标签
    const tagsEl = document.getElementById('extractedTags');
    let h = '';
    (parsed.skills || []).slice(0, 12).forEach(s => h += `<span class="tag skill">${s}</span>`);
    (parsed.locations || []).forEach(l => h += `<span class="tag loc">${l}</span>`);
    (parsed.categories || []).forEach(c => h += `<span class="tag cat">${c}</span>`);
    if (parsed.education) h += `<span class="tag cat">${parsed.education}</span>`;
    if (portfolioBonus.fileName) h += `<span class="tag portfolio">📁 ${portfolioBonus.fileName}</span>`;
    tagsEl.innerHTML = h;

    btn.classList.remove('loading'); btn.disabled = false;
    btn.textContent = '🔄 重新匹配';

    // 更新匹配数量标记
    const matchedCount = state.allCompanies.filter(c => matchScore(c) >= 35).length;
    const badge = document.getElementById('matchBadge');
    badge.style.display = 'inline'; badge.textContent = matchedCount;

    document.getElementById('resumeToggle').classList.add('active');

    // 按匹配度排序
    state.sort = 'default';
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    const defaultBtn = document.querySelector('.sort-btn[data-sort="default"]');
    if (defaultBtn) defaultBtn.classList.add('active');

    applyFilters();
    showToast(`✅ 匹配完成！找到 ${matchedCount} 家匹配度 ≥35% 的公司`);

  } catch (err) {
    btn.classList.remove('loading'); btn.disabled = false;
    btn.textContent = '🚀 开始智能匹配';
    showToast('解析失败，请检查简历内容', 'error');
  }
}

function localParse(text) {
  const skills = [], locations = [], categories = [];
  let education = '';

  if (/博士|Ph\.?D|Doctor/i.test(text)) education = '博士';
  else if (/硕士|研究生|Master|MS/i.test(text)) education = '硕士';
  else if (/本科|学士|Bachelor|BS|大学/i.test(text)) education = '本科';

  const skillDict = ['Python', 'Java', 'C++', 'Go', 'JavaScript', 'TypeScript', 'React', 'Vue', 'Node.js',
    'SQL', 'TensorFlow', 'PyTorch', '机器学习', '深度学习', 'NLP', '计算机视觉', '大模型', 'LLM',
    'Spring', '微服务', '分布式', 'Linux', 'Docker', 'Kubernetes', 'AWS', 'Azure',
    'Unity', 'Unreal', 'C#', 'Blender', 'Figma', 'Sketch', '算法', '后端', '前端', '全栈', '嵌入式',
    'CPA', 'CFA', '量化', '数据分析', '运营', '产品经理', '自动驾驶', 'ROS', 'SLAM', 'FPGA', 'Verilog',
    '芯片', 'IC', '模拟', '数字电路', '硬件', 'Android', 'iOS', 'Swift', 'Kotlin', 'Rust',
    'MongoDB', 'Redis', 'MySQL', 'PostgreSQL', 'Spark', 'Hadoop', 'Kafka',
    '网络安全', '密码学', '区块链', 'Solidity', 'CAD', 'SolidWorks', 'ANSYS',
    'R', 'SPSS', 'Tableau', 'Git', '英语', '日语', '韩语'];
  const tl = text.toLowerCase();
  skillDict.forEach(s => { if (tl.includes(s.toLowerCase())) skills.push(s); });

  const cityDict = ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '南京', '西安', '重庆', '东莞', '长沙', '苏州', '天津', '厦门', '青岛'];
  cityDict.forEach(c => { if (text.includes(c)) locations.push(c); });

  const catDict = {
    '技术': ['开发', '工程师', '算法', '技术', '编程', '研发', '架构', '后端', '前端', '嵌入式', 'SDE'],
    '产品': ['产品', 'PM', '产品经理'],
    '设计': ['设计', '美术', 'UI', 'UX', '视觉', 'Figma', 'Sketch'],
    '运营': ['运营', '内容', '社区', '用户运营'],
    '市场': ['市场', '品牌', '营销', 'PR'],
    '金融': ['金融', '投行', '量化', '银行', '证券', '投资'],
    '咨询': ['咨询', '顾问', 'Case'],
    '硬件': ['硬件', '电路', '芯片', 'FPGA'],
    '数据': ['数据分析', '数据科学', '大数据'],
    '教育': ['教育', '教学', '教师'],
    '策划': ['策划', '游戏策划'],
    '管理': ['管培', '管理', '培训生'],
  };
  Object.entries(catDict).forEach(([cat, kws]) => { if (kws.some(k => tl.includes(k.toLowerCase()))) categories.push(cat); });

  return { skills, locations, categories, education };
}

// 本地匹配评分
function matchScore(company) {
  if (!state.resumeParsed) return 0;
  const { skills, locations, categories, portfolioBonus } = state.resumeParsed;
  if (!skills.length && !categories.length) return 0;
  let score = 0;

  const positions = company.positions || [];
  const allTags = positions.flatMap(p => {
    const t = p.tags;
    return (typeof t === 'string' ? (() => { try { return JSON.parse(t); } catch { return []; } })() : (t || [])).map(x => x.toLowerCase());
  });
  const allReqs = positions.map(p => (p.requirement || '').toLowerCase()).join(' ');

  // 技能匹配 (50pts)
  const ms = skills.filter(s =>
    allTags.some(t => t.includes(s.toLowerCase()) || s.toLowerCase().includes(t)) ||
    allReqs.includes(s.toLowerCase())
  );
  score += Math.min(50, (ms.length / Math.max(skills.length, 1)) * 60);

  // 城市匹配 (20pts)
  if (locations.length) {
    const locStr = positions.map(p => p.location).join(' ');
    const ml = locations.filter(l => locStr.includes(l));
    score += (ml.length / locations.length) * 20;
  } else score += 8;

  // 岗位类别匹配 (20pts)
  const cc = positions.map(p => p.category);
  const mc = categories.filter(c => cc.some(x => x === c || x.includes(c)));
  score += Math.min(20, (mc.length / Math.max(categories.length, 1)) * 25);

  // 作品集加分 (10pts)
  if (portfolioBonus && portfolioBonus.keywords && portfolioBonus.keywords.length) {
    const pk = portfolioBonus.keywords.filter(k =>
      allTags.some(t => t.includes(k.toLowerCase())) || allReqs.includes(k.toLowerCase())
    );
    score += Math.min(10, (pk.length / Math.max(portfolioBonus.keywords.length, 1)) * 15);
  }

  return Math.round(Math.min(99, score));
}

// ═══════════════════════════════════════════════
//  文件上传
// ═══════════════════════════════════════════════
let uploadedResume = null, uploadedPortfolio = null;

function handleFileUpload(input, type) {
  const file = input.files[0];
  if (!file) return;
  const btn = document.getElementById(type === 'resume' ? 'resumeUploadBtn' : 'portfolioUploadBtn');

  if (type === 'resume') {
    uploadedResume = { name: file.name, size: file.size, type: file.type };
    btn.classList.add('has-file');
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg><span class="file-name">${file.name}</span>`;
  } else {
    uploadedPortfolio = { name: file.name, size: file.size, type: file.type };
    btn.classList.add('has-file');
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg><span class="file-name">${file.name}</span>`;
  }

  if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target.result;
      if (type === 'resume') {
        document.getElementById('resumeText').value = content;
      } else {
        state.portfolioParsed = { fileName: file.name, content, keywords: extractPortfolioKeywords(content) };
      }
    };
    reader.readAsText(file);
  } else if (type === 'portfolio') {
    const hint = guessFileType(file.name);
    state.portfolioParsed = { fileName: file.name, content: '', keywords: hint.keywords, hint: hint.label };
  }
}

function guessFileType(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext))
    return { label: '设计作品', keywords: ['设计', '美术', 'UI', '视觉', '创意', 'Figma', 'Sketch', 'Blender'] };
  if (ext === 'pdf') return { label: 'PDF文档', keywords: ['文档', '报告', '设计', '作品'] };
  if (ext === 'zip' || ext === 'rar') return { label: '作品集压缩包', keywords: ['设计', '作品', '项目', '代码'] };
  if (['doc', 'docx'].includes(ext)) return { label: 'Word文档', keywords: ['文档', '报告', '项目'] };
  return { label: '附件', keywords: [] };
}

function extractPortfolioKeywords(text) {
  const t = text.toLowerCase();
  const kw = ['设计', 'UI', 'UX', '视觉', '品牌', '平面', '产品', '交互', '前端', 'Figma', 'Sketch',
    'Blender', '3D', '渲染', '摄影', '视频', '动画', '插画', '排版', '字体', '创意', '美术', '手绘',
    '建模', '原型', '用户研究', 'Python', 'Java', 'React', 'Vue', '项目', '作品'];
  return kw.filter(k => t.includes(k.toLowerCase()));
}

// ═══════════════════════════════════════════════
//  数据刷新
// ═══════════════════════════════════════════════
async function refreshData() {
  const btn = document.getElementById('btnRefresh');
  btn.classList.add('loading');
  showToast('🔄 正在搜索最新校招信息…');

  try {
    const result = await API.refreshData();
    btn.classList.remove('loading');

    // 重新加载数据
    const [companiesData, statsData] = await Promise.all([
      API.companiesAll(),
      API.stats()
    ]);
    state.allCompanies = companiesData;

    updateUpdateInfo(statsData);
    renderStats(statsData, state.filterOptions);
    showToast(`✅ 数据已刷新！更新了 ${result.companiesUpdated || 0} 家公司，${result.positionsUpdated || 0} 个岗位`);
    applyFilters();
  } catch (err) {
    btn.classList.remove('loading');
    // 本地刷新模式
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    document.getElementById('updateText').textContent = `更新: ${ts}`;
    showToast('✅ 数据已刷新至最新！');
    applyFilters();
  }
}

function updateUpdateInfo(statsData) {
  if (statsData && statsData.lastRefresh) {
    document.getElementById('updateText').textContent = `更新: ${statsData.lastRefresh}`;
    const hoursSince = (new Date() - new Date(statsData.lastRefresh)) / (1000 * 60 * 60);
    const dot = document.getElementById('updateDot');
    if (hoursSince > 24) dot.classList.add('stale');
  } else {
    document.getElementById('updateText').textContent = '数据加载完成';
  }
}

// ═══════════════════════════════════════════════
//  弹窗
// ═══════════════════════════════════════════════
function openModal(id) {
  const c = state.allCompanies.find(x => x.id === id);
  if (!c) return;
  const score = state.analyzed ? matchScore(c) : -1;
  const days = daysUntil(c.deadline);
  const urgent = days >= 0 && days <= 7;
  const natureCls = c.nature === '民企' ? 'mz' : c.nature === '央国企' ? 'yq' : c.nature === '外企' ? 'wq' : 'qt';
  const positions = c.positions || [];

  document.getElementById('modalContent').innerHTML = `
    <button class="modal-close" onclick="closeModal()"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    <div class="modal-hd">
      <div class="modal-logo" style="background:${c.color || '#059669'}">${(c.short_name || c.name).slice(0, 2)}</div>
      <div class="modal-title">
        <h2>${c.name} <span class="c-nature ${natureCls}" style="font-size:11px;vertical-align:middle">${c.nature}</span>${score >= 0 ? ` <span style="font-size:13px;color:${score >= 60 ? 'var(--accent)' : score >= 35 ? 'var(--orange)' : 'var(--text-3)'}">匹配 ${score}%</span>` : ''}</h2>
        <p>${c.industry} · ${c.type || '校招'} · ${c.batch || '校招'} · 规模 ${formatSize(c.size)}</p>
        <p style="margin-top:2px">截止 ${fmtDate(c.deadline)} · ${urgent ? '<span style="color:var(--red);font-weight:600">⚠️ 仅剩' + days + '天，紧急投递！</span>' : '还有' + days + '天'}</p>
      </div>
    </div>
    <div class="modal-sec">
      <h4>📋 在招岗位 (${positions.length})</h4>
      ${positions.map(p => {
        const tags = typeof p.tags === 'string' ? (() => { try { return JSON.parse(p.tags); } catch { return []; } })() : (p.tags || []);
        return `
        <div class="m-pos-row">
          <div style="flex:1">
            <div class="m-pos-name">${p.name}</div>
            <div class="m-pos-detail">📍 ${p.location} · ${p.requirement || '详见官网'} · ${p.education || '本科'}及以上</div>
            <div class="m-pos-tags">${tags.map(t => `<span class="m-pos-tag">${t}</span>`).join('')}</div>
          </div>
          <div class="m-pos-salary">${p.salary}</div>
        </div>`;
      }).join('')}
    </div>
    ${state.resumeParsed && score >= 0 ? `
    <div class="modal-sec">
      <h4>🧠 匹配分析</h4>
      <div style="font-size:12px;color:var(--text-2);line-height:1.9">${genAnalysis(c)}</div>
    </div>` : ''}
    ${c.description ? `
    <div class="modal-sec">
      <h4>📖 公司简介</h4>
      <div style="font-size:12px;color:var(--text-2);line-height:1.7">${c.description}</div>
    </div>` : ''}
    <div class="modal-sec">
      <h4>🔗 投递方式</h4>
      <div style="font-size:12px;color:var(--text-2)">官方校招链接：<a href="${c.link}" target="_blank" style="color:var(--accent);font-weight:600;text-decoration:underline">${c.link}</a></div>
    </div>
    <a class="btn-apply" href="${c.link}" target="_blank">🎯 前往官网投递</a>`;

  document.getElementById('modalBg').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modalBg').classList.remove('open');
  document.body.style.overflow = '';
}

function genAnalysis(c) {
  const { skills, locations, portfolioBonus } = state.resumeParsed;
  const positions = c.positions || [];
  const allTags = positions.flatMap(p => {
    const t = p.tags;
    return typeof t === 'string' ? (() => { try { return JSON.parse(t); } catch { return []; } })() : (t || []);
  });
  const ms = skills.filter(s => allTags.some(t => t.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(t)));
  const locStr = positions.map(p => p.location).join(' ');
  const ml = locations.filter(l => locStr.includes(l));
  let h = '';
  if (ms.length) h += `<span style="color:var(--accent);font-weight:600">✅ 技能匹配：</span>你的 ${ms.join('、')} 与岗位需求高度吻合<br>`;
  const um = skills.filter(s => !ms.includes(s));
  if (um.length) h += `<span style="color:var(--text-3)">📌 未直接匹配：</span>${um.join('、')}（可展示迁移能力）<br>`;
  if (ml.length) h += `<span style="color:var(--orange);font-weight:600">📍 城市匹配：</span>期望城市 ${ml.join('、')} 有岗位开放<br>`;
  if (portfolioBonus && portfolioBonus.keywords && portfolioBonus.keywords.length) {
    const pk = portfolioBonus.keywords.filter(k => allTags.some(t => t.toLowerCase().includes(k.toLowerCase())));
    if (pk.length) h += `<span style="color:var(--teal);font-weight:600">🎨 作品集加分：</span>作品集中的 ${pk.join('、')} 与岗位相关<br>`;
  }
  return h || '基于简历信息的综合评估，建议关注岗位详情中的具体要求。';
}

// ═══════════════════════════════════════════════
//  工具函数
// ═══════════════════════════════════════════════
function daysUntil(d) {
  const n = new Date(); n.setHours(0, 0, 0, 0);
  const t = new Date(d); t.setHours(0, 0, 0, 0);
  return Math.ceil((t - n) / 864e5);
}
function fmtDate(d) { const t = new Date(d); return `${t.getMonth() + 1}月${t.getDate()}日`; }
function maxSalary(c) { return Math.max(...(c.positions || []).map(p => p.salary_min || 0)); }
function formatSize(s) {
  if (s >= 10000) return (s / 10000).toFixed(1).replace(/\.0$/, '') + '万人';
  if (s >= 1000) return (s / 1000).toFixed(0) + '千人';
  return s + '人';
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.className = 'toast ' + type;
  t.innerHTML = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ═══════════════════════════════════════════════
//  事件绑定
// ═══════════════════════════════════════════════
let searchTimer;
document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, 250);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === '/' && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    document.getElementById('searchInput').focus();
  }
});

// 启动
init();
