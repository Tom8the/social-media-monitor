<template>
  <el-container class="cyber-layout">
    <!-- 白色赛博侧边栏 -->
    <el-aside width="256px" class="cyber-aside">
      <!-- 品牌 -->
      <div class="brand">
        <div class="brand-icon">
          <i class="fa-solid fa-cube"></i>
        </div>
        <div class="brand-text">
          <span class="brand-name">矩阵中枢</span>
          <span class="brand-sub">核心调度系统</span>
        </div>
      </div>

      <!-- 扫描线装饰 -->
      <div class="scanline-deco"></div>

      <!-- 导航 -->
      <el-menu :default-active="$route.path" router class="cyber-nav">
        <el-menu-item index="/dashboard">
          <el-icon><Grid /></el-icon>
          <span>数据大盘</span>
          <div class="nav-glow"></div>
        </el-menu-item>
        <el-menu-item index="/accounts">
          <el-icon><UserFilled /></el-icon>
          <span>账号监控管理</span>
          <div class="nav-glow"></div>
        </el-menu-item>
        <el-menu-item index="/videos">
          <el-icon><View /></el-icon>
          <span>账号数据监控</span>
          <div class="nav-glow"></div>
        </el-menu-item>
        <el-menu-item index="/alerts">
          <el-icon><BellFilled /></el-icon>
          <span>系统告警配置</span>
          <div class="nav-glow"></div>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- 主内容 -->
    <el-container class="cyber-main-container">
      <el-main class="cyber-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { Grid, UserFilled, View, BellFilled } from '@element-plus/icons-vue'
</script>

<style>
/* 科技感字体 */
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Rajdhani:wght@400;500;600;700&display=swap');

/* ============================================
   全局白色赛博CSS变量 & 基础重置
   ============================================ */
:root {
  --light-bg: #F8FAFC;
  --cyber-blue: #00E5FF;
  --cyber-blue-dark: #008B99;
  --cyber-pink: #FF007A;
  --cyber-green: #00E676;
  --panel-bg: rgba(255, 255, 255, 0.9);
  --cyber-bg: #F8FAFC;
  --cyber-bg-card: rgba(255, 255, 255, 0.9);
  --cyber-bg-card-hover: rgba(255, 255, 255, 0.95);
  --cyber-border: rgba(0, 229, 255, 0.2);
  --cyber-border-hover: rgba(0, 229, 255, 0.45);
  --cyber-cyan: #00E5FF;
  --cyber-magenta: #FF007A;
  --cyber-blue-accent: #008B99;
  --cyber-yellow: #FFB800;
  --cyber-red: #FF3B5C;
  --cyber-orange: #FF8C00;
  --cyber-text: #0F172A;
  --cyber-text-dim: #64748B;
  --cyber-text-bright: #020617;
  --cyber-glow-cyan: 0 0 10px rgba(0,229,255,0.25), 0 0 30px rgba(0,229,255,0.08);
  --cyber-glow-magenta: 0 0 10px rgba(255,0,122,0.25), 0 0 30px rgba(255,0,122,0.08);
  --cyber-glow-green: 0 0 10px rgba(0,230,118,0.25);
  --cyber-glow-red: 0 0 10px rgba(255,59,92,0.25);
  --cyber-radius: 4px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Rajdhani', 'Orbitron', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: var(--cyber-bg);
  color: var(--cyber-text);
  overflow: hidden;
}

/* ============================================
   裁切角效果 (参照 ui_light_cyberpunk.html)
   ============================================ */
.cyber-cut {
  clip-path: polygon(
    15px 0,
    100% 0,
    100% calc(100% - 15px),
    calc(100% - 15px) 100%,
    0 100%,
    0 15px
  );
}
.cyber-cut-btn {
  clip-path: polygon(
    8px 0,
    100% 0,
    100% calc(100% - 8px),
    calc(100% - 8px) 100%,
    0 100%,
    0 8px
  );
}

/* ============================================
   白色赛博面板样式
   ============================================ */
.cyber-panel-light {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 229, 255, 0.15);
  border-left: 4px solid var(--cyber-cyan);
  border-radius: 8px;
  padding: 20px;
  transition: all 0.3s ease;
}
.cyber-panel-light:hover {
  border-color: rgba(0, 229, 255, 0.35);
  box-shadow: 0 0 20px rgba(0, 229, 255, 0.08);
}

/* ============================================
   Element Plus 深度覆盖 — 白色赛博主题
   ============================================ */
.el-menu { border-right: none !important; background: transparent !important; }

/* 侧边栏菜单项 */
.cyber-nav .el-menu-item {
  height: 46px; line-height: 46px; margin: 3px 10px;
  position: relative;
  color: var(--cyber-text-dim) !important;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 14px; font-weight: 700; letter-spacing: 2px;
  border: 1px solid #E2E8F0;
  background: #ffffff;
  clip-path: polygon(
    8px 0,
    100% 0,
    100% calc(100% - 8px),
    calc(100% - 8px) 100%,
    0 100%,
    0 8px
  );
  transition: all 0.3s ease;
  overflow: hidden;
}
.cyber-nav .el-menu-item:hover {
  color: #0891B2 !important;
  background: #ffffff !important;
  border-color: #00E5FF;
}
.cyber-nav .el-menu-item.is-active {
  color: #ffffff !important;
  background: #06B6D4 !important;
  border-color: transparent;
  box-shadow: 2px 2px 0px 0px rgba(0, 139, 153, 0.5);
}
.cyber-nav .el-menu-item.is-active .nav-glow {
  position: absolute; top: 0; left: 0; width: 3px; height: 100%;
  background: #ffffff;
  box-shadow: 0 0 8px rgba(255,255,255,0.6);
}
.cyber-nav .el-menu-item .el-icon { font-size: 18px; }

/* 表格 */
.el-table {
  --el-table-bg-color: transparent !important;
  --el-table-tr-bg-color: transparent !important;
  --el-table-header-bg-color: rgba(0, 229, 255, 0.05) !important;
  --el-table-row-hover-bg-color: rgba(0, 229, 255, 0.06) !important;
  --el-table-border-color: var(--cyber-border) !important;
  --el-table-text-color: var(--cyber-text) !important;
  --el-table-header-text-color: var(--cyber-blue-dark) !important;
  font-family: 'Rajdhani', 'PingFang SC', sans-serif;
}
.el-table th.el-table__cell {
  font-weight: 700 !important; font-size: 13px !important;
  letter-spacing: 1px; text-transform: uppercase;
  border-bottom: 1px solid var(--cyber-border) !important;
}
.el-table td.el-table__cell {
  font-size: 14px !important; border-bottom: 1px solid rgba(0, 229, 255, 0.08) !important;
}
.el-table__inner-wrapper::before { display: none; }
/* 覆盖 Element Plus 表头排序按钮的英文 aria-label */
.el-table .sort-caret { cursor: pointer; }

/* 分页 */
.el-pagination {
  --el-pagination-bg-color: transparent;
  --el-pagination-text-color: var(--cyber-text-dim);
  --el-pagination-button-bg-color: rgba(0, 229, 255, 0.06);
  --el-pagination-hover-color: var(--cyber-blue-dark);
}
.el-pagination .el-pager li {
  background: rgba(255, 255, 255, 0.8) !important;
  color: var(--cyber-text-dim) !important;
  border: 1px solid var(--cyber-border) !important;
  border-radius: var(--cyber-radius) !important;
  margin: 0 2px;
  font-family: 'Rajdhani', sans-serif;
}
.el-pagination .el-pager li.is-active {
  background: linear-gradient(135deg, #00E5FF, #008B99) !important;
  color: #ffffff !important;
  border-color: var(--cyber-cyan) !important;
  box-shadow: 0 2px 10px rgba(0, 229, 255, 0.3);
}

/* 按钮 */
.el-button--primary {
  --el-button-bg-color: #00E5FF;
  --el-button-border-color: #00E5FF;
  --el-button-text-color: #ffffff;
  --el-button-hover-bg-color: #008B99;
  --el-button-hover-border-color: #008B99;
  --el-button-hover-text-color: #ffffff;
}

/* 输入框 */
.el-input__wrapper {
  background: rgba(255, 255, 255, 0.9) !important;
  border: 1px solid var(--cyber-border) !important;
  border-radius: var(--cyber-radius) !important;
  box-shadow: none !important;
}
.el-input__wrapper:hover { border-color: var(--cyber-border-hover) !important; }
.el-input__wrapper.is-focus { border-color: var(--cyber-cyan) !important; box-shadow: var(--cyber-glow-cyan) !important; }
.el-input__inner { color: var(--cyber-text) !important; font-family: 'Rajdhani', 'PingFang SC', sans-serif; }
.el-input__inner::placeholder { color: var(--cyber-text-dim) !important; }
.el-input__prefix .el-icon { color: var(--cyber-text-dim) !important; }

/* Radio Button */
.el-radio-button__inner {
  background: rgba(255, 255, 255, 0.9) !important;
  border: 1px solid var(--cyber-border) !important;
  color: var(--cyber-text-dim) !important;
  font-family: 'Rajdhani', 'PingFang SC', sans-serif;
  font-weight: 600; letter-spacing: 0.5px;
  box-shadow: none !important;
}
.el-radio-button__original-radio:checked + .el-radio-button__inner {
  background: linear-gradient(135deg, #00E5FF, #008B99) !important;
  border-color: var(--cyber-cyan) !important;
  color: #ffffff !important;
  box-shadow: 0 2px 10px rgba(0, 229, 255, 0.3) !important;
}

/* Select */
.el-select .el-input__wrapper { background: rgba(255, 255, 255, 0.9) !important; }

/* Dialog */
.el-dialog {
  background: #ffffff !important;
  border: 1px solid var(--cyber-border) !important;
  border-radius: 8px !important;
  box-shadow: 0 0 40px rgba(0, 229, 255, 0.1) !important;
}
.el-dialog__title { color: var(--cyber-blue-dark) !important; font-family: 'Rajdhani', sans-serif; font-weight: 700; }
.el-dialog__headerbtn .el-dialog__close { color: var(--cyber-text-dim) !important; }
.el-form-item__label { color: var(--cyber-text-dim) !important; font-family: 'Rajdhani', sans-serif; }

/* Tag */
.el-tag--dark { border: 1px solid var(--cyber-border) !important; }

/* 滚动条 - 浅色 */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: rgba(241, 245, 249, 0.5); }
::-webkit-scrollbar-thumb { background: rgba(0, 229, 255, 0.25); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(0, 229, 255, 0.45); }
</style>

<style scoped>
.cyber-layout { height: 100vh; overflow: hidden; }

/* ===== 侧边栏 ===== */
.cyber-aside {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  display: flex; flex-direction: column;
  border-right: 1px solid rgba(0, 229, 255, 0.2);
  position: relative; overflow: hidden;
}

/* 网格纹理背景 */
.cyber-aside::before {
  content: ''; position: absolute; inset: 0; z-index: 0;
  background-image:
    linear-gradient(rgba(0, 229, 255, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 229, 255, 0.1) 1px, transparent 1px);
  background-size: 30px 30px;
  pointer-events: none;
}

/* 品牌 */
.brand {
  height: 80px; display: flex; align-items: center; justify-content: center; gap: 12px;
  border-bottom: 1px solid rgba(0, 229, 255, 0.15);
  position: relative; z-index: 1; flex-shrink: 0;
}
.brand-icon {
  font-size: 24px;
  color: var(--cyber-cyan);
  filter: drop-shadow(0 0 6px rgba(0, 229, 255, 0.4));
}
.brand-text { display: flex; flex-direction: column; }
.brand-name {
  font-family: 'Orbitron', monospace; font-size: 16px; font-weight: 900;
  color: var(--cyber-blue-dark); letter-spacing: 3px;
}
.brand-sub {
  font-family: 'Rajdhani', sans-serif; font-size: 11px;
  color: var(--cyber-text-dim); letter-spacing: 3px;
}

/* 扫描线装饰 */
.scanline-deco {
  height: 2px; margin: 0 20px; flex-shrink: 0; position: relative; z-index: 1;
  background: linear-gradient(90deg, transparent, var(--cyber-cyan), transparent);
  opacity: 0.35;
}

/* 导航 */
.cyber-nav { flex: 1; padding: 16px 0; position: relative; z-index: 1; overflow-y: auto; }

/* ===== 主内容 ===== */
.cyber-main-container {
  background: var(--cyber-bg);
  position: relative;
}
/* 内容区网格纹理 */
.cyber-main-container::before {
  content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(0, 229, 255, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 229, 255, 0.08) 1px, transparent 1px);
  background-size: 30px 30px;
}
.cyber-main {
  padding: 24px 28px; overflow-y: auto; position: relative; z-index: 1;
}
</style>
