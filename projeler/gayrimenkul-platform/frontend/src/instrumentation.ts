/**
 * Next.js Instrumentation Hook
 * Uygulama sunucusu başladığında bir kez çalışır.
 * Supabase veritabanına tüm migration'ları otomatik uygular.
 */
export async function register() {
  // Sadece Node.js runtime'da çalış (Edge runtime'da değil)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runMigrations } = await import('./lib/migrate')
    await runMigrations()
  }
}
