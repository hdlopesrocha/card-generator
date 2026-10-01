import { createRouter, createWebHashHistory } from 'vue-router'

/**
 * Client-side routes. Views are lazily loaded so the initial bundle only
 * contains the application shell and card list.
 *
 * Hash history is used so every route works when the app is served from a
 * static host without rewrite rules (such as GitHub Pages), where an HTML5
 * history deep link would return a 404 status even though the app loads.
 */
const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/cards' },
    {
      path: '/cards',
      name: 'cards',
      component: () => import('@/views/CardListView.vue'),
    },
    {
      path: '/cards/new',
      name: 'card-new',
      component: () => import('@/views/CardEditorView.vue'),
    },
    {
      path: '/cards/:id/edit',
      name: 'card-edit',
      component: () => import('@/views/CardEditorView.vue'),
      props: true,
    },
    {
      path: '/cards/:id/preview',
      name: 'card-preview',
      component: () => import('@/views/CardPreviewView.vue'),
      props: true,
    },
    {
      path: '/images',
      name: 'images',
      component: () => import('@/views/ImageView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/cards' },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
