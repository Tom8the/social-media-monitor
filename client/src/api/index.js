import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

// 请求拦截器
api.interceptors.request.use(
  config => {
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 响应拦截器
api.interceptors.response.use(
  response => {
    return response.data
  },
  error => {
    console.error('API Error:', error)
    return Promise.reject(error)
  }
)

// 账号相关API
export const accountApi = {
  getList: (params) => api.get('/accounts', { params }),
  create: (data) => api.post('/accounts', data),
  update: (id, data) => api.put(`/accounts/${id}`, data),
  delete: (id) => api.delete(`/accounts/${id}`),
  profileSync: (id) => api.post(`/accounts/${id}/profile-sync`, {}, { timeout: 120000 }),
  sync: (id, params = {}) => api.post(`/accounts/${id}/sync`, params, { timeout: 900000 }),
  // 批量采集（带限流）
  batchSync: (data) => api.post('/accounts/batch-sync', data, { timeout: 900000 }),
  getBatchSyncStatus: (jobId) => api.get(`/accounts/batch-sync/${jobId}`),
  // 扫码登录相关
  generateQRCode: (data) => api.post('/accounts/qr-code/generate', data, { timeout: 120000 }),
  getQRCodeStatus: (sessionId) => api.get(`/accounts/qr-code/status/${sessionId}`),
  getLoginPreview: (sessionId, signal) => api.get(`/accounts/qr-code/preview/${sessionId}`, { responseType: 'blob', signal }),
  sendLoginInputs: (sessionId, events) => api.post(`/accounts/qr-code/input/${sessionId}`, { events }),
  cancelLogin: (sessionId) => api.delete(`/accounts/qr-code/session/${sessionId}`),
  mockScan: (data) => api.post('/accounts/qr-code/mock-scan', data),
  confirmLogin: (data) => api.post('/accounts/qr-code/confirm', data),
  // 全局采集Cookie
  getGlobalCookieStatus: (platform) => api.get('/accounts/global-cookie/status', { params: platform ? { platform } : {} }),
  saveGlobalCookie: (data) => api.post('/accounts/global-cookie/save', data),
  invalidateGlobalCookie: () => api.post('/accounts/global-cookie/invalidate'),
  deleteGlobalCookie: () => api.delete('/accounts/global-cookie'),
  searchVideohaoAccounts: (data) => api.post('/accounts/videohao/search-accounts', data, { timeout: 120000 }),
  startVideohaoLocalProxy: (data) => api.post('/videohao-local-proxy/start', data, { timeout: 120000 }),
  configureVideohaoLocalProxy: (data) => api.post('/videohao-local-proxy/configure', data, { timeout: 120000 }),
  desktopVideohaoSync: (data) => api.post('/videohao-local-proxy/desktop-sync', data, { timeout: 120000 }),
  getVideohaoCaptureStatus: () => api.get('/accounts/videohao/status', { timeout: 30000 }),
  stopVideohaoLocalProxy: () => api.post('/videohao-local-proxy/stop'),
  disableVideohaoSystemProxy: () => api.post('/videohao-local-proxy/disable-system-proxy'),
  getVideohaoLocalProxyStatus: () => api.get('/videohao-local-proxy/status'),
  // 真实数据采集（采集耗时较长，需要更长的超时时间）
  fetchFromUrl: (data) => api.post('/accounts/fetch-from-url', data, { timeout: 300000 }),
  fetchBySecUid: (data) => api.post('/accounts/fetch-by-secuid', data, { timeout: 60000 })
}

// 视频相关API
export const videoApi = {
  getList: (params) => api.get('/videos', { params }),
  create: (data) => api.post('/videos', data)
}

// 统计相关API
export const statsApi = {
  getOverview: () => api.get('/stats/overview'),
  getPlatformDistribution: () => api.get('/stats/platform-distribution'),
  getTrend: (params) => api.get('/stats/trend', { params }),
  getTop: (params) => api.get('/stats/top', { params })
}

export default api
