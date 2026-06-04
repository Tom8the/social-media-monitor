<template>
  <div class="test-page">
    <div class="test-header">
      <h2>🧪 数据抓取测试 — 凹凸曼先生</h2>
      <p class="test-desc">独立的抓取测试页面，用于调试和验证数据采集功能</p>
    </div>

    <div class="test-actions">
      <el-button type="primary" @click="startSync" :loading="syncing" size="large">
        <el-icon><Refresh /></el-icon> 开始抓取
      </el-button>
      <el-button @click="loadVideos" size="large">
        <el-icon><Search /></el-icon> 刷新列表
      </el-button>
    </div>

    <div v-if="syncing" class="sync-status">
      <el-icon class="spin"><Loading /></el-icon> 正在抓取中，请稍候...
    </div>

    <div v-if="syncResult" class="sync-result" :class="syncResult.addedCount > 0 ? 'success' : 'warning'">
      {{ syncResult.message }}
    </div>

    <div class="test-stats" v-if="videos.length > 0">
      <span class="stat-item">共 <strong>{{ total }}</strong> 条视频</span>
    </div>

    <el-table :data="videos" v-loading="loading" stripe border style="width: 100%">
      <el-table-column type="index" width="50" label="#" />
      <el-table-column label="视频" min-width="400">
        <template #default="{ row }">
          <div class="vid-cell">
            <div class="vid-cover">
              <img :src="getMediaUrl(row.cover_url)" @error="handleImgError" />
            </div>
            <div class="vid-info">
              <a :href="row.video_url || `https://www.douyin.com/video/${row.video_id}`" target="_blank" class="vid-link">
                {{ row.title || '无标题' }}
              </a>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="发布时间" width="120" align="center">
        <template #default="{ row }">{{ formatDate(row.published_at) }}</template>
      </el-table-column>
      <el-table-column label="播放量" width="100" align="right">
        <template #default="{ row }">{{ row.play_count || 0 }}</template>
      </el-table-column>
      <el-table-column label="点赞数" width="100" align="right">
        <template #default="{ row }">{{ row.like_count || 0 }}</template>
      </el-table-column>
      <el-table-column label="评论数" width="100" align="right">
        <template #default="{ row }">{{ row.comment_count || 0 }}</template>
      </el-table-column>
      <el-table-column label="分享数" width="100" align="right">
        <template #default="{ row }">{{ row.share_count || 0 }}</template>
      </el-table-column>
      <el-table-column label="收藏数" width="100" align="right">
        <template #default="{ row }">{{ row.collect_count || 0 }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Refresh, Search, Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { videoApi, accountApi } from '../api'
import { getMediaUrl } from '../utils/media'

const ACCOUNT_ID = '8eeaed83-0173-4e25-8757-df2c2ed3be7e' // 凹凸曼先生

const loading = ref(false)
const syncing = ref(false)
const videos = ref([])
const total = ref(0)
const syncResult = ref(null)

const formatDate = (time) => {
  if (!time) return '--'
  const d = new Date(time)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const handleImgError = (e) => {
  e.target.src = 'https://via.placeholder.com/80x60?text=No+Cover'
}

const loadVideos = async () => {
  loading.value = true
  try {
    const res = await videoApi.getList({ accountId: ACCOUNT_ID, pageSize: 100 })
    if (res.code === 0) {
      videos.value = res.data.list || []
      total.value = res.data.total || 0
    }
  } catch (e) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const startSync = async () => {
  syncing.value = true
  syncResult.value = null
  try {
    const res = await accountApi.sync(ACCOUNT_ID)
    syncResult.value = { message: `抓取完成: ${res.data.addedCount} 条视频`, addedCount: res.data.addedCount }
    await loadVideos()
  } catch (e) {
    syncResult.value = { message: '抓取失败: ' + e.message, addedCount: 0 }
  } finally {
    syncing.value = false
  }
}

onMounted(() => { loadVideos() })
</script>

<style scoped>
.test-page { padding: 24px; max-width: 1400px; margin: 0 auto; }
.test-header { margin-bottom: 24px; }
.test-header h2 { margin: 0 0 8px; color: #0F172A; }
.test-desc { color: #64748b; margin: 0; }
.test-actions { display: flex; gap: 12px; margin-bottom: 20px; }
.sync-status { padding: 12px 16px; background: #ecfeff; border: 1px solid #00E5FF; border-radius: 6px; color: #0891b2; display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.sync-result { padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-weight: 600; }
.sync-result.success { background: #f0fdf4; border: 1px solid #22c55e; color: #166534; }
.sync-result.warning { background: #fffbeb; border: 1px solid #f59e0b; color: #92400e; }
.test-stats { margin-bottom: 12px; color: #64748b; }
.stat-item strong { color: #0F172A; }
.vid-cell { display: flex; align-items: center; gap: 12px; }
.vid-cover { width: 80px; height: 60px; border-radius: 4px; overflow: hidden; flex-shrink: 0; background: #f1f5f9; }
.vid-cover img { width: 100%; height: 100%; object-fit: cover; }
.vid-info { flex: 1; min-width: 0; }
.vid-link { color: #0891b2; text-decoration: none; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.5; }
.vid-link:hover { text-decoration: underline; }
</style>
