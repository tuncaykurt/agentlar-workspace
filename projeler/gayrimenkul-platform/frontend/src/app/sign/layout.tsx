import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Elektronik İmza",
  description: "Belge imzalama sayfası",
};

export default function SignLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Force light theme: remove dark class and prevent ThemeProvider from adding it */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              document.documentElement.classList.remove('dark');
              document.documentElement.setAttribute('data-force-light', 'true');
            })();
          `,
        }}
      />
      <div className="sign-page-wrapper">{children}</div>
      <style>{`
        /* Force light theme on sign pages regardless of user/system preference */
        html[data-force-light="true"] {
          --surface: #F8FAFC !important;
          --surface-container-low: #F1F5F9 !important;
          --surface-container: #FFFFFF !important;
          --surface-container-high: #F1F5F9 !important;
          --surface-container-highest: #E2E8F0 !important;
          --on-surface: #0F172A !important;
          --on-surface-variant: #64748B !important;
          --primary: #4F46E5 !important;
          --primary-hover: #4338CA !important;
          --primary-container: #EEF2FF !important;
          --on-primary: #FFFFFF !important;
          --on-primary-container: #4F46E5 !important;
          --secondary: #10B981 !important;
          --secondary-container: #D1FAE5 !important;
          --on-secondary-container: #065F46 !important;
          --tertiary: #F59E0B !important;
          --tertiary-container: #FEF3C7 !important;
          --on-tertiary-container: #92400E !important;
          --error: #F43F5E !important;
          --error-container: #FFF1F2 !important;
          --on-error-container: #9F1239 !important;
          --outline: #E2E8F0 !important;
          --outline-variant: rgba(0, 0, 0, 0.06) !important;
          --backdrop: rgba(0, 0, 0, 0.5) !important;
          --shadow-color: rgba(0, 0, 0, 0.08) !important;
          --glass-bg: rgba(255, 255, 255, 0.7) !important;
          color-scheme: light !important;
        }
        html[data-force-light="true"] body {
          color: #0F172A !important;
          background: #F8FAFC !important;
        }
      `}</style>
    </>
  );
}
