/**
 * Next.js Instrumentation Hook
 * Uygulama sunucusu başladığında bir kez çalışır.
 * Migration hatası uygulamayı çökertmez.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { runMigrations } = await import('./lib/migrate')
      await runMigrations()
    } catch (err) {
      // Migration hatası uygulamayı durdurmamalı
      console.error('[instrumentation] Migration hatası (uygulama devam ediyor):', err)
    }
  }
}
