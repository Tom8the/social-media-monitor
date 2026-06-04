<template>
  <div class="cyber-dashboard">
    <!-- 顶部栏 -->
    <div class="top-bar">
      <div class="top-left">
        <h2 class="page-title">
          <span class="title-deco">//</span> <span class="title-highlight">矩阵数据</span> 全景分析
        </h2>
        <span class="update-time">上次同步: {{ lastUpdateTime }}</span>
      </div>
      <div class="top-right">
        <el-button class="cyber-btn" @click="refreshData" :loading="refreshing">
          <el-icon><Refresh /></el-icon> 强制同步
        </el-button>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-radio-group v-model="activePlatform" size="default" @change="handleFilterChange">
        <el-radio-button label="">全部</el-radio-button>
        <el-radio-button label="douyin">抖音</el-radio-button>
        <el-radio-button label="xiaohongshu">小红书</el-radio-button>
        <el-radio-button label="videohao">视频号</el-radio-button>
      </el-radio-group>
      <el-radio-group v-model="activeTimeRange" size="default" @change="handleFilterChange">
        <el-radio-button label="today">今日</el-radio-button>
        <el-radio-button label="week">近7天</el-radio-button>
        <el-radio-button label="month">近30天</el-radio-button>
      </el-radio-group>
    </div>

    <!-- KPI 卡片 -->
    <div class="kpi-grid">
      <div v-for="(kpi, i) in kpiCards" :key="i" class="kpi-card cyber-panel-light cyber-cut" :class="'kpi-' + i">
        <div class="kpi-header">
          <span class="kpi-label">{{ kpi.label }}</span>
          <div class="kpi-indicator" :class="kpi.trendDir">
            <el-icon v-if="kpi.trendDir === 'up'" size="12"><Top /></el-icon>
            <el-icon v-else-if="kpi.trendDir === 'down'" size="12"><Bottom /></el-icon>
            <span>{{ kpi.trendText }}</span>
          </div>
        </div>
        <div class="kpi-value">{{ kpi.displayValue }}</div>
        <div v-if="kpi.warning" class="kpi-alert">
          <span class="alert-blink">⚠</span> {{ kpi.warning }}
        </div>
      </div>
    </div>

    <!-- 数据表格 -->
    <div class="data-panel cyber-panel-light">
      <div class="panel-header">
        <div class="panel-title">
          <span class="panel-deco">◆</span> 视频矩阵
        </div>
        <div class="panel-actions">
          <el-input v-model="searchKeyword" placeholder="搜索..." clearable class="cyber-search" @keyup.enter="loadVideos" @clear="loadVideos">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-button class="cyber-btn-outline" @click="handleExport">
            <el-icon><Download /></el-icon> 导出
          </el-button>
        </div>
      </div>

      <el-table :data="videos" v-loading="loading" style="width: 100%" class="light-table">
        <el-table-column label="平台" width="90" align="center">
          <template #default="{ row }">
            <span class="plat-dot" :class="'plat-' + row.platform"></span>
            <span class="plat-name">{{ getPlatformName(row.platform) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="账号" width="150">
          <template #default="{ row }">
            <div class="acc-cell">
              <div class="acc-avatar" :style="{ borderColor: getPlatColor(row.platform) }">
                <el-icon :size="14"><User /></el-icon>
              </div>
              <span class="acc-name">{{ row.account_nickname }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="内容" min-width="300">
          <template #default="{ row }">
            <div class="vid-cell">
              <div class="vid-cover" :style="{ borderColor: getPlatColor(row.platform) }">
                <img :src="getMediaUrl(row.cover_url)" @error="handleImgError" />
              </div>
              <div class="vid-info">
                <div class="vid-title">{{ row.title }}</div>
                <div class="vid-id">{{ row.video_id ? row.video_id.split('_').pop() : '--' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="播放" width="100" sortable sort-by="play_count" :title="'按播放排序'">
          <template #default="{ row }"><span class="num">{{ formatNumber(row.play_count) }}</span></template>
        </el-table-column>
        <el-table-column label="点赞" width="90" sortable sort-by="like_count" :title="'按点赞排序'">
          <template #default="{ row }"><span class="num">{{ formatNumber(row.like_count) }}</span></template>
        </el-table-column>
        <el-table-column label="评论" width="100" sortable sort-by="comment_count" :title="'按评论排序'">
          <template #default="{ row }"><span class="num">{{ formatNumber(row.comment_count) }}</span></template>
        </el-table-column>
        <el-table-column label="分享" width="90" sortable sort-by="share_count" :title="'按分享排序'">
          <template #default="{ row }"><span class="num">{{ formatNumber(row.share_count) }}</span></template>
        </el-table-column>
        <el-table-column label="收藏" width="90" sortable sort-by="collect_count" :title="'按收藏排序'">
          <template #default="{ row }"><span class="num">{{ formatNumber(row.collect_count) }}</span></template>
        </el-table-column>
        <el-table-column label="时间" width="110" sortable sort-by="published_at" :title="'按时间排序'">
          <template #default="{ row }"><span class="time">{{ formatTime(row.published_at) }}</span></template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[10, 20, 50]" :total="total" layout="total, sizes, prev, pager, next" @size-change="loadVideos" @current-change="loadVideos" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Refresh, Search, Download, Top, Bottom, User } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { statsApi, videoApi } from '../api'
import { getMediaUrl } from '../utils/media'

const activePlatform = ref('')
const activeTimeRange = ref('week')
const searchKeyword = ref('')
const loading = ref(false)
const refreshing = ref(false)
const videos = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const lastUpdateTime = ref('--:--')

const kpiCards = ref([
  { label: '总播放量', value: 0, displayValue: '---', trendDir: 'up', trendText: '+12.5%', warning: '' },
  { label: '互动总量', value: 0, displayValue: '---', trendDir: 'up', trendText: '+8.2%', warning: '' },
  { label: '新增粉丝', value: 4520, displayValue: '4,520', trendDir: 'down', trendText: '-1.5%', warning: '' },
  { label: '活跃账号', value: 12, displayValue: '12 / 15', trendDir: '', trendText: '', warning: '3 Cookie过期' }
])

const formatNumber = (n) => { if (!n) return '0'; if (n >= 10000) return (n / 10000).toFixed(1) + 'w'; return n.toLocaleString() }
const formatTime = (t) => { if (!t) return '--'; const d = new Date(t); const now = new Date(); const diff = now - d; const m = Math.floor(diff / 60000); const h = Math.floor(diff / 3600000); const dd = Math.floor(diff / 86400000); if (m < 60) return m + ' 分钟'; if (h < 24) return h + ' 小时'; if (dd < 30) return dd + ' 天'; return d.toLocaleDateString('zh-CN') }
const getPlatformName = (p) => ({ douyin: '抖音', xiaohongshu: '小红书', videohao: '视频号' }[p] || p)
const getPlatColor = (p) => ({ douyin: '#FE2C55', xiaohongshu: '#FF2442', videohao: '#07C160' }[p] || '#00f0ff')
const handleImgError = (e) => { e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="106" fill="%230d1225"><rect width="80" height="106" rx="2" stroke="%2300f0ff" stroke-width="0.5" fill="none"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%235a6a8a" font-size="10">无数据</text></svg>' }

const updateKPI = async () => {
  try {
    const res = await statsApi.getOverview()
    if (res.code === 0) {
      const d = res.data
      kpiCards.value[0].value = d.total_plays || 0
      kpiCards.value[0].displayValue = formatNumber(d.total_plays)
      kpiCards.value[1].value = (d.total_likes || 0) + (d.total_comments || 0) + (d.total_shares || 0)
      kpiCards.value[1].displayValue = formatNumber(kpiCards.value[1].value)
    }
  } catch (e) { console.error(e) }
  lastUpdateTime.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const loadVideos = async () => {
  loading.value = true
  try {
    const res = await videoApi.getList({ platform: activePlatform.value || undefined, timeRange: activeTimeRange.value, keyword: searchKeyword.value || undefined, sortBy: 'published_at', sortOrder: 'DESC', page: currentPage.value, pageSize: pageSize.value })
    if (res.code === 0) { videos.value = res.data.list; total.value = res.data.total }
  } catch (e) { ElMessage.error('加载失败') } finally { loading.value = false }
}

const handleFilterChange = () => { currentPage.value = 1; loadVideos() }
const refreshData = async () => { refreshing.value = true; await Promise.all([updateKPI(), loadVideos()]); refreshing.value = false; ElMessage.success('同步完成') }
const handleExport = () => { ElMessage.info('导出功能开发中...') }

onMounted(() => { updateKPI(); loadVideos() })
</script>

<style scoped>
/* ==================== 白色赛博风格 ==================== */

/* 裁切角 */
.cyber-cut {
  clip-path: polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px);
}
.cyber-cut-btn {
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
}

/* 白色半透明面板 */
.cyber-panel-light {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 229, 255, 0.15);
  border-left: 4px solid #00E5FF;
  box-shadow: 4px 4px 0px 0px rgba(0, 229, 255, 0.15);
  border-radius: 4px;
}

/* 主容器 */
.cyber-dashboard {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
  min-height: 100vh;
  background-color: #F8FAFC;
  background-image:
    linear-gradient(rgba(0, 229, 255, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 229, 255, 0.1) 1px, transparent 1px);
  background-size: 30px 30px;
}

/* ==================== 顶部栏 ==================== */
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(0, 229, 255, 0.2);
  padding: 16px 24px;
  border-radius: 4px;
  box-shadow: 4px 4px 0px 0px rgba(0, 229, 255, 0.1);
}
.page-title {
  font-family: 'Orbitron', monospace;
  font-size: 18px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: 3px;
  margin: 0;
}
.title-deco {
  color: #FF007A;
  margin-right: 8px;
}
.title-highlight {
  color: #06b6d4;
}
.update-time {
  font-family: 'Orbitron', monospace;
  font-size: 11px;
  color: #94a3b8;
  margin-left: 16px;
  letter-spacing: 1px;
}
.cyber-btn {
  font-family: 'Orbitron', monospace !important;
  font-weight: 700 !important;
  letter-spacing: 1px;
  background: #ffffff !important;
  color: #0F172A !important;
  border: 1px solid rgba(0, 229, 255, 0.3) !important;
  box-shadow: 3px 3px 0px 0px rgba(0, 229, 255, 0.15);
  transition: all 0.2s ease;
}
.cyber-btn:hover {
  border-color: #00E5FF !important;
  box-shadow: 3px 3px 0px 0px rgba(0, 229, 255, 0.3);
}

/* ==================== 筛选栏 ==================== */
.filter-bar {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}
.filter-bar :deep(.el-radio-button__inner) {
  background: #ffffff !important;
  color: #64748b !important;
  border-color: #e2e8f0 !important;
  font-family: 'Orbitron', monospace !important;
  font-size: 12px !important;
  letter-spacing: 1px;
  transition: all 0.2s ease;
}
.filter-bar :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: #ecfeff !important;
  color: #0e7490 !important;
  border-color: #00E5FF !important;
  box-shadow: -1px 0 0 0 #00E5FF !important;
}

/* ==================== KPI 卡片 ==================== */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.kpi-card {
  padding: 20px 22px;
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
}
.kpi-card:hover {
  box-shadow: 6px 6px 0px 0px rgba(0, 229, 255, 0.2);
  transform: translateY(-2px);
}
.kpi-1 { border-left-color: #00E5FF; }
.kpi-2 { border-left-color: #FF007A; }
.kpi-3 { border-left-color: #00E676; }
.kpi-4 { border-left-color: #f59e0b; }

.kpi-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.kpi-label {
  font-family: 'Orbitron', monospace;
  font-size: 10px;
  font-weight: 600;
  color: #94a3b8;
  letter-spacing: 2px;
}
.kpi-indicator {
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 3px;
  font-weight: 600;
}
.kpi-indicator.up { color: #00E676; }
.kpi-indicator.down { color: #FF007A; }

.kpi-value {
  font-family: 'Orbitron', monospace;
  font-size: 26px;
  font-weight: 900;
  color: #0F172A;
  letter-spacing: 2px;
  line-height: 1.2;
}
.kpi-1 .kpi-value {
  color: #0e7490;
  text-shadow: 2px 2px 0px rgba(0, 229, 255, 0.3);
}
.kpi-2 .kpi-value {
  color: #be185d;
  text-shadow: 2px 2px 0px rgba(255, 0, 122, 0.3);
}
.kpi-3 .kpi-value {
  color: #059669;
  text-shadow: 2px 2px 0px rgba(0, 230, 118, 0.3);
}
.kpi-4 .kpi-value {
  color: #d97706;
  text-shadow: 2px 2px 0px rgba(245, 158, 11, 0.3);
}

.kpi-alert {
  margin-top: 10px;
  font-size: 12px;
  color: #f59e0b;
  font-family: 'Orbitron', monospace;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.alert-blink { animation: blink 1.5s ease-in-out infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

/* ==================== 数据面板 ==================== */
.data-panel {
  padding: 20px;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}
.panel-title {
  font-family: 'Orbitron', monospace;
  font-size: 13px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: 2px;
}
.panel-deco {
  color: #00E5FF;
  margin-right: 8px;
  font-size: 10px;
}
.panel-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}
.cyber-search { width: 260px; }
.cyber-btn-outline {
  font-family: 'Orbitron', monospace !important;
  font-weight: 700 !important;
  letter-spacing: 1px;
  border-radius: 4px !important;
  border: 1px solid #e2e8f0 !important;
  color: #64748b !important;
  background: #ffffff !important;
  box-shadow: 3px 3px 0px 0px rgba(0, 229, 255, 0.1);
  transition: all 0.2s ease;
}
.cyber-btn-outline:hover {
  border-color: #00E5FF !important;
  color: #0e7490 !important;
  box-shadow: 3px 3px 0px 0px rgba(0, 229, 255, 0.2);
}

/* ==================== 浅色表格覆盖 ==================== */
.light-table :deep(.el-table__header-wrapper th.el-table__cell) {
  background-color: #f1f5f9 !important;
  color: #334155 !important;
  font-family: 'Orbitron', monospace !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  letter-spacing: 1px;
  border-bottom: 1px solid #e2e8f0 !important;
}
.light-table :deep(.el-table__body-wrapper td.el-table__cell) {
  background-color: #ffffff !important;
  color: #0F172A !important;
  border-bottom: 1px solid #f1f5f9 !important;
}
.light-table :deep(.el-table__body tr:hover > td.el-table__cell) {
  background-color: rgba(0, 229, 255, 0.05) !important;
}
.light-table :deep(.el-table__empty-block) {
  background-color: #ffffff !important;
}
.light-table :deep(.el-table__inner-wrapper::before) {
  background-color: #e2e8f0 !important;
}

/* ==================== 表格内样式 ==================== */
.plat-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}
.plat-dot.plat-douyin { background: #FF007A; box-shadow: 0 0 6px rgba(255, 0, 122, 0.4); }
.plat-dot.plat-xiaohongshu { background: #E11D48; box-shadow: 0 0 6px rgba(225, 29, 72, 0.4); }
.plat-dot.plat-videohao { background: #059669; box-shadow: 0 0 6px rgba(5, 150, 105, 0.4); }
.plat-name {
  font-size: 12px;
  color: #64748b;
  letter-spacing: 0.5px;
}

.acc-cell { display: flex; align-items: center; gap: 10px; }
.acc-avatar {
  width: 30px;
  height: 30px;
  border-radius: 4px;
  border: 1px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 229, 255, 0.06);
  color: #94a3b8;
}
.acc-name {
  font-size: 13px;
  color: #0F172A;
  font-weight: 600;
}

.vid-cell { display: flex; gap: 14px; }
.vid-cover {
  width: 76px;
  height: 100px;
  border-radius: 3px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  flex-shrink: 0;
  background: #f8fafc;
}
.vid-cover img { width: 100%; height: 100%; object-fit: cover; }
.vid-info { display: flex; flex-direction: column; justify-content: center; gap: 6px; min-width: 0; }
.vid-title {
  font-size: 13px;
  color: #0F172A;
  font-weight: 500;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.vid-id {
  font-family: 'Orbitron', monospace;
  font-size: 10px;
  color: #94a3b8;
  letter-spacing: 1px;
}

.num {
  font-family: 'Orbitron', monospace;
  font-size: 13px;
  font-weight: 600;
  color: #0F172A;
}
.time {
  font-family: 'Orbitron', monospace;
  font-size: 12px;
  color: #94a3b8;
  letter-spacing: 0.5px;
}

.pagination-wrap {
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
}
.pagination-wrap :deep(.el-pagination) {
  font-family: 'Orbitron', monospace;
}
.pagination-wrap :deep(.el-pager li.is-active) {
  background: #ecfeff !important;
  color: #0e7490 !important;
  border: 1px solid #00E5FF;
}
</style>
