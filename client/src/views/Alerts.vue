<template>
  <div class="cyber-alerts">
    <!-- 顶部栏 -->
    <div class="top-bar">
      <div class="top-left">
        <h2 class="page-title">
          <span class="title-accent">系统告警</span> 配置
        </h2>
        <span class="alert-badge" :class="{ active: unresolvedCount > 0 }">
          <span class="badge-dot"></span>
          {{ unresolvedCount }} 未解决
        </span>
      </div>
      <div class="top-right">
        <el-button class="cyber-cut-btn btn-outline" @click="loadAlerts">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
      </div>
    </div>

    <!-- 告警统计卡片 -->
    <div class="alert-summary">
      <div class="cyber-panel-light cyber-cut summary-card danger">
        <div class="summary-value">{{ unresolvedCount }}</div>
        <div class="summary-label">未解决</div>
      </div>
      <div class="cyber-panel-light cyber-cut summary-card success">
        <div class="summary-value">{{ resolvedCount }}</div>
        <div class="summary-label">已解决</div>
      </div>
      <div class="cyber-panel-light cyber-cut summary-card warning">
        <div class="summary-value">{{ cookieAlertCount }}</div>
        <div class="summary-label">Cookie 过期</div>
      </div>
      <div class="cyber-panel-light cyber-cut summary-card info">
        <div class="summary-value">{{ todayAlertCount }}</div>
        <div class="summary-label">今日新增</div>
      </div>
    </div>

    <!-- 告警列表 -->
    <div class="alert-list">
      <div v-for="alert in alerts" :key="alert.id" class="alert-item" :class="{ resolved: alert.resolved }">
        <div class="alert-icon" :class="'alert-' + alert.level">
          <el-icon v-if="alert.level === 'danger'"><WarningFilled /></el-icon>
          <el-icon v-else-if="alert.level === 'warning'"><Warning /></el-icon>
          <el-icon v-else><InfoFilled /></el-icon>
        </div>
        <div class="alert-content">
          <div class="alert-title">{{ alert.title }}</div>
          <div class="alert-desc">{{ alert.description }}</div>
          <div class="alert-meta">
            <span class="alert-time">{{ alert.time }}</span>
            <span class="cyber-tag" :class="'tag-' + alert.level">
              {{ alert.level === 'danger' ? '严重' : alert.level === 'warning' ? '警告' : '信息' }}
            </span>
          </div>
        </div>
        <div class="alert-actions">
          <el-button v-if="!alert.resolved" class="cyber-cut-btn btn-sync" size="small" @click="resolveAlert(alert)">
            解决
          </el-button>
          <span v-else class="cyber-tag tag-success">已解决</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Refresh, WarningFilled, Warning, InfoFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const alerts = ref([
  { id: 1, level: 'danger', title: 'Cookie已失效', description: '账号「抖音达人」的登录Cookie已过期，数据采集已暂停。请重新扫码授权。', time: '10分钟前', resolved: false },
  { id: 2, level: 'danger', title: 'Cookie已失效', description: '账号「小红书博主」的登录Cookie已过期，数据采集已暂停。', time: '25分钟前', resolved: false },
  { id: 3, level: 'danger', title: 'Cookie已失效', description: '账号「旅行日记」的登录Cookie已过期，数据采集已暂停。', time: '1小时前', resolved: false },
  { id: 4, level: 'warning', title: '数据采集中断', description: '视频号平台数据采集连续失败3次，可能是接口变更导致。', time: '2小时前', resolved: false },
  { id: 5, level: 'warning', title: 'IP被限流', description: '抖音平台请求频率过高，IP已被临时限流。建议降低抓取频率。', time: '3小时前', resolved: false },
  { id: 6, level: 'info', title: '数据采集完成', description: '本次定时采集任务已完成，共更新 15 个视频数据。', time: '4小时前', resolved: true },
  { id: 7, level: 'info', title: '账号授权成功', description: '账号「视频号创作者」授权成功，已开始数据采集。', time: '6小时前', resolved: true },
  { id: 8, level: 'warning', title: '存储空间不足', description: '磁盘剩余空间不足 20%，建议清理历史数据。', time: '1天前', resolved: true },
])

const unresolvedCount = computed(() => alerts.value.filter(a => !a.resolved).length)
const resolvedCount = computed(() => alerts.value.filter(a => a.resolved).length)
const cookieAlertCount = computed(() => alerts.value.filter(a => a.title === 'Cookie已失效' && !a.resolved).length)
const todayAlertCount = computed(() => alerts.value.filter(a => !a.resolved).length)

const resolveAlert = (alert) => { alert.resolved = true; ElMessage.success('已解决') }
const loadAlerts = () => { ElMessage.success('告警已刷新') }
</script>

<style scoped>
/* ============================================
   白色赛博风格 - Alerts.vue
   ============================================ */
.cyber-alerts {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* ========== 裁切角 ========== */
.cyber-cut {
  clip-path: polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px);
}

.cyber-cut-btn {
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  font-family: 'Rajdhani', sans-serif !important;
  font-weight: 700 !important;
  letter-spacing: 1px;
  border: none !important;
  cursor: pointer;
  transition: all 0.2s ease;
}

/* ========== 白色面板 ========== */
.cyber-panel-light {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  box-shadow: 4px 4px 0px 0px rgba(0, 229, 255, 0.15);
  border-left: 4px solid #00E5FF;
  position: relative;
}

/* ========== 顶部栏 ========== */
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(0, 229, 255, 0.2);
}
.page-title {
  font-family: 'Orbitron', monospace;
  font-size: 18px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: 3px;
  margin: 0;
}
.title-accent {
  color: #00E5FF;
}
.alert-badge {
  font-family: 'Orbitron', monospace;
  font-size: 10px;
  color: #94A3B8;
  margin-left: 16px;
  letter-spacing: 1px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.alert-badge.active { color: #E11D48; }
.badge-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #94A3B8;
}
.alert-badge.active .badge-dot {
  background: #E11D48;
  box-shadow: 0 0 8px rgba(225, 29, 72, 0.4);
  animation: pulse-dot 2s ease-in-out infinite;
}
@keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.btn-outline {
  background: #F8FAFC !important;
  color: #0F172A !important;
  box-shadow: 3px 3px 0px 0px rgba(0, 139, 153, 0.3);
}
.btn-outline:hover {
  background: #F1F5F9 !important;
  box-shadow: 4px 4px 0px 0px rgba(0, 139, 153, 0.4);
  transform: translate(-1px, -1px);
}

/* ========== 告警统计卡片 ========== */
.alert-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.summary-card {
  padding: 22px;
  text-align: center;
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
}
.summary-card:hover {
  box-shadow: 6px 6px 0px 0px rgba(0, 229, 255, 0.25);
  transform: translateY(-2px);
}

/* 各级别左边框颜色 */
.summary-card.danger { border-left-color: #E11D48; }
.summary-card.success { border-left-color: #00E676; }
.summary-card.warning { border-left-color: #F59E0B; }
.summary-card.info { border-left-color: #00E5FF; }

.summary-value {
  font-family: 'Orbitron', monospace;
  font-size: 28px;
  font-weight: 900;
  letter-spacing: 2px;
  line-height: 1.2;
}
.summary-label {
  font-family: 'Orbitron', monospace;
  font-size: 10px;
  font-weight: 600;
  color: #94A3B8;
  margin-top: 6px;
  letter-spacing: 2px;
}

/* 各级别数值颜色 */
.summary-card.danger .summary-value {
  color: #E11D48;
}
.summary-card.success .summary-value {
  color: #059669;
}
.summary-card.warning .summary-value {
  color: #D97706;
}
.summary-card.info .summary-value {
  color: #0891B2;
}

/* ========== 告警列表 ========== */
.alert-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.alert-item {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  border: 1px solid #E2E8F0;
  border-radius: 6px;
  padding: 18px 22px;
  display: flex;
  align-items: center;
  gap: 18px;
  transition: all 0.3s ease;
}
.alert-item:hover {
  background: rgba(248, 250, 252, 1);
  border-color: rgba(0, 229, 255, 0.3);
  box-shadow: 4px 4px 0px 0px rgba(0, 229, 255, 0.1);
}
.alert-item.resolved { opacity: 0.5; }

/* 左侧图标 */
.alert-icon {
  width: 42px; height: 42px;
  border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; font-size: 20px;
}
.alert-icon.alert-danger {
  background: rgba(225, 29, 72, 0.08);
  border: 1px solid rgba(225, 29, 72, 0.2);
  color: #E11D48;
}
.alert-icon.alert-warning {
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
  color: #D97706;
}
.alert-icon.alert-info {
  background: rgba(0, 229, 255, 0.08);
  border: 1px solid rgba(0, 229, 255, 0.2);
  color: #0891B2;
}

/* 告警内容 */
.alert-content { flex: 1; min-width: 0; }
.alert-title {
  font-size: 14px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: 0.5px;
}
.alert-desc {
  font-size: 13px;
  color: #64748B;
  margin-top: 5px;
  line-height: 1.6;
}
.alert-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}
.alert-time {
  font-family: 'Orbitron', monospace;
  font-size: 10px;
  color: #94A3B8;
  letter-spacing: 1px;
}

/* 赛博标签 */
.cyber-tag {
  font-family: 'Orbitron', monospace;
  font-size: 9px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 4px;
  letter-spacing: 1px;
}
.tag-danger {
  color: #E11D48;
  border: 1px solid rgba(225, 29, 72, 0.25);
  background: rgba(225, 29, 72, 0.06);
}
.tag-warning {
  color: #D97706;
  border: 1px solid rgba(245, 158, 11, 0.25);
  background: rgba(245, 158, 11, 0.06);
}
.tag-info {
  color: #0891B2;
  border: 1px solid rgba(0, 229, 255, 0.25);
  background: rgba(0, 229, 255, 0.06);
}
.tag-success {
  color: #059669;
  border: 1px solid rgba(0, 230, 118, 0.25);
  background: rgba(0, 230, 118, 0.06);
}

/* 操作按钮 */
.alert-actions { flex-shrink: 0; }
.btn-sync {
  background: rgba(0, 229, 255, 0.08) !important;
  color: #0891B2 !important;
  box-shadow: 3px 3px 0px 0px rgba(0, 229, 255, 0.2) !important;
}
.btn-sync:hover {
  background: rgba(0, 229, 255, 0.15) !important;
  box-shadow: 4px 4px 0px 0px rgba(0, 229, 255, 0.3) !important;
  transform: translate(-1px, -1px);
}
</style>
