<template>
  <div class="cyber-accounts">
    <!-- 顶部栏 (参照参考文件) -->
    <header class="accounts-header">
      <div class="header-left">
        <h2 class="page-title">
          <span class="title-highlight">监控节点</span> 管理中枢
        </h2>
        <p class="page-subtitle">节点管理系统 // 活跃状态</p>
      </div>
      <div class="header-right">
        <div class="search-box">
          <el-icon class="search-icon"><Search /></el-icon>
          <input type="text" v-model="searchKeyword" placeholder="检索节点标识..." class="search-input" />
        </div>
        <button class="cyber-cut-btn add-btn" @click="openAddDialog">
          <el-icon><Plus /></el-icon> 新增监控节点
        </button>
      </div>
    </header>

    <!-- 内容区域 -->
    <div class="accounts-content">
      <!-- 筛选过滤栏 (参照参考文件) -->
      <div class="filter-bar">
        <span class="filter-label">筛选过滤:</span>
        <button 
          v-for="filter in filterOptions" 
          :key="filter.value"
          class="cyber-cut-btn filter-btn"
          :class="filter.class"
          @click="activeFilter = filter.value"
        >
          {{ filter.label }}
        </button>
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
                <path d="M29.8 9.5c-7.3 0-13.2 4.8-13.2 10.7 0 3.2 1.7 6 4.6 7.9L20 36l6.1-3.1c1.2.2 2.4.3 3.8.3 7.3 0 13.2-4.8 13.2-10.7S37.1 9.5 29.8 9.5Z" fill="currentColor"/>
                <path d="M15.6 12.7c-5.8 0-10.5 3.8-10.5 8.5 0 2.5 1.4 4.8 3.7 6.3L8 33.4l4.8-2.4c.9.1 1.8.2 2.8.2 5.8 0 10.5-3.8 10.5-8.5s-4.7-8.5-10.5-8.5Z" fill="currentColor" opacity=".84"/>
                <circle cx="24.8" cy="20.9" r="1.7" fill="#fff"/>
                <circle cx="31.2" cy="20.9" r="1.7" fill="#fff"/>
                <path d="M21 20.3v1.2M27.3 20.3v1.2" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
            </span>
            <span v-else class="global-cookie-name">{{ platform.label }}</span>
          </button>
        </div>
      </div>

      <!-- 账号卡片网格 (参照参考文件) -->
      <div class="account-grid">
        <div 
          v-for="account in filteredAccounts" 
          :key="account.id" 
          class="cyber-panel-light cyber-cut account-card"
          :style="getCardBorder(account.status)"
        >
          <!-- 背景平台 Logo 水印 -->
          <div class="platform-watermark">
            <i v-if="account.platform === 'douyin'" class="fa-brands fa-tiktok platform-watermark-icon" aria-hidden="true"></i>
            <svg v-else-if="account.platform === 'xiaohongshu'" viewBox="0 0 48 48" aria-hidden="true" class="platform-watermark-icon">
              <rect x="12" y="9" width="4.8" height="30" rx="2.4" fill="currentColor"/>
              <rect x="31.2" y="9" width="4.8" height="30" rx="2.4" fill="currentColor"/>
              <rect x="16.6" y="21.6" width="14.8" height="4.8" rx="2.4" fill="currentColor"/>
            </svg>
            <svg v-else-if="account.platform === 'videohao'" viewBox="0 0 48 48" aria-hidden="true" class="platform-watermark-icon">
              <path d="M29.8 9.5c-7.3 0-13.2 4.8-13.2 10.7 0 3.2 1.7 6 4.6 7.9L20 36l6.1-3.1c1.2.2 2.4.3 3.8.3 7.3 0 13.2-4.8 13.2-10.7S37.1 9.5 29.8 9.5Z" fill="currentColor"/>
              <path d="M15.6 12.7c-5.8 0-10.5 3.8-10.5 8.5 0 2.5 1.4 4.8 3.7 6.3L8 33.4l4.8-2.4c.9.1 1.8.2 2.8.2 5.8 0 10.5-3.8 10.5-8.5s-4.7-8.5-10.5-8.5Z" fill="currentColor" opacity=".84"/>
              <circle cx="24.8" cy="20.9" r="1.7" fill="#fff"/>
              <circle cx="31.2" cy="20.9" r="1.7" fill="#fff"/>
              <path d="M21 20.3v1.2M27.3 20.3v1.2" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
          </div>

          <!-- 卡片头部: 头像 + 名称 + 平台标签 + 矩阵标签 -->
          <div class="card-top">
            <div class="card-identity">
              <div class="card-avatar cyber-cut-btn">
                <el-icon class="card-avatar-fallback-icon" :size="20"><User /></el-icon>
                <img v-if="account.avatar || account.avatarUrl" :src="getAvatarUrl(account.avatar || account.avatarUrl)" class="avatar-img" @error="handleAvatarError" />
              </div>
              <div class="card-name-group">
                <h3 class="card-name" :title="account.nickname">{{ account.nickname }}</h3>
                <div class="card-tags">
                  <span
                    :class="['platform-tag', 'platform-' + account.platform]"
                    :title="getPlatformName(account.platform)"
                    :aria-label="getPlatformName(account.platform)"
                  >
                    <span v-if="account.platform === 'douyin'" class="platform-logo platform-logo-douyin" aria-hidden="true">
                      <svg viewBox="0 0 48 48">
                        <path d="M34.14 11.2a8.07 8.07 0 01-2.94-5.4V4h-6.6v27.04a4.76 4.76 0 01-4.76 4.56 4.76 4.76 0 01-4.76-4.76 4.76 4.76 0 014.76-4.76c.5 0 .98.08 1.44.22v-6.72a11.38 11.38 0 00-1.44-.1C12.76 19.48 7 25.24 7 32.24s5.76 12.76 12.84 12.76 12.84-5.76 12.84-12.76V18.84a14.7 14.7 0 008.32 2.56V14.8a8.12 8.12 0 01-6.86-3.6z" fill="currentColor"/>
                      </svg>
                    </span>
                    <span v-else-if="account.platform === 'xiaohongshu'" class="platform-logo platform-logo-xhs-badge" aria-hidden="true">
                      小红书
                    </span>
                    <span v-else-if="account.platform === 'videohao'" class="platform-logo platform-logo-videohao" aria-hidden="true">
                      <svg viewBox="0 0 48 48">
                        <path d="M29.8 9.5c-7.3 0-13.2 4.8-13.2 10.7 0 3.2 1.7 6 4.6 7.9L20 36l6.1-3.1c1.2.2 2.4.3 3.8.3 7.3 0 13.2-4.8 13.2-10.7S37.1 9.5 29.8 9.5Z" fill="currentColor"/>
                        <path d="M15.6 12.7c-5.8 0-10.5 3.8-10.5 8.5 0 2.5 1.4 4.8 3.7 6.3L8 33.4l4.8-2.4c.9.1 1.8.2 2.8.2 5.8 0 10.5-3.8 10.5-8.5s-4.7-8.5-10.5-8.5Z" fill="currentColor" opacity=".84"/>
                        <circle cx="24.8" cy="20.9" r="1.7" fill="#fff"/>
                        <circle cx="31.2" cy="20.9" r="1.7" fill="#fff"/>
                        <path d="M21 20.3v1.2M27.3 20.3v1.2" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>
                      </svg>
                    </span>
                  </span>
                  <span 
                    v-if="account.remark === '链接导入'" 
                    class="group-tag clickable" 
                    @click="copyLink(account)"
                    title="点击复制链接"
                  >[ 链接导入 ]</span>
                  <span v-else class="group-tag">[ {{ account.remark || '扫码添加' }} ]</span>
                </div>
              </div>
            </div>
            <el-dropdown trigger="click" @command="(cmd) => handleCardAction(cmd, account)">
              <button class="more-btn" @click.stop><el-icon><MoreFilled /></el-icon></button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="sync" :icon="DataAnalysis">数据同步</el-dropdown-item>
                  <el-dropdown-item command="delete" :icon="Delete" divided style="color: #f56c6c;">删除账号</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>

          <!-- 数据面板 (参照参考文件的 bg-slate-50 区域) -->
          <div class="card-data-panel" style="background:#F8FAFC;border:1px solid #F1F5F9;padding:12px;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;width:100%;box-sizing:border-box;">
              <span style="color:#64748B;font-weight:700;flex-shrink:0;font-size:12px;">总粉丝量</span>
              <span :style="{fontWeight:'700',color:'#0F172A',textAlign:'right',flex:'1',minWidth:0,fontFamily:fontFamily}" class="font-cyber">{{ formatNumber(account.follower_count) }}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;width:100%;box-sizing:border-box;margin-top:8px;">
              <span style="color:#64748B;font-weight:700;flex-shrink:0;font-size:12px;">节点状态</span>
              <div :class="['status-badge', 'status-' + account.status]" :style="{fontWeight:'700',display:'inline-flex',alignItems:'center',justifyContent:'flex-end',flex:'1',textAlign:'right'}">
                <span :class="['status-dot', 'dot-' + account.status]"></span>
                {{ getStatusText(account.status) }}
              </div>
            </div>
          </div>

          <!-- 底部操作 (参照参考文件) -->
          <div class="card-bottom">
            <span class="sync-time">上次同步: {{ formatSyncTime(account.last_fetch_at) }}</span>
            <div class="card-actions">
              <button v-if="account.status === 'expired'" @click="openAddDialog()" class="cyber-cut-btn action-btn btn-rescan">
                重新扫码
              </button>
              <button @click="handleSync(account)" class="cyber-cut-btn action-btn btn-insight" :loading="account.syncing">
                <el-icon><DataAnalysis /></el-icon> 数据同步
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加账号对话框 - 保留原有功能 -->
    <el-dialog 
      v-model="showAddDialog" 
      title="接入监控节点" 
      width="560px" 
      :close-on-click-modal="false"
      class="cyber-dialog-light"
      @close="resetAddDialog"
    >
      <div class="add-account-container">
        <!-- 上方：选择平台 -->
        <div class="section-label">选择平台</div>
        <div class="platform-selector">
          <div 
            v-for="p in platforms" 
            :key="p.value"
            class="platform-option"
            :class="{ active: selectedPlatform === p.value, ['plat-' + p.value]: selectedPlatform === p.value }"
            @click="!isProcessing && selectAddPlatform(p.value)"
          >
            <div class="platform-icon" :style="{ background: p.color }">
              <el-icon :size="20"><component :is="p.icon" /></el-icon>
            </div>
            <span class="platform-name">{{ p.label }}</span>
          </div>
        </div>

        <!-- 中间：选择导入方式 -->
        <div class="section-label">选择导入方式</div>
        <div class="add-method-tabs">
          <div 
            v-for="tab in addMethods" 
            :key="tab.value"
            class="method-tab"
            :class="{ active: addMethod === tab.value }"
            @click="!isProcessing && (addMethod = tab.value)"
          >
            <el-icon :size="16"><component :is="tab.icon" /></el-icon>
            <span>{{ tab.label }}</span>
          </div>
        </div>

        <!-- 下方：导入内容区 -->
        <!-- 扫码登录 - 简化文字提示 -->
        <div v-if="addMethod === 'qrcode'" class="method-content">
          <div class="qr-simple-status">
            <!-- 初始状态 / 生成中 -->
            <div v-if="qrStatus === '' || generating" class="status-item">
              <el-icon :size="32" class="spin"><Loading /></el-icon>
              <p class="status-main">正在准备扫码登录...</p>
            </div>

            <!-- 等待扫码 -->
            <div v-else-if="qrStatus === 'pending'" class="status-item">
              <div class="status-icon pulse">
                <el-icon :size="48" color="#00f0ff"><Cellphone /></el-icon>
              </div>
              <p class="status-main">请使用 {{ getPlatformName(selectedPlatform) }} APP 扫码</p>
              <p class="status-sub">打开APP → 点击右上角"+" → 扫一扫</p>
              <p class="status-timer">二维码有效期：{{ Math.floor(countdown / 60) }}:{{ String(countdown % 60).padStart(2, '0') }}</p>
            </div>

            <!-- 已扫码 -->
            <div v-else-if="qrStatus === 'scanned'" class="status-item">
              <div class="status-icon pulse">
                <el-icon :size="48" color="#00f0ff"><Loading /></el-icon>
              </div>
              <p class="status-main">已扫码，等待确认...</p>
              <p class="status-sub">请在手机上点击"确认登录"</p>
            </div>

            <!-- 扫码成功 -->
            <div v-else-if="qrStatus === 'confirmed'" class="status-item success">
              <div class="status-icon">
                <el-icon :size="48" color="#39ff14"><CircleCheckFilled /></el-icon>
              </div>
              <p class="status-main">扫码成功！</p>
              <div v-if="pendingAccount" class="preview-account-inline">
                <img :src="pendingAccount.avatar" class="preview-avatar-small" />
                <span class="preview-name">{{ pendingAccount.nickname }}</span>
              </div>
            </div>

            <!-- 过期/失败 -->
            <div v-else-if="qrStatus === 'expired'" class="status-item error">
              <div class="status-icon">
                <el-icon :size="48" color="#ff003c"><CircleCloseFilled /></el-icon>
              </div>
              <p class="status-main">二维码已过期</p>
              <el-button class="cyber-btn-sm" @click="generateQRCode" :disabled="isProcessing">
                <el-icon><Refresh /></el-icon> 重新生成
              </el-button>
            </div>

            <!-- 错误状态 -->
            <div v-else class="status-item error">
              <div class="status-icon">
                <el-icon :size="48" color="#ff003c"><CircleCloseFilled /></el-icon>
              </div>
              <p class="status-main">登录页面打开失败</p>
              <el-button type="primary" size="small" @click="generateQRCode" :disabled="isProcessing">重试</el-button>
            </div>
          </div>
        </div>

        <!-- 分享链接导入 -->
        <div v-if="addMethod === 'url'" class="method-content">
          <div class="input-section">
            <el-form label-position="top">
              <el-form-item :label="selectedPlatform === 'videohao' ? '视频号名称或ID' : '分享链接'">
                <el-input 
                  v-model="shareUrl" 
                  type="textarea" 
                  :rows="3"
                  :placeholder="getShareUrlPlaceholder()"
                  :disabled="isProcessing"
                />
              </el-form-item>
            </el-form>
            <div class="url-hint">
              <el-icon><InfoFilled /></el-icon>
              <span>{{ getShareUrlHint() }}</span>
            </div>
          </div>
          
          <div v-if="fetching" class="fetching-status">
            <el-icon class="spin"><Loading /></el-icon>
            <span>{{ selectedPlatform === 'videohao' ? '正在搜索视频号账号...' : '正在采集数据...' }}</span>
          </div>

          <div v-if="selectedPlatform === 'videohao' && videohaoCandidates.length > 0" class="candidate-section">
            <div class="preview-title">请选择要公开监控的视频号</div>
            <div class="candidate-list">
              <button
                v-for="candidate in videohaoCandidates"
                :key="candidate.unique_id"
                type="button"
                class="candidate-card"
                :class="{ active: selectedVideohaoCandidate?.unique_id === candidate.unique_id }"
                @click="selectedVideohaoCandidate = candidate"
              >
                <img :src="candidate.avatar" class="candidate-avatar" @error="$event.target.style.display='none'" />
                <div class="candidate-info">
                  <div class="candidate-name">{{ candidate.nickname || '未知视频号' }}</div>
                  <div class="candidate-meta">
                    <span v-if="candidate.auth_company_name">{{ candidate.auth_company_name }}</span>
                    <span v-else-if="candidate.verified">已认证</span>
                    <span v-else>未认证</span>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div v-if="fetchedAccount" class="preview-section">
            <div class="preview-title">采集结果预览</div>
            <div class="preview-card">
              <img :src="fetchedAccount.avatar" class="preview-avatar" />
              <div class="preview-info">
                <div class="preview-name">{{ fetchedAccount.nickname }}</div>
                <div class="preview-stats">
                  粉丝 {{ formatNumber(fetchedAccount.follower_count) }} · 
                  获赞 {{ formatNumber(fetchedAccount.like_count) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="dialog-actions">
          <el-button class="cyber-cut-btn btn-text" @click="showAddDialog = false" :disabled="isProcessing && !fetching">取消</el-button>
          <template v-if="addMethod === 'url'">
            <el-button 
              v-if="fetchedAccount || (selectedPlatform === 'videohao' && selectedVideohaoCandidate)"
              class="cyber-cut-btn btn-primary" 
              type="primary" 
              @click="confirmAddFromUrl"
              :loading="adding"
              :disabled="isProcessing"
            >确认添加</el-button>
            <el-button 
              v-else
              class="cyber-cut-btn btn-primary" 
              type="primary" 
              @click="fetchFromUrl"
              :loading="fetching"
              :disabled="!shareUrl || isProcessing"
            >{{ selectedPlatform === 'videohao' ? '搜索账号' : '获取数据' }}</el-button>
          </template>
          <template v-if="addMethod === 'qrcode'">
            <el-button 
              v-if="qrStatus === 'confirmed'" 
              class="cyber-cut-btn btn-primary" 
              type="primary" 
              @click="confirmAdd"
              :loading="adding"
              :disabled="isProcessing"
            >确认添加</el-button>
            <el-button 
              v-else 
              class="cyber-cut-btn btn-primary" 
              type="primary" 
              @click="generateQRCode"
              :loading="generating"
              :disabled="isProcessing"
            >{{ sessionId ? '刷新' : '生成二维码' }}</el-button>
          </template>
        </div>
      </div>
    </el-dialog>

    <el-dialog
      v-model="globalCookieDialogVisible"
      :title="`${getPlatformName(globalCookiePlatform)}全局Cookie授权`"
      width="420px"
      :close-on-click-modal="false"
      class="cyber-dialog-light"
      @close="closeGlobalCookieDialog"
    >
      <div class="global-cookie-dialog">
        <div v-if="globalCookieQrStatus === 'loading'" class="status-item">
          <el-icon :size="32" class="spin"><Loading /></el-icon>
          <p class="status-main">正在准备扫码登录...</p>
        </div>
        <div v-else-if="globalCookieQrStatus === 'pending'" class="status-item">
          <div class="status-icon pulse">
            <el-icon :size="48" color="#00f0ff"><Cellphone /></el-icon>
          </div>
          <p class="status-main">请使用 {{ getPlatformName(globalCookiePlatform) }} APP 扫码</p>
          <p class="status-sub">此授权仅用于公开监控采集，不会添加账号</p>
        </div>
        <div v-else-if="globalCookieQrStatus === 'scanned'" class="status-item">
          <div class="status-icon pulse">
            <el-icon :size="48" color="#00f0ff"><Loading /></el-icon>
          </div>
          <p class="status-main">已扫码，等待确认...</p>
          <p class="status-sub">请在手机上确认登录</p>
        </div>
        <div v-else-if="globalCookieQrStatus === 'confirmed'" class="status-item success">
          <div class="status-icon">
            <el-icon :size="48" color="#39ff14"><CircleCheckFilled /></el-icon>
          </div>
          <p class="status-main">授权成功</p>
        </div>
        <div v-else class="status-item error">
          <div class="status-icon">
            <el-icon :size="48" color="#ff003c"><CircleCloseFilled /></el-icon>
          </div>
          <p class="status-main">{{ globalCookieQrStatus === 'expired' ? '二维码已过期' : '授权失败' }}</p>
          <el-button class="cyber-btn-sm" @click="startGlobalCookieLogin(globalCookiePlatform)">
            <el-icon><Refresh /></el-icon> 重新扫码
          </el-button>
        </div>
      </div>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { 
  Plus, User, Refresh, Delete, EditPen, 
  VideoCamera, Loading, CircleCheckFilled, CircleCloseFilled, Cellphone,
  Link, InfoFilled, Notebook, VideoPlay, Search, MoreFilled, DataAnalysis, ArrowLeft
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { accountApi } from '../api'
import { getAvatarUrl } from '../utils/media'

const accounts = ref([])
const showAddDialog = ref(false)
const selectedPlatform = ref('douyin')
const sessionId = ref('')
const qrStatus = ref('')
const countdown = ref(300)
const countdownTimer = ref(null)
const pollTimer = ref(null)
const generating = ref(false)
const adding = ref(false)
const pendingAccount = ref(null)
const qrCodeImage = ref('')
const searchKeyword = ref('')
const activeFilter = ref('all')
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
const pendingGlobalCookieAction = ref(null)

// 是否正在处理中（用于禁用按钮）
const isProcessing = computed(() => fetching.value || adding.value || generating.value)

const addMethod = ref('qrcode')
const addMethods = computed(() => {
  if (selectedPlatform.value === 'videohao') {
    return [
      { value: 'qrcode', label: '扫码登录', icon: 'Cellphone' },
      { value: 'url', label: '公开监控', icon: 'Search' }
    ]
  }
  return [
    { value: 'qrcode', label: '扫码登录', icon: 'Cellphone' },
    { value: 'url', label: '链接导入', icon: 'Link' }
  ]
})
const shareUrl = ref('')
const fetching = ref(false)
const fetchedAccount = ref(null)
const videohaoCandidates = ref([])
const selectedVideohaoCandidate = ref(null)

const platforms = [
  { value: 'douyin', label: '抖音', color: '#FE2C55', icon: 'VideoCamera' },
  { value: 'xiaohongshu', label: '小红书', color: '#FF2442', icon: 'Notebook' },
  { value: 'videohao', label: '视频号', color: '#07C160', icon: 'VideoPlay' }
]

// 筛选选项 (参照参考文件)
const filterOptions = computed(() => {
  const all = accounts.value.length
  const authOk = accounts.value.filter(a => a.status === 'active').length
  const expired = accounts.value.filter(a => a.status === 'expired').length  // 只计算 expired 状态
  const pub = accounts.value.filter(a => a.status === 'public').length
  return [
    { value: 'all', label: `全部节点 (${all})`, class: 'filter-active' },
    { value: 'auth', label: `🟢 深度授权 (${authOk})`, class: 'filter-auth' },
    { value: 'public', label: `🔵 公开监控 (${pub})`, class: 'filter-public' },
    { value: 'expired', label: `🟡 授权失效 (${expired})`, class: 'filter-expired' }
  ]
})

const filteredAccounts = computed(() => {
  let list = accounts.value
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    list = list.filter(a => a.nickname?.toLowerCase().includes(kw) || a.unique_id?.toLowerCase().includes(kw))
  }
  if (activeFilter.value === 'auth') list = list.filter(a => a.status === 'active')
  else if (activeFilter.value === 'expired') list = list.filter(a => a.status === 'expired')  // 只显示 expired 状态
  else if (activeFilter.value === 'public') list = list.filter(a => a.status === 'public')
  return list
})

const formatNumber = (num) => {
  if (!num) return '0'
  if (num >= 10000) return (num / 10000).toFixed(1) + 'w'
  return num.toLocaleString()
}

const formatSyncTime = (time) => {
  if (!time) return '--'
  const date = new Date(time)
  const now = new Date()
  const diff = now - date
  
  // 小于1分钟
  if (diff < 60000) return '刚刚'
  // 小于1小时
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  // 小于24小时
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  // 小于7天
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前'
  
  // 返回具体日期
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const getPlatformName = (p) => ({ douyin: '抖音', xiaohongshu: '小红书', videohao: '视频号' }[p] || p)
const getPlatColor = (p) => ({ douyin: '#a855f7', xiaohongshu: '#FF2442', videohao: '#07C160' }[p] || '#00f0ff')
const getShareUrlPlaceholder = () => {
  if (selectedPlatform.value === 'xiaohongshu') {
    return '粘贴小红书主页或分享链接，例如：https://www.xiaohongshu.com/user/profile/xxxxx'
  }
  if (selectedPlatform.value === 'videohao') {
    return '输入视频号名称或视频号ID，例如：人民日报'
  }
  return '粘贴抖音分享链接，例如：https://www.douyin.com/user/xxxxx'
}
const getShareUrlHint = () => {
  if (selectedPlatform.value === 'xiaohongshu') {
    return '支持格式：小红书主页链接、分享卡片链接'
  }
  if (selectedPlatform.value === 'videohao') {
    return '需要桌面微信保持登录；系统会通过微信搜一搜解析账号并获取 finder_username'
  }
  return '支持格式：抖音主页链接、分享卡片链接'
}

// 参照参考文件的辅助函数
const getPlatformIcon = (platform) => {
  if (platform === 'douyin') return 'fa-brands fa-tiktok'
  if (platform === 'xiaohongshu') return 'fa-solid fa-book-open'
  if (platform === 'videohao') return 'fa-brands fa-weixin'
  return ''
}
const handleAvatarError = (event) => {
  if (event?.target) {
    event.target.style.display = 'none'
  }
}
const getCardBorder = (status) => {
  if (status === 'active') return 'border-left-color: #00E676;'
  if (status === 'expired') return 'border-left-color: #FF007A; background-color: rgba(255,0,122,0.02);'
  return 'border-left-color: #3B82F6;'  // 公开监控 - 蓝色
}
const getStatusClass = (status) => {
  if (status === 'active') return 'status-auth-ok'
  if (status === 'expired') return 'status-expired'
  return 'status-public'
}
const getStatusDot = (status) => {
  if (status === 'active') return 'dot-green'
  if (status === 'expired') return 'dot-pink'
  return 'dot-blue'  // 公开监控 - 蓝色圆点
}
const getStatusText = (status) => {
  if (status === 'active') return '深度授权'
  if (status === 'expired') return '授权失效'
  return '公开监控'
}

const getGlobalCookieTitle = (platform) => {
  if (platform === 'videohao') {
    const state = globalCookieStates.value.videohao
    return `视频号桌面微信：${state?.hasCookie ? '已开启' : '未检测到或未登录'}。点击重新检测`
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
    await loadVideohaoDesktopStatus(false)
  } catch (e) {
    console.error('加载全局Cookie状态失败', e)
  }
}

const loadVideohaoDesktopStatus = async (showMessage = true) => {
  try {
    const res = await accountApi.getVideohaoDesktopStatus()
    if (res.code === 0) {
      globalCookieStates.value = {
        ...globalCookieStates.value,
        videohao: res.data
      }
      if (showMessage) {
        if (res.data.available) ElMessage.success('桌面微信已开启，可用于视频号公开监控')
        else ElMessage.warning(res.data.message || '未检测到可用的桌面微信')
      }
      return res.data.available
    }
  } catch (e) {
    if (showMessage) ElMessage.error('检测桌面微信失败：' + (e.response?.data?.message || e.message))
  }
  return false
}

const ensureXhsGlobalCookieForImport = async () => {
  if (selectedPlatform.value !== 'xiaohongshu') return true

  try {
    const res = await accountApi.getGlobalCookieStatus('xiaohongshu')
    if (res.code === 0 && res.data?.hasCookie) {
      globalCookieStates.value = {
        ...globalCookieStates.value,
        xiaohongshu: res.data
      }
      return true
    }
  } catch (e) {
    console.error('检查小红书全局Cookie失败', e)
  }

  try {
    await ElMessageBox.confirm(
      '小红书链接导入需要先扫码获取全局Cookie，否则粉丝量可能不准确。扫码成功后会自动继续导入。',
      '需要小红书全局Cookie',
      { confirmButtonText: '去扫码', cancelButtonText: '取消', type: 'warning', closeOnClickModal: false }
    )
  } catch (e) {
    return false
  }

  pendingGlobalCookieAction.value = () => fetchFromUrl(true)
  startGlobalCookieLogin('xiaohongshu')
  return false
}

const ensureVideohaoGlobalCookieForSearch = async () => {
  if (selectedPlatform.value !== 'videohao') return true
  return loadVideohaoDesktopStatus(true)
}

const openGlobalCookieLogin = async (platform) => {
  if (platform === 'videohao') {
    await loadVideohaoDesktopStatus(true)
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

const startGlobalCookieLogin = async (platform) => {
  closeGlobalCookieDialog(false)
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
        closeGlobalCookieDialog(false)
        const nextAction = pendingGlobalCookieAction.value
        pendingGlobalCookieAction.value = null
        if (nextAction) setTimeout(nextAction, 300)
      } else if (newStatus === 'expired') {
        ElMessage.warning('二维码已过期，请重新扫码')
      }
    } catch (e) {
      console.error('全局Cookie扫码状态查询失败', e)
    }
  }, 2000)
}

const closeGlobalCookieDialog = (clearPending = true) => {
  clearInterval(globalCookiePollTimer.value)
  globalCookieSessionId.value = ''
  globalCookieQrStatus.value = ''
  if (clearPending) pendingGlobalCookieAction.value = null
}

const loadAccounts = async () => {
  try {
    const res = await accountApi.getList()
    if (res.code === 0) {
      // 映射字段：API 返回 platform_code，模板使用 platform
      accounts.value = res.data.list.map(a => ({
        ...a,
        platform: a.platform_code || a.platform
      }))
    }
  } catch (e) { ElMessage.error('加载失败') }
}

const openAddDialog = () => {
  showAddDialog.value = true
  selectedPlatform.value = 'douyin'
  addMethod.value = 'url'
  resetAddDialog()
}

const selectAddPlatform = (platform) => {
  selectedPlatform.value = platform
  addMethod.value = 'url'
  shareUrl.value = ''
  fetchedAccount.value = null
  videohaoCandidates.value = []
  selectedVideohaoCandidate.value = null
}

const resetAddDialog = () => {
  resetQRCode()
  shareUrl.value = ''
  fetchedAccount.value = null
  videohaoCandidates.value = []
  selectedVideohaoCandidate.value = null
  fetching.value = false
}

const searchVideohaoAccounts = async () => {
  try {
    fetching.value = true
    fetchedAccount.value = null
    selectedVideohaoCandidate.value = null
    videohaoCandidates.value = []
    ElMessage.info('正在搜索视频号账号...')
    const res = await accountApi.searchVideohaoAccounts({ keyword: shareUrl.value, pageSize: 10 })
    if (res.code === 0) {
      videohaoCandidates.value = res.data.list || []
      if (videohaoCandidates.value.length === 0) {
        ElMessage.warning('未搜索到匹配的视频号账号')
      } else {
        ElMessage.success(`找到 ${videohaoCandidates.value.length} 个候选账号，请选择正确账号`)
      }
    } else {
      ElMessage.error(res.message || '视频号账号搜索失败')
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '视频号账号搜索失败')
  } finally {
    fetching.value = false
  }
}

const confirmAddVideohaoPublic = async () => {
  const account = selectedVideohaoCandidate.value
  if (!account) {
    ElMessage.warning('请先选择要监控的视频号账号')
    return
  }

  try {
    adding.value = true
    const exists = accounts.value.find(a => (a.platform_code || a.platform) === 'videohao' && a.unique_id === account.unique_id)
    if (exists) {
      ElMessage.warning('该视频号账号已存在，无需重复添加')
      return
    }
    const res = await accountApi.create({
      platform: 'videohao',
      uniqueId: account.unique_id,
      secUid: account.sec_uid || account.unique_id,
      nickname: account.nickname || '未知视频号',
      avatar: account.avatar || '',
      followerCount: account.follower_count || 0,
      videoCount: account.video_count || 0,
      signature: account.signature || account.auth_company_name || '',
      verified: account.verified || 0,
      remark: '公开监控',
      status: 'public'
    })
    if (res.code === 0) {
      ElMessage.success(`公开视频号已添加：${account.nickname}`)
      showAddDialog.value = false
      resetAddDialog()
      loadAccounts()
    } else {
      ElMessage.error(res.message || '添加失败')
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '添加失败')
  } finally {
    adding.value = false
  }
}

const fetchFromUrl = async (skipCookieCheck = false) => {
  if (!shareUrl.value) { ElMessage.warning(selectedPlatform.value === 'videohao' ? '请输入视频号名称或ID' : '请输入分享链接'); return }
  if (selectedPlatform.value === 'videohao') {
    await searchVideohaoAccounts()
    return
  }
  if (!skipCookieCheck) {
    const canImport = await ensureXhsGlobalCookieForImport()
    if (!canImport) return
  }
  try {
    fetching.value = true
    ElMessage.info('正在添加账号，请稍候...')
    const res = await accountApi.fetchFromUrl({ url: shareUrl.value, platform: selectedPlatform.value })
    if (res.code === 0) {
      ElMessage.success(`账号添加成功：${res.data.account.nickname}`)
      showAddDialog.value = false; resetAddDialog(); loadAccounts()
    } else { 
      ElMessage.error(res.message || '采集失败') 
    }
  } catch (e) {
    if (selectedPlatform.value === 'xiaohongshu' && e.response?.data?.data?.needGlobalCookie) {
      globalCookieStates.value = {
        ...globalCookieStates.value,
        xiaohongshu: { hasCookie: false, platform: 'xiaohongshu', updatedAt: null, isValid: false }
      }
      ElMessage.warning(e.response?.data?.message || '请先扫码获取小红书全局Cookie')
      pendingGlobalCookieAction.value = () => fetchFromUrl(true)
      startGlobalCookieLogin('xiaohongshu')
      return
    }
    const msg = e.code === 'ECONNABORTED' ? '采集超时，请稍后重试（可能需要15-20秒）' : (e.response?.data?.message || '采集失败，请检查链接格式')
    ElMessage.error(msg)
  } finally { fetching.value = false }
}

const confirmAddFromUrl = async () => {
  if (selectedPlatform.value === 'videohao') {
    await confirmAddVideohaoPublic()
    return
  }
  if (!fetchedAccount.value) return
  try {
    adding.value = true
    ElMessage.success('账号添加成功！')
    showAddDialog.value = false; resetAddDialog(); loadAccounts()
  } catch (e) { ElMessage.error('添加失败') } finally { adding.value = false }
}

const generateQRCode = async () => {
  try {
    generating.value = true; resetQRCode()
    const res = await accountApi.generateQRCode({ platform: selectedPlatform.value })
    if (res.code === 0) {
      sessionId.value = res.data.sessionId
      qrCodeImage.value = res.data.qrCode
      qrStatus.value = 'pending'
      countdown.value = res.data.expiresIn
      startCountdown(); startPolling()
    }
  } catch (e) { ElMessage.error('生成二维码失败: ' + (e.response?.data?.message || e.message)) } finally { generating.value = false }
}

const startCountdown = () => {
  clearInterval(countdownTimer.value)
  countdownTimer.value = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) { qrStatus.value = 'expired'; clearInterval(countdownTimer.value); clearInterval(pollTimer.value) }
  }, 1000)
}

const startPolling = () => {
  clearInterval(pollTimer.value)
  pollTimer.value = setInterval(async () => {
    if (!sessionId.value || qrStatus.value === 'confirmed' || qrStatus.value === 'expired') { clearInterval(pollTimer.value); return }
    try {
      const res = await accountApi.getQRCodeStatus(sessionId.value)
      if (res.code === 0) {
        const newStatus = res.data.status
        if (newStatus !== qrStatus.value) {
          qrStatus.value = newStatus
          if (newStatus === 'confirmed') {
            clearInterval(pollTimer.value); clearInterval(countdownTimer.value)
            if (res.data.accountInfo) {
              pendingAccount.value = res.data.accountInfo
              ElMessage.success(`扫码成功！已获取账号「${res.data.accountInfo.nickname}」`)
              try {
                adding.value = true
                // 检查是为已有账号添加授权还是新添加账号
                const loginPlatform = res.data.accountInfo.platform || selectedPlatform.value || 'douyin'
                const existingAccount = accounts.value.find(a => a.unique_id === res.data.accountInfo.unique_id && (a.platform_code || a.platform) === loginPlatform)
                if (existingAccount) {
                  // 为已有账号更新Cookie
                  const updateRes = await accountApi.update(existingAccount.id, {
                    cookie_data: res.data.accountInfo.cookie_data || res.data.cookie_data,
                    status: 'active',
                    avatar: res.data.accountInfo.avatar || existingAccount.avatar || '',
                    nickname: res.data.accountInfo.nickname || existingAccount.nickname,
                    follower_count: res.data.accountInfo.follower_count || existingAccount.follower_count || 0,
                    following_count: res.data.accountInfo.following_count || existingAccount.following_count || 0,
                    like_count: res.data.accountInfo.like_count || existingAccount.like_count || 0
                  })
                  if (updateRes.code === 0) { 
                    ElMessage.success('账号授权成功！现在可以采集完整数据了'); 
                  } else {
                    ElMessage.error(updateRes.message || '账号授权失败');
                  }
                } else {
                  // 新添加账号
                  const createRes = await accountApi.create({
                    platform: loginPlatform,
                    uniqueId: res.data.accountInfo.unique_id,
                    nickname: res.data.accountInfo.nickname,
                    avatar: res.data.accountInfo.avatar,
                    followerCount: res.data.accountInfo.follower_count || 0,
                    followingCount: res.data.accountInfo.following_count || 0,
                    likeCount: res.data.accountInfo.like_count || 0,
                    videoCount: res.data.accountInfo.video_count || 0,
                    signature: res.data.accountInfo.signature || '扫码登录导入',
                    verified: res.data.accountInfo.verified || 0,
                    remark: '扫码添加',
                    status: 'active',
                    cookieData: res.data.cookieData || res.data.accountInfo.cookie_data
                  })
                  if (createRes.code === 0) { ElMessage.success('账号添加成功！'); }
                  else { ElMessage.error(createRes.message || '账号添加失败'); }
                }
              } catch (e) { 
                console.error('添加账号失败:', e);
                ElMessage.error(e.response?.data?.message || '添加失败'); 
              } finally { 
                console.log('关闭弹窗...');
                adding.value = false; 
                showAddDialog.value = false; 
                resetQRCode(); 
                loadAccounts();
                console.log('弹窗已关闭');
              }
            } else {
              // 没有获取到账号信息，也关闭弹窗
              ElMessage.warning('扫码成功但未获取到账号信息，请重试');
              showAddDialog.value = false;
              resetQRCode();
            }
          } else if (newStatus === 'scanned') { ElMessage.info('已扫码，等待确认...') }
          else if (newStatus === 'expired') { ElMessage.warning('二维码已过期，请重新生成'); clearInterval(countdownTimer.value) }
        }
      }
    } catch (e) { console.error('轮询失败', e) }
  }, 2000)
}

const mockScan = async () => {
  try { const res = await accountApi.mockScan({ sessionId: sessionId.value }); if (res.code === 0) { qrStatus.value = 'scanned'; ElMessage.success('模拟扫码成功，等待确认...') } }
  catch (e) { ElMessage.error('模拟扫码失败') }
}

const confirmAdd = async () => {
  try {
    adding.value = true
    const res = await accountApi.confirmLogin({ sessionId: sessionId.value })
    if (res.code === 0) { ElMessage.success('账号添加成功！'); showAddDialog.value = false; resetQRCode(); loadAccounts() }
  } catch (e) { ElMessage.error(e.response?.data?.message || '添加失败') } finally { adding.value = false }
}

const resetQRCode = () => {
  clearInterval(countdownTimer.value); clearInterval(pollTimer.value)
  sessionId.value = ''; qrStatus.value = ''; countdown.value = 300; pendingAccount.value = null; qrCodeImage.value = ''
}

const handleSync = async (account) => {
  if (account.platform === 'videohao' && account.status === 'public') {
    await startVideohaoLocalCapture(account)
    return
  }
  account.syncing = true
  try {
    ElMessage.info(`正在同步 ${account.nickname}...`)
    const res = await accountApi.sync(account.id)
    if (res.code === 0) {
      ElMessage.success(`同步成功！新增 ${res.data?.addedCount || 0} 个视频`)
      // 更新本地同步时间
      account.last_fetch_at = new Date().toISOString()
      loadAccounts()
    } else {
      ElMessage.error(res.message || '同步失败')
    }
  } catch (e) {
    ElMessage.error('同步失败：' + (e.response?.data?.message || e.message))
  } finally {
    account.syncing = false
  }
}

const startVideohaoLocalCapture = async (account) => {
  account.syncing = true
  try {
    ElMessage.info(`正在通过桌面微信采集 ${account.nickname}...`)
    const res = await accountApi.desktopVideohaoSync({ accountId: account.id, timeout: 45000 })
    if (res.code !== 0) {
      ElMessage.error(res.message || '视频号桌面微信采集失败')
      return
    }
    const saved = Number(res.data?.saved) || 0
    account.last_fetch_at = new Date().toISOString()
    await loadAccounts()
    ElMessage.success(saved > 0 ? `视频号桌面微信采集完成，新增/更新 ${saved} 条数据` : '视频号桌面微信采集完成，暂无新增数据')
  } catch (e) {
    ElMessage.error('视频号桌面微信采集失败：' + (e.response?.data?.message || e.message))
  } finally {
    account.syncing = false
  }
}

const handleDelete = (account) => {
  ElMessageBox.confirm(`删除 "${account.nickname}" ?`, '确认删除', { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' })
    .then(async () => { await accountApi.delete(account.id); ElMessage.success('已删除'); loadAccounts() }).catch(() => {})
}

const handleCardAction = (command, account) => {
  if (command === 'sync') {
    handleSync(account)
  } else if (command === 'delete') {
    handleDelete(account)
  }
}

const copyLink = async (account) => {
  try {
    // 根据平台生成链接
    let link = ''
    if (account.platform === 'douyin') {
      link = `https://www.douyin.com/user/${account.unique_id}`
    } else if (account.platform === 'xiaohongshu') {
      link = `https://www.xiaohongshu.com/user/profile/${account.unique_id}`
    } else if (account.platform === 'videohao') {
      link = `https://channels.weixin.qq.com/profile/${account.unique_id}`
    }
    
    await navigator.clipboard.writeText(link)
    ElMessage.success('链接已复制到剪贴板')
  } catch (e) {
    ElMessage.error('复制失败')
  }
}

onMounted(() => {
  loadAccounts()
  loadGlobalCookieStatus()
})
onUnmounted(() => {
  resetQRCode()
  closeGlobalCookieDialog()
})
</script>

<style scoped>
/* ============================================
   白色赛博风格 - Accounts.vue (严格参照参考文件)
   ============================================ */
.cyber-accounts {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #F8FAFC;
  background-image:
    linear-gradient(rgba(0, 229, 255, 0.18) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 229, 255, 0.18) 1px, transparent 1px);
  background-size: 30px 30px;
}

/* ========== 裁切角 ========== */
.cyber-cut {
  clip-path: polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px);
}
.cyber-cut-btn {
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
}

/* ========== 顶部栏 (参照参考文件 header) ========== */
.accounts-header {
  height: 80px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(0, 229, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  flex-shrink: 0;
  z-index: 10;
}
.header-left {}
.page-title {
  font-size: 24px;
  font-weight: 900;
  color: #0F172A;
  letter-spacing: 4px;
  margin: 0;
}
.title-highlight {
  color: #06B6D4;
}
.page-subtitle {
  font-size: 12px;
  color: #64748B;
  font-weight: 700;
  margin-top: 4px;
  letter-spacing: 1px;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* 搜索框 (参照参考文件) */
.search-box {
  position: relative;
}
.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #06B6D4;
  font-size: 12px;
}
.search-input {
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  padding: 8px 16px 8px 36px;
  font-size: 12px;
  font-weight: 700;
  background: #ffffff;
  border: 2px solid #E2E8F0;
  color: #1E293B;
  width: 256px;
  outline: none;
  transition: border-color 0.2s;
}
.search-input::placeholder { color: #94A3B8; }
.search-input:focus { border-color: #22D3EE; }

/* 新增按钮 (参照参考文件) */
.add-btn {
  padding: 8px 24px;
  background: #06B6D4;
  color: #ffffff;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 2px;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 3px 3px 0px 0px rgba(0, 139, 153, 0.3);
  display: flex;
  align-items: center;
  gap: 4px;
}
.add-btn:hover {
  background: #22D3EE;
}

/* ========== 内容区域 ========== */
.accounts-content {
  flex: 1;
  overflow: auto;
  padding: 32px;
  position: relative;
  z-index: 0;
}

/* ========== 筛选过滤栏 (参照参考文件) ========== */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}
.filter-label {
  font-size: 12px;
  font-weight: 700;
  color: #94A3B8;
  letter-spacing: 2px;
  margin-right: 4px;
}

.filter-btn {
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  background: #ffffff;
  color: #64748B;
}
.filter-btn.filter-active {
  background: #0F172A;
  color: #ffffff;
  border-color: #0F172A;
}
.filter-btn.filter-auth {
  background: #ffffff;
  color: #059669;
  border-color: #A7F3D0;
}
.filter-btn.filter-auth:hover { border-color: #34D399; }
.filter-btn.filter-expired {
  background: #ffffff;
  color: #DB2777;
  border-color: #FBCFE8;
}
.filter-btn.filter-expired:hover { border-color: #F472B6; }
.filter-btn.filter-public {
  background: #EFF6FF;
  color: #2563EB;
  border-color: #BFDBFE;
}
.filter-btn.filter-public:hover { border-color: #3B82F6; }

.global-cookie-monitor {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
  padding-left: 16px;
  border-left: 1px solid #CBD5E1;
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
.global-cookie-logo svg,
.global-cookie-logo i {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  line-height: 1;
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

/* ========== 白色面板 ========== */
.cyber-panel-light {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  border: 1px solid #E2E8F0;
  box-shadow: 4px 4px 0px 0px rgba(0, 229, 255, 0.15);
  border-left: 4px solid #00E5FF;
  position: relative;
  overflow: hidden;
}
/* 卡片左侧渐变光条 - 已移除蓝色条，只保留根据状态的边框色 */
.cyber-panel-light::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: transparent;
  z-index: 2;
}

/* ========== 账号卡片网格 (参照参考文件) ========== */
.account-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
}

/* ========== 账号卡片 (严格参照参考文件) ========== */
.account-card {
  position: relative;
  overflow: hidden;
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: all 0.3s;
}
.account-card:hover {
  box-shadow: 6px 6px 0px 0px rgba(0, 229, 255, 0.25);
  transform: translateY(-2px);
}

/* 背景平台 Logo 水印 */
.platform-watermark {
  position: absolute;
  right: 2px;
  bottom: -2px;
  width: auto;
  height: auto;
  opacity: 0.08;
  pointer-events: none;
  z-index: 11;
  color: #64748B;
  font-size: 6rem;
  line-height: 1;
}
.platform-watermark svg,
.platform-watermark i {
  width: 1em;
  height: 1em;
  display: block;
  line-height: 1;
}

/* 卡片头部 (参照参考文件) */
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  position: relative;
  z-index: 10;
}
.card-identity {
  display: flex;
  align-items: center;
}
.card-avatar {
  width: 48px;
  height: 48px;
  border: 2px solid #E2E8F0;
  background: #ffffff;
  padding: 2px;
  margin-right: 12px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94A3B8;
  flex-shrink: 0;
  position: relative;
}
.card-avatar-fallback-icon {
  position: absolute;
  inset: 0;
  margin: auto;
  z-index: 0;
}
.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  position: relative;
  z-index: 1;
}
.card-name-group {
  display: flex;
  flex-direction: column;
}
.card-name {
  font-size: 16px;
  font-weight: 700;
  color: #0F172A;
  margin: 0;
  max-width: 128px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-tags {
  display: flex;
  align-items: center;
  margin-top: 4px;
  gap: 8px;
}

/* 平台标签 (参照参考文件 platform-xxx) */
.platform-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 18px;
  padding: 0;
  border-radius: 3px;
  border: 1px solid transparent;
  flex-shrink: 0;
  line-height: 1;
}
.platform-logo {
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.platform-logo svg {
  width: 14px;
  height: 14px;
}
.platform-logo-douyin { color: #a855f7; }
.platform-logo-xhs { color: #E11D48; }
.platform-logo-xhs-badge {
  width: auto;
  height: auto;
  color: #FF2442;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
  letter-spacing: 0;
}
.platform-logo-videohao { color: #059669; }
.platform-douyin { border-color: rgba(168, 85, 247, 0.45); background: rgba(168, 85, 247, 0.06); }
.platform-xiaohongshu {
  width: auto;
  min-width: 44px;
  padding: 0 7px;
  border-color: rgba(255, 36, 66, 0.45);
  background: rgba(255, 36, 66, 0.06);
}
.platform-videohao { border-color: rgba(5, 150, 105, 0.45); background: rgba(5, 150, 105, 0.06); }

/* 矩阵组标签 (参照参考文件) */
.group-tag {
  font-size: 10px;
  color: #64748B;
  font-weight: 700;
  background: #F1F5F9;
  padding: 2px 6px;
  border-radius: 2px;
}
.group-tag.clickable {
  cursor: pointer;
  transition: all 0.2s;
  color: #0891B2;
  background: rgba(0, 229, 255, 0.1);
}
.group-tag.clickable:hover {
  color: #0E7490;
  background: rgba(0, 229, 255, 0.2);
}

/* 更多按钮 */
.more-btn {
  background: none;
  border: none;
  color: #94A3B8;
  cursor: pointer;
  padding: 4px;
  transition: color 0.2s;
  font-size: 16px;
}
.more-btn:hover { color: #334155; }

/* 数据面板 (参照参考文件 bg-slate-50 区域) */
.card-data-panel {
  background: #F8FAFC;
  border: 1px solid #F1F5F9;
  padding: 12px;
  margin-bottom: 16px;
  position: relative;
  z-index: 10;
}
.data-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}
.data-row + .data-row { margin-top: 8px; }
.data-label {
  color: #64748B;
  font-weight: 700;
  flex-shrink: 0;
}
.data-value {
  font-weight: 700;
  color: #0F172A;
  margin-left: auto;
  text-align: right;
}
.font-cyber {
  font-family: 'Orbitron', monospace;
}

/* 状态标签 (参照参考文件 getStatusClass) */
.status-badge {
  font-weight: 700;
  display: flex;
  align-items: center;
  font-size: 11px;
  padding: 2px 8px;
  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
  margin-left: auto;
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 6px;
}
.dot-green { background: #10B981; box-shadow: 0 0 5px #10B981; }
.dot-pink { background: #EC4899; box-shadow: 0 0 5px #EC4899; animation: blink-dot 2s ease-in-out infinite; }
.dot-blue { background: #3B82F6; box-shadow: 0 0 5px #3B82F6; }
.dot-gray { background: #94A3B8; }
@keyframes blink-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.status-auth-ok { background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; }
.status-expired { background: #FDF2F8; color: #DB2777; border: 1px solid #FBCFE8; }
/* 公开监控样式 - 黑色加粗，和深度授权一样 */
.status-public { background: transparent; color: #0F172A; border: none; font-weight: 700; }

/* 底部操作 (参照参考文件) */
.card-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
  position: relative;
  z-index: 12;
}
.sync-time {
  font-size: 10px;
  font-weight: 700;
  color: #94A3B8;
}
.card-actions {
  display: flex;
  gap: 8px;
}
.action-btn {
  padding: 4px 12px;
  font-size: 10px;
  font-weight: 700;
  color: #ffffff;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 4px;
}
.btn-insight {
  background: #06B6D4;
  box-shadow: 2px 2px 0px 0px rgba(0, 229, 255, 0.3);
}
.btn-insight:hover { background: #22D3EE; }
.btn-rescan {
  background: #EC4899;
  box-shadow: 2px 2px 0px 0px rgba(255, 0, 122, 0.3);
}
.btn-rescan:hover { background: #F472B6; }

/* ========== 对话框样式 ========== */
:deep(.cyber-dialog-light) {
  background: rgba(255, 255, 255, 0.95) !important;
  border: 1px solid rgba(0, 229, 255, 0.2);
  border-radius: 8px !important;
  box-shadow: 8px 8px 0px 0px rgba(0, 229, 255, 0.1) !important;
  backdrop-filter: blur(12px);
}
:deep(.cyber-dialog-light .el-dialog__header) { border-bottom: 1px solid #E2E8F0; padding: 16px 20px; }
:deep(.cyber-dialog-light .el-dialog__title) { font-family: 'Orbitron', monospace; color: #0F172A; letter-spacing: 2px; font-size: 14px; font-weight: 700; }
:deep(.cyber-dialog-light .el-dialog__headerbtn .el-dialog__close) { color: #94A3B8 !important; }
:deep(.cyber-dialog-light .el-dialog__body) { padding: 24px; }
:deep(.cyber-dialog-light .el-form-item__label) { color: #0F172A !important; font-weight: 600; }

.add-account-container { display: flex; flex-direction: column; gap: 20px; }

/* 区域标签 */
.section-label { font-family: 'Orbitron', monospace; font-size: 12px; font-weight: 700; color: #64748B; letter-spacing: 1px; text-transform: uppercase; }

.add-method-tabs { display: flex; gap: 8px; border-bottom: 1px solid #E2E8F0; padding-bottom: 16px; }
.method-tab {
  display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 4px;
  cursor: pointer; transition: all 0.3s ease; font-size: 13px; color: #64748B;
  border: 1px solid transparent; background: #F8FAFC;
}
.method-tab:hover { background: #F1F5F9; color: #0F172A; }
.method-tab.active { background: rgba(0, 229, 255, 0.08); border-color: rgba(0, 229, 255, 0.3); color: #0891B2; box-shadow: 3px 3px 0px 0px rgba(0, 229, 255, 0.15); }

.method-content { min-height: 200px; }

.input-section { display: flex; flex-direction: column; gap: 12px; }
:deep(.input-section .el-input__wrapper),
:deep(.input-section .el-textarea__inner) { background: #FFFFFF !important; border: 1px solid #E2E8F0 !important; border-radius: 4px !important; box-shadow: none !important; color: #0F172A !important; }
:deep(.input-section .el-input__wrapper:hover),
:deep(.input-section .el-textarea__inner:hover) { border-color: rgba(0, 229, 255, 0.4) !important; }
:deep(.input-section .el-input__wrapper.is-focus),
:deep(.input-section .el-textarea__inner:focus) { border-color: #00E5FF !important; box-shadow: 3px 3px 0px 0px rgba(0, 229, 255, 0.15) !important; }
:deep(.input-section .el-input__inner),
:deep(.input-section .el-textarea__inner) { color: #0F172A !important; }
:deep(.input-section .el-input__inner::placeholder),
:deep(.input-section .el-textarea__inner::placeholder) { color: #94A3B8 !important; }

.url-hint { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #64748B; padding: 8px 12px; background: #F8FAFC; border-radius: 4px; border-left: 2px solid #00E5FF; }
.fetching-status { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 20px; color: #0891B2; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.preview-section { margin-top: 16px; padding: 16px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 4px; }
.preview-title { font-family: 'Orbitron', monospace; font-size: 11px; color: #0891B2; margin-bottom: 12px; letter-spacing: 1px; }
.preview-card { display: flex; align-items: center; gap: 12px; padding: 12px; background: #FFFFFF; border-radius: 4px; border: 1px solid #E2E8F0; }
.preview-card .preview-avatar { width: 48px; height: 48px; border-radius: 50%; border: 2px solid #00E5FF; object-fit: cover; }
.preview-card .preview-info { flex: 1; }
.preview-card .preview-name { font-size: 15px; font-weight: 600; color: #0F172A; margin-bottom: 4px; }
.preview-card .preview-stats { font-family: 'Orbitron', monospace; font-size: 11px; color: #94A3B8; }
.candidate-section { margin-top: 16px; padding: 16px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 4px; }
.candidate-list { display: grid; grid-template-columns: 1fr; gap: 8px; max-height: 280px; overflow-y: auto; }
.candidate-card { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 4px; cursor: pointer; text-align: left; transition: all 0.2s; }
.candidate-card:hover { border-color: #10B981; background: #F0FDF4; }
.candidate-card.active { border-color: #059669; background: #ECFDF5; box-shadow: 3px 3px 0 rgba(5, 150, 105, 0.15); }
.candidate-avatar { width: 40px; height: 40px; border-radius: 4px; object-fit: cover; background: #E2E8F0; flex-shrink: 0; }
.candidate-info { min-width: 0; flex: 1; }
.candidate-name { font-size: 14px; font-weight: 700; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.candidate-meta { margin-top: 4px; font-size: 12px; color: #64748B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.platform-selector { display: flex; gap: 12px; justify-content: center; }
.platform-option { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px 20px; border: 1px solid #E2E8F0; border-radius: 4px; cursor: pointer; transition: all 0.3s ease; background: #FFFFFF; }
.platform-option:hover { border-color: #CBD5E1; background: #F8FAFC; }
.platform-option.active { border-color: #00E5FF; background: rgba(0, 229, 255, 0.06); box-shadow: 3px 3px 0px 0px rgba(0, 229, 255, 0.15); }
.platform-option.active.plat-douyin { border-color: #a855f7; background: rgba(168, 85, 247, 0.06); box-shadow: 3px 3px 0px 0px rgba(168, 85, 247, 0.15); }
.platform-option.active.plat-xiaohongshu { border-color: #E11D48; background: rgba(225, 29, 72, 0.06); box-shadow: 3px 3px 0px 0px rgba(225, 29, 72, 0.15); }
.platform-option.active.plat-videohao { border-color: #059669; background: rgba(5, 150, 105, 0.06); box-shadow: 3px 3px 0px 0px rgba(5, 150, 105, 0.15); }
.platform-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; }
.platform-name { font-size: 12px; color: #0F172A; font-weight: 600; }

.qr-code-section { display: flex; flex-direction: column; align-items: center; gap: 16px; }

/* 简化的扫码状态显示 */
.qr-simple-status { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 180px; padding: 24px; background: #F8FAFC; border-radius: 8px; border: 1px solid #E2E8F0; }
.status-item { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
.status-item.success .status-main { color: #059669; }
.status-item.error .status-main { color: #DC2626; }
.status-main { font-family: 'Orbitron', monospace; font-size: 16px; color: #0F172A; font-weight: 600; }
.status-sub { font-size: 13px; color: #64748B; }
.status-timer { font-family: 'Orbitron', monospace; font-size: 12px; color: #0891B2; margin-top: 8px; }
.status-icon { animation: none; }
.status-icon.pulse { animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.7; } }
.preview-account-inline { display: flex; align-items: center; gap: 8px; margin-top: 8px; padding: 8px 12px; background: rgba(0, 229, 255, 0.05); border: 1px solid #E2E8F0; border-radius: 20px; }
.preview-avatar-small { width: 24px; height: 24px; border-radius: 50%; border: 1px solid #00E5FF; }

.mock-actions { display: flex; justify-content: center; }
.btn-outline { background: transparent !important; color: #94A3B8 !important; border: 1px dashed #CBD5E1 !important; box-shadow: none !important; }
.btn-outline:hover { border-color: #00E5FF !important; color: #0891B2 !important; background: rgba(0, 229, 255, 0.05) !important; }

.dialog-actions { display: flex; justify-content: flex-end; gap: 12px; padding-top: 16px; border-top: 1px solid #E2E8F0; }
.btn-text { background: transparent !important; color: #64748B !important; box-shadow: none !important; }
.btn-text:hover { color: #0F172A !important; background: #F1F5F9 !important; }
.btn-primary { background: #00E5FF !important; color: #0F172A !important; box-shadow: 3px 3px 0px 0px rgba(0, 139, 153, 0.3) !important; }
.btn-primary:hover { background: #00D4EA !important; box-shadow: 4px 4px 0px 0px rgba(0, 139, 153, 0.4) !important; transform: translate(-1px, -1px); }
</style>

<!-- 全局样式：水印和数据对齐（不受 scoped 限制） -->
<style>
.platform-watermark {
  position: absolute !important;
  right: -16px !important;
  bottom: -16px !important;
  width: auto !important;
  height: auto !important;
  opacity: 0.08 !important;
  pointer-events: none !important;
  z-index: 11 !important;
  color: #334155 !important;
  font-size: 6rem !important;
  line-height: 1 !important;
}
.platform-watermark svg,
.platform-watermark i {
  width: 1em !important;
  height: 1em !important;
  display: block !important;
  line-height: 1 !important;
}
/* 强制数据值右对齐 */
div.card-data-panel div.data-row {
  display: flex !important;
  justify-content: space-between !important;
  width: 100% !important;
  box-sizing: border-box !important;
}
div.card-data-panel span.data-value {
  font-weight: 700 !important;
  color: #0F172A !important;
  text-align: right !important;
  flex: 1 !important;
}
div.card-data-panel div.status-badge {
  font-weight: 700 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: flex-end !important;
  flex: 1 !important;
}
div.card-bottom {
  z-index: 12 !important;
}
</style>
