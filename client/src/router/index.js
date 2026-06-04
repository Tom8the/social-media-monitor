import { createRouter, createWebHistory } from 'vue-router'
import Layout from '../views/Layout.vue'

const routes = [
  {
    path: '/',
    component: Layout,
    redirect: '/dashboard',
    children: [
      { path: '/dashboard', name: 'Dashboard', component: () => import('../views/Dashboard.vue'), meta: { title: '数据看板' } },
      { path: '/videos', name: 'Videos', component: () => import('../views/Videos.vue'), meta: { title: '视频明细' } },
      { path: '/accounts', name: 'Accounts', component: () => import('../views/Accounts.vue'), meta: { title: '账号授权管理' } },
      { path: '/alerts', name: 'Alerts', component: () => import('../views/Alerts.vue'), meta: { title: '监控告警' } },
      { path: '/test-scrape', name: 'TestScrape', component: () => import('../views/TestScrape.vue'), meta: { title: '抓取测试' } }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
