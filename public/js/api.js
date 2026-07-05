// API 客户端 - 与后端通信
const API = {
  base: '',

  async get(url) {
    const res = await fetch(this.base + url);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  async post(url, data) {
    const res = await fetch(this.base + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  async stats() { return this.get('/api/stats'); },
  async companies(params) {
    const qs = new URLSearchParams(params).toString();
    return this.get('/api/companies?' + qs);
  },
  async companiesAll() { return this.get('/api/companies-all'); },
  async companyDetail(id) { return this.get('/api/companies/' + id); },
  async searchJobs(q) { return this.get('/api/jobs/search?q=' + encodeURIComponent(q)); },
  async parseResume(text) { return this.post('/api/resume/parse', { text }); },
  async recommend(data) { return this.post('/api/recommend', data); },
  async refreshData() { return this.post('/api/refresh'); },
  async refreshLogs() { return this.get('/api/refresh-logs'); },
  async sources() { return this.get('/api/sources'); },
  async filterOptions() { return this.get('/api/filter-options'); },
  async saveJob(posId, status, notes) { return this.post('/api/jobs/' + posId + '/save', { status, notes }); },
  async savedJobs() { return this.get('/api/saved-jobs'); },
  async deleteSavedJob(id) {
    const res = await fetch(this.base + '/api/saved-jobs/' + id, { method: 'DELETE' });
    return res.json();
  }
};
