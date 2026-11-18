<template>
  <div class="cyber-videos">
    <!-- 顶部栏 -->
    <div class="top-bar">
      <div class="top-left">
        <h2 class="page-title">
          <span class="title-deco">//</span> <span class="title-highlight">账号数据</span> 实时监控
        </h2>
      </div>
      <div class="top-right">
        <div class="global-cookie-monitor">
          <span class="global-cookie-label">授权状态</span>
          <button
            v-for="platform in globalCookiePlatforms"
            :key="platform.value"
            class="global-cookie-btn"
            :class="[
              'global-cookie-' + platform.value,
              { 'is-valid': globalCookieStates[platform.value]?.hasCookie }
            ]"
            :title="getGlobalCookieTitle(platform.value)"
            @click="openGlobalCookieLogin(platform.value)"
          >
            <span v-if="platform.value === 'douyin'" class="global-cookie-logo">
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M34.14 11.2a8.07 8.07 0 01-2.94-5.4V4h-6.6v27.04a4.76 4.76 0 01-4.76 4.56 4.76 4.76 0 01-4.76-4.76 4.76 4.76 0 014.76-4.76c.5 0 .98.08 1.44.22v-6.72a11.38 11.38 0 00-1.44-.1C12.76 19.48 7 25.24 7 32.24s5.76 12.76 12.84 12.76 12.84-5.76 12.84-12.76V18.84a14.7 14.7 0 008.32 2.56V14.8a8.12 8.12 0 01-6.86-3.6z" fill="currentColor"/>
              </svg>
            </span>
            <span v-else-if="platform.value === 'videohao'" class="global-cookie-logo">
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M24 6c9.94 0 18 6.72 18 15s-8.06 15-18 15c-2.04 0-4-.28-5.82-.82L9 40l2.1-7.44C7.96 29.82 6 25.78 6 21 6 12.72 14.06 6 24 6zm-4.5 10.5v9l8-4.5-8-4.5z" fill="currentColor"/>
              </svg>
            </span>
            <span v-else class="global-cookie-name">{{ platform.label }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 采集进度条 -->
    <div v-if="syncing" class="sync-progress-bar cyber-panel-light">
      <div class="sync-progress-header">
        <div class="sync-progress-title">
          <el-icon class="sync-icon"><Loading /></el-icon>
          正在采集数据...
        </div>
        <div class="sync-progress-stats">
          <span>{{ syncStatus.completed + syncStatus.failed }}/{{ syncStatus.total }} 完成</span>
          <span v-if="syncStatus.failed > 0" class="sync-failed">{{ syncStatus.failed }} 失败</span>
        </div>
      </div>
      <el-progress
        :percentage="syncPercentage"
        :stroke-width="8"
        color="#00E5FF"
        :show-text="false"
      />
      <div class="sync-progress-detail">
        <span v-if="syncStatus.currentAccount">当前: {{ syncStatus.currentAccount }}</span>
        <span v-if="syncStatus.total > 1" class="sync-rate-limit">每个账号间隔 10 秒（防风控）</span>
      </div>
    </div>

    <!-- 筛选栏 - 二级筛选结构 -->
    <div class="filter-bar cyber-panel-light">
      <div class="filter-row">
        <!-- 第一级：平台选择 -->
        <div class="filter-group">
          <label class="filter-label">
            <el-icon><Platform /></el-icon> 选择平台
          </label>
          <el-select
            v-model="selectedPlatform"
            placeholder="请选择平台"
            clearable
            @change="handlePlatformChange"
            class="filter-select platform-select"
          >
            <el-option label="全部平台" value="">
              <span class="plat-option">
                <span class="plat-dot plat-all"></span>
                全部平台
              </span>
            </el-option>
            <el-option
              v-for="platform in platforms"
              :key="platform.value"
              :label="platform.label"
              :value="platform.value"
            >
              <span class="plat-option">
                <span class="plat-dot" :class="'plat-' + platform.value"></span>
                {{ platform.label }}
              </span>
            </el-option>
          </el-select>
        </div>

        <!-- 第二级：账号选择 -->
        <div class="filter-group">
          <label class="filter-label">
            <el-icon><User /></el-icon> 选择账号
          </label>
          <el-select
            v-model="selectedAccount"
            placeholder="请选择账号"
            clearable
            @change="handleAccountChange"
            class="filter-select account-select"
          >
            <el-option label="全部账号" value="">
              <span class="account-option account-option-all">
                <div class="account-avatar account-avatar-fallback" style="border-color: #00E5FF;">
                  <el-icon><UserFilled /></el-icon>
                </div>
                <span class="account-name">全部账号</span>
              </span>
            </el-option>
            <el-option
              v-for="account in filteredAccounts"
              :key="account.id"
              :label="account.nickname"
              :value="account.id"
            >
              <div class="account-option" :class="'account-option-' + account.platform_code">
                <div class="account-avatar">
                  <img
                    v-if="account.avatar"
                    :src="getAvatarUrl(account.avatar)"
                    :alt="account.nickname"
                    @error="handleAvatarError"
                  />
                  <el-icon v-else><UserFilled /></el-icon>
                </div>
                <span class="account-name" :class="'account-name-' + account.platform_code">
                  {{ account.nickname }}
                </span>
                <span v-if="account.status !== 'active'" class="auth-badge auth-public">公开</span>
                <span v-else-if="account.cookie_data" class="auth-badge auth-deep">授权</span>
              </div>
            </el-option>
          </el-select>
        </div>

        <!-- 时间范围选择 -->
        <div class="filter-group time-range-group">
          <label class="filter-label">
            <el-icon><Calendar /></el-icon> 时间范围
          </label>
          <div class="time-range-wrapper">
            <el-radio-group v-model="timeRangeType" size="default" @change="handleTimeRangeTypeChange">
              <el-radio-button label="all">全部</el-radio-button>
              <el-radio-button label="7">近7天</el-radio-button>
              <el-radio-button label="14">近14天</el-radio-button>
              <el-radio-button label="30">近30天</el-radio-button>
              <el-radio-button label="custom">自定义</el-radio-button>
            </el-radio-group>
            <el-date-picker
              v-if="timeRangeType === 'custom'"
              v-model="customDateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              size="default"
              @change="handleCustomDateChange"
              class="custom-date-picker"
              value-format="YYYY-MM-DD"
            />
          </div>
        </div>

        <!-- 采集按钮 -->
        <div class="filter-group sync-group">
          <label class="filter-label">
            <el-icon><Refresh /></el-icon> 数据采集
          </label>
          <div class="sync-actions">
            <el-button
              class="cyber-btn sync-btn"
              @click="refreshData"
              :loading="syncing"
              :disabled="selectedPlatform === '' && selectedAccount === ''"
            >
              <el-icon><Refresh /></el-icon>
              {{ syncing ? '采集中...' : '开始采集' }}
            </el-button>
          </div>
        </div>
      </div>

      <!-- 当前筛选状态展示 -->
      <div class="filter-status" v-if="selectedPlatform !== '' || selectedAccount !== ''">
        <div class="status-item">
          <span class="status-label">当前监控:</span>
          <span class="platform-tag" :class="selectedPlatform ? 'plat-bg-' + selectedPlatform : 'plat-bg-all'">
            {{ selectedPlatform ? getPlatformName(selectedPlatform) : '全部平台' }}
          </span>
          <span class="account-tag">
            <el-icon><User /></el-icon>
            {{ selectedAccount ? getAccountName(selectedAccount) : '全部账号' }}
          </span>
          <span class="time-tag">
            <el-icon><Clock /></el-icon>
            {{ getTimeRangeText() }}
          </span>
        </div>
      </div>
    </div>

    <!-- 数据面板 -->
    <div class="data-panel cyber-panel-light">
      <div class="panel-header">
        <div class="panel-title">
          <span class="panel-deco">◆</span>
          <span
            v-if="selectedPanelAccount"
            class="panel-platform-prefix"
            :class="'panel-platform-' + selectedPanelPlatform"
          >
            <span class="panel-platform-logo" aria-hidden="true">
              <svg v-if="selectedPanelPlatform === 'douyin'" viewBox="0 0 48 48">
                <path d="M34.14 11.2a8.07 8.07 0 01-2.94-5.4V4h-6.6v27.04a4.76 4.76 0 01-4.76 4.56 4.76 4.76 0 01-4.76-4.76 4.76 4.76 0 014.76-4.76c.5 0 .98.08 1.44.22v-6.72a11.38 11.38 0 00-1.44-.1C12.76 19.48 7 25.24 7 32.24s5.76 12.76 12.84 12.76 12.84-5.76 12.84-12.76V18.84a14.7 14.7 0 008.32 2.56V14.8a8.12 8.12 0 01-6.86-3.6z" fill="currentColor"/>
              </svg>
              <span v-else-if="selectedPanelPlatform === 'xiaohongshu'" class="xhs-logo-text">小红书</span>
              <svg v-else-if="selectedPanelPlatform === 'videohao'" viewBox="0 0 48 48">
                <path d="M24 6c9.94 0 18 6.72 18 15s-8.06 15-18 15c-2.04 0-4-.28-5.82-.82L9 40l2.1-7.44C7.96 29.82 6 25.78 6 21 6 12.72 14.06 6 24 6zm-4.5 10.5v9l8-4.5-8-4.5z" fill="currentColor"/>
              </svg>
            </span>
            <span class="panel-platform-name">{{ getPlatformName(selectedPanelPlatform) }}</span>
          </span>
          {{ panelTitleText }}
        </div>
        <div class="panel-actions" v-if="selectedPlatform !== '' || selectedAccount !== ''">
          <el-input v-model="searchKeyword" placeholder="搜索视频标题..." clearable class="cyber-search" @keyup.enter="handleFilterChange" @clear="handleFilterChange">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-button class="cyber-btn-outline" @click="handleExport">
            <el-icon><Download /></el-icon> 导出数据
          </el-button>
        </div>
      </div>

      <!-- 数据表格 -->
      <el-table
        :data="videos"
        v-loading="loading"
        style="width: 100%"
        class="light-table"
        v-if="selectedPlatform !== '' || selectedAccount !== ''"
        stripe
      >
        <el-table-column label="视频" min-width="400">
          <template #default="{ row }">
            <div class="vid-cell" :class="{ 'is-deleted': row.is_deleted }">
              <div class="vid-cover" :style="{ borderColor: getPlatColor(row.platform_code || row.platform) }">
                <img :src="getMediaUrl(row.cover_url)" @error="handleImgError" />
                <span v-if="row.is_deleted" class="deleted-badge">已删除</span>
              </div>
              <div class="vid-info">
                <a
                  :href="row.video_url || `https://www.douyin.com/video/${row.video_id}`"
                  target="_blank"
                  class="vid-title-link"
                  :class="{ 'deleted-title': row.is_deleted }"
                  :title="row.title || '无标题'"
                >
                  {{ row.title || '无标题' }}
                </a>
                <div class="vid-meta">
                  <span v-if="row.account_nickname" class="vid-account">{{ row.account_nickname }}</span>
                  <span class="content-type-tag" :class="'content-type-' + getContentTypeKey(row)">
                    {{ getContentTypeText(row) }}
                  </span>
                  <span v-if="row.is_deleted" class="deleted-text">该视频已被作者删除</span>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="发布时间" width="120" sortable sort-by="published_at" align="center">
          <template #default="{ row }">
            <span class="time-date">{{ formatDate(row.published_at) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="播放量" width="120" sortable sort-by="play_count" align="right">
          <template #default="{ row }">
            <span v-if="isAuthedAccount(row)" class="num highlight-play">{{ formatNumber(row.play_count) }}</span>
            <span v-else class="num num-locked" title="公开检测账号无法获取播放量">-</span>
          </template>
        </el-table-column>

        <el-table-column label="点赞数" width="100" sortable sort-by="like_count" align="right">
          <template #default="{ row }">
            <span class="num highlight-like">{{ formatNumber(row.like_count) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="评论数" width="100" sortable sort-by="comment_count" align="right">
          <template #default="{ row }">
            <span class="num">{{ formatNumber(row.comment_count) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="分享数" width="90" sortable sort-by="share_count" align="right">
          <template #default="{ row }">
            <span class="num">{{ formatNumber(row.share_count) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="收藏数" width="90" sortable sort-by="collect_count" align="right">
          <template #default="{ row }">
            <span class="num">{{ formatNumber(row.collect_count) }}</span>
          </template>
        </el-table-column>
      </el-table>

      <!-- 空状态提示 -->
      <div v-if="selectedPlatform === '' && selectedAccount === ''" class="empty-state">
        <div class="empty-icon">
          <el-icon :size="64"><Monitor /></el-icon>
        </div>
        <h3 class="empty-title">开始监控账号数据</h3>
        <p class="empty-desc">请在上方选择平台和账号，然后点击「重新采集」获取最新数据</p>
      </div>

      <!-- 无数据提示 -->
      <div v-else-if="videos.length === 0 && !loading" class="empty-state">
        <div class="empty-icon">
          <el-icon :size="64"><VideoPlay /></el-icon>
        </div>
        <h3 class="empty-title">暂无视频数据</h3>
        <p class="empty-desc">选定条件在指定时间范围内暂无视频数据，请点击「重新采集」获取</p>
      </div>

      <div class="pagination-wrap" v-if="(selectedPlatform !== '' || selectedAccount !== '') && videos.length > 0">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleFilterChange"
          @current-change="loadVideos"
        />
      </div>
    </div>

    <el-dialog
      v-model="globalCookieDialogVisible"
      :title="`${getPlatformName(globalCookiePlatform)}全局Cookie授权`"
      width="420px"
      :close-on-click-modal="false"
      @close="closeGlobalCookieDialog"
    >
      <div class="global-cookie-dialog">
        <div v-if="globalCookieQrStatus === 'loading'" class="cookie-status-item">
          <el-icon :size="32" class="spin"><Loading /></el-icon>
          <p class="cookie-status-main">正在准备扫码登录...</p>
        </div>
        <div v-else-if="globalCookieQrStatus === 'pending'" class="cookie-status-item">
          <div class="cookie-status-icon pulse">
            <el-icon :size="48" color="#00E5FF"><Cellphone /></el-icon>
          </div>
          <p class="cookie-status-main">请使用 {{ getPlatformName(globalCookiePlatform) }} APP 扫码</p>
          <p class="cookie-status-sub">此授权仅用于公开监控采集，不会添加账号</p>
        </div>
        <div v-else-if="globalCookieQrStatus === 'scanned'" class="cookie-status-item">
          <div class="cookie-status-icon pulse">
            <el-icon :size="48" color="#00E5FF"><Loading /></el-icon>
          </div>
          <p class="cookie-status-main">已扫码，等待确认...</p>
          <p class="cookie-status-sub">请在手机上确认登录</p>
        </div>
        <div v-else-if="globalCookieQrStatus === 'confirmed'" class="cookie-status-item success">
          <div class="cookie-status-icon">
            <el-icon :size="48" color="#39ff14"><CircleCheckFilled /></el-icon>
          </div>
          <p class="cookie-status-main">授权成功</p>
        </div>
        <div v-else class="cookie-status-item error">
          <div class="cookie-status-icon">
            <el-icon :size="48" color="#ff003c"><CircleCloseFilled /></el-icon>
          </div>
          <p class="cookie-status-main">{{ globalCookieQrStatus === 'expired' ? '二维码已过期' : '授权失败' }}</p>
          <el-button class="cyber-btn" @click="startGlobalCookieLogin(globalCookiePlatform)">
            <el-icon><Refresh /></el-icon> 重新扫码
          </el-button>
        </div>
      </div>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, onActivated, computed, watch } from 'vue'
import { Refresh, Search, Download, User, UserFilled, Platform, Calendar, Clock, Monitor, VideoPlay, Loading, Filter, Cellphone, CircleCheckFilled, CircleCloseFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { videoApi, accountApi } from '../api'
import { getMediaUrl, getAvatarUrl } from '../utils/media'

// ========== 筛选状态 ==========
const platforms = [
  { value: 'douyin', label: '抖音' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'videohao', label: '视频号' }
]

const selectedPlatform = ref('')
const selectedAccount = ref('')
const timeRangeType = ref('all')
const customDateRange = ref([])
const searchKeyword = ref('')

// ========== 账号数据 ==========
const allAccounts = ref([])

const filteredAccounts = computed(() => {
  if (!selectedPlatform.value) return allAccounts.value
  return allAccounts.value.filter(acc => acc.platform_code === selectedPlatform.value)
})

const selectedPanelAccount = computed(() => {
  if (!selectedAccount.value) return null
  return allAccounts.value.find(acc => acc.id === selectedAccount.value) || null
})

const selectedPanelPlatform = computed(() => {
  return selectedPanelAccount.value?.platform_code || selectedPanelAccount.value?.platform || selectedPlatform.value || ''
})

// 面板标题
const panelTitleText = computed(() => {
  if (selectedAccount.value) {
    return getAccountName(selectedAccount.value) + ' - 视频数据列表'
  }
  if (selectedPlatform.value) {
    return getPlatformName(selectedPlatform.value) + ' - 全部账号视频数据'
  }
  return '请选择平台和账号查看数据'
})

// ========== 表格数据 ==========
const loading = ref(false)
const refreshing = ref(false)
const videos = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)

// ========== 采集状态 ==========
const syncing = ref(false)

// ========== 全局采集Cookie ==========
const globalCookiePlatforms = [
  { value: 'douyin', label: '抖音' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'videohao', label: '视频号' }
]
const globalCookieStates = ref({
  douyin: { hasCookie: false, isValid: false, updatedAt: null },
  xiaohongshu: { hasCookie: false, isValid: false, updatedAt: null },
  videohao: { hasCookie: false, isValid: false, updatedAt: null }
})
const globalCookieDialogVisible = ref(false)
const globalCookiePlatform = ref('douyin')
const globalCookieSessionId = ref('')
const globalCookieQrStatus = ref('')
const globalCookiePollTimer = ref(null)

const syncStatus = ref({
  jobId: null,
  total: 0,
  completed: 0,
  failed: 0,
  currentAccount: '',
  currentIndex: 0,
  status: 'idle'
})
let syncPollingTimer = null

const clearVideoSelectionState = () => {
  selectedAccount.value = ''
  videos.value = []
  total.value = 0
  currentPage.value = 1
}

const syncAccountSelectionState = () => {
  const accountIds = new Set(allAccounts.value.map(account => account.id))

  if (selectedAccount.value && !accountIds.has(selectedAccount.value)) {
    clearVideoSelectionState()
    return
  }

  if (selectedPlatform.value) {
    const hasPlatformAccounts = allAccounts.value.some(account => account.platform_code === selectedPlatform.value)
    if (!hasPlatformAccounts) {
      videos.value = []
      total.value = 0
      currentPage.value = 1
    }
  }
}

const syncPercentage = computed(() => {
  if (syncStatus.value.total === 0) return 0
  return Math.round(((syncStatus.value.completed + syncStatus.value.failed) / syncStatus.value.total) * 100)
})

// ========== 格式化方法 ==========
const formatNumber = (num) => {
  if (!num) return '0'
  if (num >= 10000) return (num / 10000).toFixed(1) + 'w'
  return num.toLocaleString()
}

const formatDate = (time) => {
  if (!time) return '--'
  const d = new Date(time)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const formatTimeAgo = (time) => {
  if (!time) return '--'
  const d = new Date(time)
  const now = new Date()
  const diffMs = now - d
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return diffMins + '分钟前'
  if (diffHours < 24) return diffHours + '小时前'
  if (diffDays < 30) return diffDays + '天前'
  return d.toLocaleDateString('zh-CN')
}

const getPlatformName = (p) => {
  const map = { douyin: '抖音', xiaohongshu: '小红书', videohao: '视频号' }
  return map[p] || p
}

const getPlatColor = (p) => {
  const map = { douyin: '#a855f7', xiaohongshu: '#FF2442', videohao: '#07C160' }
  return map[p] || '#00E5FF'
}

const getGlobalCookieTitle = (platform) => {
  if (platform === 'videohao') {
    const state = globalCookieStates.value.videohao
    return `视频号采集：${state?.message || '等待检测'}。点击重新检测`
  }
  const state = globalCookieStates.value[platform]
  const status = state?.hasCookie ? '已获取' : '未授权或已失效'
  const time = state?.updatedAt ? `，更新时间：${new Date(state.updatedAt).toLocaleString('zh-CN')}` : ''
  return `${getPlatformName(platform)}全局Cookie：${status}${time}。点击扫码登录`
}

const loadGlobalCookieStatus = async () => {
  try {
    const res = await accountApi.getGlobalCookieStatus()
    if (res.code === 0) {
      globalCookieStates.value = {
        ...globalCookieStates.value,
        ...(res.data.platforms || {})
      }
    }
    await loadVideohaoCaptureStatus(false)
  } catch (e) {
    console.error('加载全局Cookie状态失败', e)
  }
}

const openGlobalCookieLogin = async (platform) => {
  if (platform === 'videohao') {
    await loadVideohaoCaptureStatus(true)
    return
  }
  const state = globalCookieStates.value[platform]
  if (state?.hasCookie) {
    try {
      await ElMessageBox.confirm(
        `${getPlatformName(platform)}全局Cookie已存在，重新扫码会覆盖原有授权。是否继续？`,
        '重新授权',
        { confirmButtonText: '继续扫码', cancelButtonText: '取消', type: 'warning' }
      )
    } catch (e) {
      return
    }
  }
  startGlobalCookieLogin(platform)
}

const loadVideohaoCaptureStatus = async (showMessage = true) => {
  try {
    const res = await accountApi.getVideohaoCaptureStatus()
    if (res.code === 0) {
      globalCookieStates.value = {
        ...globalCookieStates.value,
        videohao: res.data
      }
      if (showMessage) {
        if (res.data.available) ElMessage.success(res.data.message || '视频号采集已连接')
        else ElMessage.warning(res.data.message || '视频号采集尚未连接')
      }
      return res.data.available
    }
  } catch (e) {
    if (showMessage) ElMessage.error('检测视频号采集失败：' + (e.response?.data?.message || e.message))
  }
  return false
}

const startGlobalCookieLogin = async (platform) => {
  closeGlobalCookieDialog()
  globalCookiePlatform.value = platform
  globalCookieDialogVisible.value = true
  globalCookieQrStatus.value = 'loading'
  try {
    const res = await accountApi.generateQRCode({ platform })
    if (res.code === 0) {
      globalCookieSessionId.value = res.data.sessionId
      globalCookieQrStatus.value = 'pending'
      startGlobalCookiePolling()
    } else {
      globalCookieQrStatus.value = 'error'
      ElMessage.error(res.message || '扫码登录打开失败')
    }
  } catch (e) {
    globalCookieQrStatus.value = 'error'
    ElMessage.error('扫码登录打开失败：' + (e.response?.data?.message || e.message))
  }
}

const startGlobalCookiePolling = () => {
  clearInterval(globalCookiePollTimer.value)
  globalCookiePollTimer.value = setInterval(async () => {
    if (!globalCookieSessionId.value || ['confirmed', 'expired', 'error'].includes(globalCookieQrStatus.value)) {
      clearInterval(globalCookiePollTimer.value)
      return
    }
    try {
      const res = await accountApi.getQRCodeStatus(globalCookieSessionId.value)
      if (res.code !== 0) return
      const newStatus = res.data.status
      if (newStatus === globalCookieQrStatus.value) return
      globalCookieQrStatus.value = newStatus
      if (newStatus === 'scanned') {
        ElMessage.info('已扫码，请在手机上确认')
      } else if (newStatus === 'confirmed') {
        clearInterval(globalCookiePollTimer.value)
        const cookieData = res.data.cookieData || res.data.accountInfo?.cookie_data
        if (!cookieData) {
          globalCookieQrStatus.value = 'error'
          ElMessage.warning('登录成功但未获取到Cookie，请重试')
          return
        }
        await accountApi.saveGlobalCookie({ platform: globalCookiePlatform.value, cookieData })
        await loadGlobalCookieStatus()
        ElMessage.success(`${getPlatformName(globalCookiePlatform.value)}全局Cookie已更新`)
        globalCookieDialogVisible.value = false
        closeGlobalCookieDialog()
      } else if (newStatus === 'expired') {
        ElMessage.warning('二维码已过期，请重新扫码')
      }
    } catch (e) {
      console.error('全局Cookie扫码状态查询失败', e)
    }
  }, 2000)
}

const closeGlobalCookieDialog = () => {
  clearInterval(globalCookiePollTimer.value)
  globalCookieSessionId.value = ''
  globalCookieQrStatus.value = ''
}

const getAccountName = (id) => {
  const account = allAccounts.value.find(acc => acc.id === id)
  return account ? account.nickname : '--'
}

const getSelectedCookiePlatform = () => {
  if (selectedAccount.value) {
    const account = allAccounts.value.find(acc => acc.id === selectedAccount.value)
    return account?.platform_code || account?.platform || 'douyin'
  }
  return selectedPlatform.value || 'douyin'
}

const selectionNeedsGlobalCookie = () => {
  if (selectedAccount.value) {
    const account = allAccounts.value.find(acc => acc.id === selectedAccount.value)
    if ((account?.platform_code || account?.platform) === 'videohao') return false
    return account?.status === 'public'
  }
  if (selectedPlatform.value) {
    if (selectedPlatform.value === 'videohao') return false
    return allAccounts.value.some(acc => acc.platform_code === selectedPlatform.value && acc.status === 'public')
  }
  return false
}

const getTimeRangeText = () => {
  if (timeRangeType.value === 'all') {
    return '全部数据'
  }
  if (timeRangeType.value === 'custom') {
    if (customDateRange.value && customDateRange.value.length === 2) {
      return `${customDateRange.value[0]} 至 ${customDateRange.value[1]}`
    }
    return '自定义时间'
  }
  return `近${timeRangeType.value}天数据`
}

// 判断是否为深度授权账号（播放量可见）
const isAuthedAccount = (row) => {
  return row.account_status === 'active'
}

const getContentTypeKey = (row) => {
  const type = String(row.content_type || row.contentType || 'video').toLowerCase()
  if (['note', 'image', 'images', 'article', 'graphic', '图文'].includes(type)) return 'image'
  return 'video'
}

const getContentTypeText = (row) => {
  return getContentTypeKey(row) === 'image' ? '图文' : '视频'
}

const handleImgError = (e) => {
  e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="106" fill="%23f1f5f9"><rect width="80" height="106" rx="4" fill="%23f1f5f9"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-size="12">无封面</text></svg>'
}

const handleAvatarError = (e) => {
  e.target.style.display = 'none'
}

// ========== 数据加载 ==========
const loadAccounts = async () => {
  try {
    const res = await accountApi.getList({ pageSize: 1000 })
    if (res.code === 0) {
      allAccounts.value = res.data.list || []
      syncAccountSelectionState()
    }
  } catch (e) {
    console.error('加载账号列表失败', e)
  }
}

const refreshAccountsIfVisible = () => {
  if (document.visibilityState === 'visible') {
    loadAccounts()
  }
}

const loadVideos = async () => {
  if (selectedPlatform.value === '' && selectedAccount.value === '') return

  loading.value = true
  try {
    const params = {
      platform: selectedPlatform.value || undefined,
      accountId: selectedAccount.value || undefined,
      keyword: searchKeyword.value || undefined,
      page: currentPage.value,
      pageSize: pageSize.value
    }

    // 处理时间范围参数
    if (timeRangeType.value === 'custom' && customDateRange.value && customDateRange.value.length === 2) {
      params.startDate = customDateRange.value[0]
      params.endDate = customDateRange.value[1]
    } else {
      params.timeRange = timeRangeType.value
    }

    const res = await videoApi.getList(params)
    if (res.code === 0) {
      videos.value = res.data.list || []
      total.value = res.data.total || 0
    }
  } catch (e) {
    ElMessage.error('加载视频数据失败')
  } finally {
    loading.value = false
  }
}

// ========== 采集功能 ==========
const refreshData = async () => {
  if (selectedPlatform.value === '' && selectedAccount.value === '') {
    ElMessage.warning('请先选择平台或账号')
    return
  }
  if (syncing.value) return

  // 检查全局Cookie状态
  try {
    const cookiePlatform = getSelectedCookiePlatform()
    const cookieRes = await accountApi.getGlobalCookieStatus(cookiePlatform)
    if (selectionNeedsGlobalCookie() && cookieRes.code === 0 && !cookieRes.data?.hasCookie) {
      ElMessageBox.confirm(
        `${getPlatformName(cookiePlatform)}公开监控需要先获取全局Cookie。请先扫码授权。`,
        '需要全局Cookie',
        { 
          confirmButtonText: '扫码授权', 
          cancelButtonText: '取消', 
          type: 'warning',
          closeOnClickModal: false
        }
      ).then(() => {
        openGlobalCookieLogin(cookiePlatform)
      }).catch(() => {})
      return
    }
  } catch (e) {
    console.error('检查Cookie状态失败', e)
  }

  doRefreshData()
}

const doRefreshData = async () => {
  syncing.value = true
  syncStatus.value = {
    jobId: null, total: 1, completed: 0, failed: 0, status: 'running',
    currentAccount: selectedAccount.value ? getAccountName(selectedAccount.value) : ''
  }

  try {
    const { startDate, endDate } = getTimeRangeDates()

    if (selectedAccount.value) {
      // 单个账号同步
      ElMessage.info(`正在采集 ${getAccountName(selectedAccount.value)} 的数据...`)
      const res = await accountApi.sync(selectedAccount.value, { startDate, endDate })
      if (res.code === 0) {
        const d = res.data || {}
        const parts = []
        if (d.addedCount) parts.push(`新增 ${d.addedCount}`)
        if (d.updatedCount) parts.push(`更新 ${d.updatedCount}`)
        if (d.deletedCount) parts.push(`删除 ${d.deletedCount}`)
        if (!parts.length && d.saved) parts.push(`保存 ${d.saved}`)
        const message = `采集完成：${parts.length ? parts.join('，') : '无变化'}`
        if (d.coverage?.hasMore || d.coverage?.ignored) ElMessage.warning(message + '，部分作品未采集')
        else ElMessage.success(message)
        await loadVideos()
      } else if (res.code === 401 && res.data?.needRelogin) {
        // Cookie失效，重新授权
        ElMessageBox.alert(
          '全局Cookie已过期，请重新扫码授权后再采集。',
          '登录过期',
          { 
            confirmButtonText: '扫码授权', 
            type: 'warning',
            callback: () => {
              openGlobalCookieLogin(getSelectedCookiePlatform())
            }
          }
        )
      } else {
        ElMessage.error(res.message || '采集失败')
      }
    } else if (selectedPlatform.value) {
      // 按平台批量同步
      ElMessage.info(`正在采集 ${getPlatformName(selectedPlatform.value)} 的数据...`)
      const res = await accountApi.batchSync({ platform: selectedPlatform.value, startDate, endDate })
      if (res.code === 0) {
        if (!res.data?.total) {
          ElMessage.info('没有待采集的账号')
          return
        }
        syncStatus.value = { jobId: res.data.jobId, total: res.data.total, completed: 0, failed: 0, status: 'running' }
        startSyncPolling(res.data.jobId)
      } else if (res.code === 401 && res.data?.needRelogin) {
        // Cookie失效
        ElMessageBox.alert(
          '全局Cookie已过期，请重新扫码授权后再采集。',
          '登录过期',
          { 
            confirmButtonText: '扫码授权', 
            type: 'warning',
            callback: () => {
              openGlobalCookieLogin(getSelectedCookiePlatform())
            }
          }
        )
      } else {
        ElMessage.error(res.message || '采集失败')
      }
    }
  } catch (e) {
    // 检查是否是 Cookie 失效
    if (getSelectedCookiePlatform() !== 'videohao' && (e.response?.status === 401 || e.response?.data?.code === 401)) {
      ElMessageBox.alert(
        '全局Cookie已过期，请重新扫码授权后再采集。',
        '登录过期',
        { 
          confirmButtonText: '扫码授权', 
          type: 'warning',
          callback: () => {
            openGlobalCookieLogin(getSelectedCookiePlatform())
          }
        }
      )
    } else {
      ElMessage.error('采集失败：' + (e.response?.data?.message || e.message))
    }
  } finally {
    if (!syncPollingTimer) syncing.value = false
  }
}

// ========== 时间范围工具 ==========
const getTimeRangeDates = () => {
  let startDate = null
  let endDate = null
  if (timeRangeType.value === 'custom' && customDateRange.value && customDateRange.value.length === 2) {
    startDate = customDateRange.value[0]
    endDate = customDateRange.value[1]
  } else if (timeRangeType.value && timeRangeType.value !== 'all') {
    const now = new Date()
    endDate = now.toISOString().split('T')[0]
    const daysMap = { '7': 7, '14': 14, '30': 30, '7d': 7, '30d': 30, '90d': 90, '180d': 180, '365d': 365 }
    const days = daysMap[timeRangeType.value] || 30
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    startDate = start.toISOString().split('T')[0]
  }
  return { startDate, endDate }
}

// 轮询采集进度
const startSyncPolling = (jobId) => {
  syncPollingTimer = setInterval(async () => {
    try {
      const res = await accountApi.getBatchSyncStatus(jobId)
      if (res.code === 0) {
        syncStatus.value = {
          ...syncStatus.value,
          total: res.data.total,
          completed: res.data.completed,
          failed: res.data.failed,
          currentAccount: res.data.currentAccount || '',
          currentIndex: res.data.currentIndex || 0,
          status: res.data.status
        }

        // 采集完成
        if (res.data.status === 'completed') {
          stopSyncPolling()
          syncing.value = false

          const msg = `采集完成: ${res.data.completed} 成功${res.data.failed > 0 ? '，' + res.data.failed + ' 失败' : ''}`
          const failed = res.data.results?.find(result => !result.success)
          const partial = res.data.results?.some(result => result.coverage?.hasMore || result.coverage?.ignored)
          if (failed || partial) {
            ElMessage.warning(failed ? `${msg}。${failed.nickname}：${failed.error}` : msg + '，部分账号仍有未采集作品')
          } else {
            ElMessage.success(msg)
          }

          // 自动刷新视频列表
          loadVideos()
        }
      }
    } catch (e) {
      stopSyncPolling()
      syncing.value = false
      ElMessage.error(e.response?.status === 404 ? '采集任务已失效，请重新发起' : '暂时无法查询采集进度')
    }
  }, 3000) // 每 3 秒轮询一次
}

const stopSyncPolling = () => {
  if (syncPollingTimer) {
    clearInterval(syncPollingTimer)
    syncPollingTimer = null
  }
}

// ========== 事件处理 ==========
const handlePlatformChange = () => {
  selectedAccount.value = ''
  currentPage.value = 1
  // 只选择平台时不加载数据，需要选择账号后才加载
  videos.value = []
  total.value = 0
}

const handleAccountChange = () => {
  currentPage.value = 1
  loadVideos()
}

const handleTimeRangeTypeChange = () => {
  currentPage.value = 1
  if (timeRangeType.value === 'custom') {
    if (customDateRange.value && customDateRange.value.length === 2) {
      loadVideos()
    }
  } else {
    loadVideos()
  }
}

const handleCustomDateChange = () => {
  if (customDateRange.value && customDateRange.value.length === 2) {
    currentPage.value = 1
    loadVideos()
  }
}

const handleFilterChange = () => {
  currentPage.value = 1
  loadVideos()
}

const handleExport = () => {
  ElMessage.info('导出功能开发中...')
}

watch(selectedAccount, () => {
  // 切换账号时自动加载数据
  if (selectedAccount.value || selectedPlatform.value) {
    currentPage.value = 1
    loadVideos()
  }
})

// ========== 生命周期 ==========
onMounted(() => {
  loadAccounts()
  loadGlobalCookieStatus()
  window.addEventListener('focus', refreshAccountsIfVisible)
  document.addEventListener('visibilitychange', refreshAccountsIfVisible)
})

onActivated(() => {
  loadAccounts()
})

onUnmounted(() => {
  stopSyncPolling()
  closeGlobalCookieDialog()
  window.removeEventListener('focus', refreshAccountsIfVisible)
  document.removeEventListener('visibilitychange', refreshAccountsIfVisible)
})
</script>

<style scoped>
/* ==================== 白色赛博风格 ==================== */
.cyber-cut {
  clip-path: polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px);
}
.cyber-cut-btn {
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
}
.cyber-panel-light {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 229, 255, 0.15);
  border-left: 4px solid #00E5FF;
  box-shadow: 4px 4px 0px 0px rgba(0, 229, 255, 0.15);
  border-radius: 4px;
}
.cyber-videos {
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
.title-deco { color: #FF007A; margin-right: 8px; }
.title-highlight { color: #06b6d4; }
.top-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.global-cookie-monitor {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.global-cookie-label {
  font-size: 12px;
  font-weight: 700;
  color: #64748B;
  letter-spacing: 1px;
}
.global-cookie-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 34px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #CBD5E1;
  background: #FFFFFF;
  color: #94A3B8;
  cursor: pointer;
  transition: all 0.2s;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
}
.global-cookie-btn:hover {
  border-color: #64748B;
  color: #64748B;
}
.global-cookie-btn.is-valid.global-cookie-douyin {
  color: #a855f7;
  border-color: rgba(168, 85, 247, 0.45);
  background: rgba(168, 85, 247, 0.08);
}
.global-cookie-btn.is-valid.global-cookie-xiaohongshu {
  color: #FF2442;
  border-color: rgba(255, 36, 66, 0.45);
  background: rgba(255, 36, 66, 0.06);
}
.global-cookie-btn.is-valid.global-cookie-videohao {
  color: #07C160;
  border-color: rgba(7, 193, 96, 0.45);
  background: rgba(7, 193, 96, 0.06);
}
.global-cookie-logo,
.global-cookie-logo svg {
  width: 18px;
  height: 18px;
  display: inline-flex;
}
.global-cookie-dialog {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
}
.cookie-status-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}
.cookie-status-main {
  font-family: 'Orbitron', monospace;
  font-size: 16px;
  color: #0F172A;
  font-weight: 600;
}
.cookie-status-sub {
  font-size: 13px;
  color: #64748B;
}
.cookie-status-item.success .cookie-status-main { color: #059669; }
.cookie-status-item.error .cookie-status-main { color: #DC2626; }
.pulse { animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.7; } }
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

/* ==================== 采集进度条 ==================== */
.sync-progress-bar {
  padding: 16px 20px;
  border-left-color: #FF007A;
}
.sync-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.sync-progress-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #0F172A;
}
.sync-icon { color: #FF007A; animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.sync-progress-stats {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
  font-family: 'Orbitron', monospace;
}
.sync-failed { color: #FF007A; }
.sync-progress-detail {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: #94a3b8;
}
.sync-rate-limit {
  color: #FF007A;
  font-weight: 600;
}

/* ==================== 筛选栏 ==================== */
.filter-bar { padding: 20px; display: flex; flex-direction: column; gap: 16px; overflow-x: auto; }
.filter-row { display: flex; gap: 16px; flex-wrap: nowrap; align-items: flex-end; }
.filter-group { display: flex; flex-direction: column; gap: 8px; }
.filter-label { font-size: 12px; color: #64748b; font-weight: 600; display: flex; align-items: center; gap: 4px; }
.filter-select { width: 180px; }
.platform-select { width: 160px; }
.account-select { width: 220px; }
.filter-select :deep(.el-input__wrapper) {
  background: #ffffff !important;
  border-color: #e2e8f0 !important;
  box-shadow: none !important;
  font-size: 13px !important;
}
.filter-select :deep(.el-input__inner) { color: #0F172A !important; font-weight: 600; }

.plat-option { display: flex; align-items: center; gap: 6px; }
.plat-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.plat-dot.plat-douyin { background: #a855f7; box-shadow: 0 0 6px rgba(168, 85, 247, 0.4); }
.plat-dot.plat-xiaohongshu { background: #E11D48; box-shadow: 0 0 6px rgba(225, 29, 72, 0.4); }
.plat-dot.plat-videohao { background: #059669; box-shadow: 0 0 6px rgba(5, 150, 105, 0.4); }
.plat-dot.plat-all { background: #00E5FF; box-shadow: 0 0 6px rgba(0, 229, 255, 0.4); }

.account-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 8px;
  border-radius: 8px;
  position: relative;
}
.account-option::before {
  content: '';
  width: 2px;
  height: 22px;
  border-radius: 999px;
  flex-shrink: 0;
  background: #cbd5e1;
  box-shadow: 0 0 8px rgba(148, 163, 184, 0.22);
}
.account-option-douyin {
  background: linear-gradient(90deg, rgba(168, 85, 247, 0.045), rgba(255, 255, 255, 0) 72%);
}
.account-option-xiaohongshu {
  background: linear-gradient(90deg, rgba(244, 114, 182, 0.055), rgba(255, 255, 255, 0) 72%);
}
.account-option-videohao {
  background: linear-gradient(90deg, rgba(16, 185, 129, 0.045), rgba(255, 255, 255, 0) 72%);
}
.account-option-douyin::before { background: #a855f7; box-shadow: 0 0 10px rgba(168, 85, 247, 0.34); }
.account-option-xiaohongshu::before { background: #f472b6; box-shadow: 0 0 10px rgba(244, 114, 182, 0.34); }
.account-option-videohao::before { background: #10b981; box-shadow: 0 0 10px rgba(16, 185, 129, 0.30); }
.account-avatar {
  width: 24px; height: 24px; border-radius: 4px; border: 1px solid #e2e8f0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 229, 255, 0.06); color: #64748b; font-size: 12px;
  overflow: hidden;
  flex-shrink: 0;
}
.account-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.account-name {
  font-size: 13px;
  color: #0F172A;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.account-name-douyin,
.account-name-xiaohongshu,
.account-name-videohao { background: transparent; }
.auth-badge {
  font-size: 10px; padding: 1px 6px; border-radius: 3px; font-weight: 700;
  margin-left: auto;
}
.auth-deep { background: rgba(0, 229, 255, 0.1); color: #0891b2; border: 1px solid rgba(0, 229, 255, 0.3); }
.auth-public { background: rgba(255, 0, 122, 0.05); color: #94a3b8; border: 1px solid #e2e8f0; }

.filter-bar :deep(.el-radio-button__inner) {
  background: #ffffff !important; color: #64748b !important; border-color: #e2e8f0 !important;
  font-size: 12px !important; letter-spacing: 1px; transition: all 0.2s ease;
}
.filter-bar :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: #ecfeff !important; color: #0e7490 !important;
  border-color: #00E5FF !important; box-shadow: -1px 0 0 0 #00E5FF !important;
}

.time-range-group { flex: 0 0 auto; min-width: 300px; }
.time-range-wrapper { display: flex; align-items: center; gap: 12px; flex-wrap: nowrap; }
.custom-date-picker { width: 240px; }
.custom-date-picker :deep(.el-input__wrapper) { background: #ffffff !important; border-color: #e2e8f0 !important; box-shadow: none !important; }
.custom-date-picker :deep(.el-range-input) { font-size: 12px !important; color: #0F172A !important; }
.custom-date-picker :deep(.el-range-separator) { color: #64748b !important; }

/* 采集按钮组 */
.sync-group {
  margin-left: 0;
  align-self: flex-end;
  flex: 0 0 auto;
}
.sync-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}
.sync-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.filter-action-btn {
  min-width: 80px;
  background: #0891b2;
  border-color: #0891b2;
}
.filter-action-btn:hover:not(:disabled) {
  background: #0e7490;
  border-color: #0e7490;
}
.filter-action-btn:disabled {
  opacity: 0.5;
}
.sync-btn {
  min-width: 120px;
}

.filter-status { padding-top: 12px; border-top: 1px dashed rgba(0, 229, 255, 0.2); }
.status-item { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.status-label { font-size: 12px; color: #94a3b8; font-weight: 600; }
.platform-tag { padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 700; letter-spacing: 1px; }
.plat-bg-douyin { background: rgba(168, 85, 247, 0.1); color: #a855f7; border: 1px solid rgba(168, 85, 247, 0.3); }
.plat-bg-xiaohongshu { background: rgba(225, 29, 72, 0.1); color: #E11D48; border: 1px solid rgba(225, 29, 72, 0.3); }
.plat-bg-videohao { background: rgba(5, 150, 105, 0.1); color: #059669; border: 1px solid rgba(5, 150, 105, 0.3); }
.plat-bg-all { background: rgba(0, 229, 255, 0.1); color: #0891b2; border: 1px solid rgba(0, 229, 255, 0.3); }
.account-tag, .time-tag {
  display: flex; align-items: center; gap: 4px; padding: 4px 12px;
  background: rgba(0, 229, 255, 0.1); color: #0891b2;
  border: 1px solid rgba(0, 229, 255, 0.3); border-radius: 4px;
  font-size: 12px; font-weight: 600;
}

/* ==================== 数据面板 ==================== */
.data-panel { padding: 20px; flex: 1; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 14px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: 2px;
}
.panel-deco { color: #00E5FF; margin-right: 8px; font-size: 10px; }
.panel-platform-prefix {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  letter-spacing: 0;
}
.panel-platform-logo {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid currentColor;
  background: rgba(255, 255, 255, 0.9);
  overflow: hidden;
}
.panel-platform-logo svg {
  width: 15px;
  height: 15px;
}
.panel-platform-name {
  font-size: 12px;
  font-weight: 800;
}
.panel-platform-douyin { color: #a855f7; }
.panel-platform-xiaohongshu { color: #FF2442; }
.panel-platform-videohao { color: #07C160; }
.xhs-logo-text {
  font-size: 8px;
  line-height: 1;
  font-weight: 900;
  transform: scale(0.86);
  white-space: nowrap;
}
.panel-actions { display: flex; gap: 12px; align-items: center; }
.cyber-search { width: 260px; }
.cyber-btn-outline {
  font-weight: 700 !important; letter-spacing: 1px; border-radius: 4px !important;
  border: 1px solid #e2e8f0 !important; color: #64748b !important; background: #ffffff !important;
  box-shadow: 3px 3px 0px 0px rgba(0, 229, 255, 0.1); transition: all 0.2s ease;
}
.cyber-btn-outline:hover { border-color: #00E5FF !important; color: #0e7490 !important; }

/* ==================== 浅色表格 ==================== */
.light-table :deep(.el-table__header-wrapper th.el-table__cell) {
  background-color: #f8fafc !important; color: #475569 !important;
  font-size: 11px !important; font-weight: 700 !important; letter-spacing: 1px;
  border-bottom: 1px solid #e2e8f0 !important;
}
.light-table :deep(.el-table__body-wrapper td.el-table__cell) {
  background-color: #ffffff !important; color: #0F172A !important; border-bottom: 1px solid #f1f5f9 !important;
}
.light-table :deep(.el-table__body tr:hover > td.el-table__cell) { background-color: rgba(0, 229, 255, 0.05) !important; }
.light-table :deep(.el-table__empty-block) { background-color: #ffffff !important; }
.light-table :deep(.el-table__inner-wrapper::before) { background-color: #e2e8f0 !important; }

/* ==================== 表格内样式 ==================== */
.vid-cell { display: flex; gap: 14px; align-items: center; }
.vid-cell.is-deleted { opacity: 0.6; }
.vid-cover { width: 80px; height: 106px; border-radius: 4px; overflow: hidden; border: 2px solid; flex-shrink: 0; background: #f8fafc; position: relative; }
.vid-cover img { width: 100%; height: 100%; object-fit: cover; }
.vid-cover .deleted-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  background: #ef4444;
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  z-index: 10;
}
.vid-info { display: flex; flex-direction: column; gap: 8px; min-width: 0; flex: 1; }
.vid-title-link.deleted-title {
  text-decoration: line-through;
  color: #94a3b8;
}
.deleted-text {
  color: #ef4444;
  font-size: 12px;
  font-weight: 500;
}
.vid-title { font-size: 14px; color: #0F172A; font-weight: 600; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.vid-title-link { font-size: 14px; color: #0F172A; font-weight: 600; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-decoration: none; transition: color 0.2s ease; }
.vid-title-link:hover { color: #0891b2; text-decoration: underline; }
.vid-meta { display: flex; gap: 12px; align-items: center; }
.vid-id { font-size: 11px; color: #94a3b8; letter-spacing: 0.5px; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; }
.vid-account { font-size: 11px; color: #64748b; font-weight: 600; }
.content-type-tag {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  border: 1px solid transparent;
}
.content-type-video {
  color: #0891b2;
  background: rgba(8, 145, 178, 0.08);
  border-color: rgba(8, 145, 178, 0.2);
}
.content-type-image {
  color: #db2777;
  background: rgba(219, 39, 119, 0.08);
  border-color: rgba(219, 39, 119, 0.2);
}

.time-cell { display: flex; flex-direction: column; gap: 4px; }
.time-date { font-size: 12px; color: #0F172A; font-weight: 600; }
.time-ago { font-size: 11px; color: #94a3b8; }

.num { font-size: 13px; font-weight: 700; color: #334155; }
.num-locked { color: #cbd5e1; font-style: italic; }
.highlight-play { color: #0891b2; }
.highlight-like { color: #FF007A; }

/* ==================== 空状态 ==================== */
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: #94a3b8; }
.empty-icon { margin-bottom: 20px; color: #cbd5e1; }
.empty-title { font-size: 18px; font-weight: 700; color: #475569; margin-bottom: 8px; letter-spacing: 2px; }
.empty-desc { font-size: 13px; color: #94a3b8; }

/* ==================== 分页 ==================== */
.pagination-wrap { margin-top: 18px; display: flex; justify-content: flex-end; }
.pagination-wrap :deep(.el-pager li.is-active) { background: #ecfeff !important; color: #0e7490 !important; border: 1px solid #00E5FF; }

</style>
