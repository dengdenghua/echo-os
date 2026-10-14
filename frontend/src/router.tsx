import { RetainedShellRoutes } from "@/components/retained-shell-routes";
import { DesktopWorkspaceEntry } from "@/components/desktop-workspace-entry";
import { useAuth } from "@/providers/AuthProvider";
import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, useLocation } from "react-router-dom";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PanelLoading } from "@/components/ui/progress-line";
import {
  ElectronTitleBar,
  ElectronTitleBarProvider,
} from "@/components/electron-title-bar";
import { useI18n } from "@/core/i18n/hooks";
import { createWorkspaceRoute } from "@/app/workspace/workspace-routes";
import { preserveWorkbenchPresentation } from "@/core/router/desktop-workspace-route";

const AboutPage = lazy(() => import("./app/about/page"));
const TermsPage = lazy(() => import("./app/terms/page"));
const PrivacyPage = lazy(() => import("./app/privacy/page"));
const PublicThreadSharePage = lazy(() => import("./app/share/[token]/page"));
const DesktopPage = lazy(() => import("./app/desktop/page"));
const TopBrowserPage = lazy(() => import("./components/desktop-browser-entry"));
const MediaAppPage = lazy(() => import("./app/apps/media/page"));
const SLOW_PAGE_LOADING_MS = 8_000;

function LegacyAccountRouteRedirect() {
  const location = useLocation();
  return (
    <Navigate
      to={`/desktop${location.search}`}
      state={location.state}
      replace
    />
  );
}

function LegacyWorkspaceRouteRedirect({ to }: { to: string }) {
  const location = useLocation();
  return (
    <Navigate
      to={preserveWorkbenchPresentation(to, location.search)}
      state={location.state}
      replace
    />
  );
}

export function PageLoading() {
  const { t } = useI18n();
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setIsSlow(true),
      SLOW_PAGE_LOADING_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <PanelLoading
      label={t.common.loading}
      caption={isSlow ? t.common.loadingWorkspace : undefined}
      className="h-full min-h-[320px]"
      data-testid="page-loading"
    >
      {isSlow ? (
        <div className="flex justify-center pt-3">
          <button
            type="button"
            className="rounded-md border border-border-default px-3 py-1.5 text-caption text-foreground transition hover:bg-muted"
            onClick={() => window.location.reload()}
          >
            {t.conversation.retry}
          </button>
        </div>
      ) : null}
    </PanelLoading>
  );
}

export function AppRouter() {
  const { user } = useAuth();
  const sessionIdentity = user?.actor_id || user?.user_id || "signed-out";
  return (
    <ErrorBoundary>
      <ElectronTitleBarProvider>
        <ElectronTitleBar />
        <Suspense fallback={<PageLoading />}>
          <RetainedShellRoutes key={sessionIdentity}>
            <Route path="/" element={<Navigate to="/desktop" replace />} />
            <Route path="/login" element={<LegacyAccountRouteRedirect />} />
            <Route path="/register" element={<LegacyAccountRouteRedirect />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            {/* Capability-token snapshots are intentionally outside the auth
              guard and workspace shell. The public endpoint already returns
              a bounded, sanitised, read-only projection. */}
            <Route path="/share/:token" element={<PublicThreadSharePage />} />
            {/* The desktop owns the only login boundary. Workbench routes
              inherit its HttpOnly session and never render a second login. */}
            <Route path="/desktop" element={<DesktopPage />} />

            <Route element={<ProtectedRoute />}>
              <Route
                path="/settings"
                element={
                  <LegacyWorkspaceRouteRedirect to="/workspace/settings" />
                }
              />
              <Route path="/browser" element={<TopBrowserPage />} />
              <Route
                path="/apps/photos"
                element={<MediaAppPage kind="image" />}
              />
              <Route
                path="/apps/media"
                element={<MediaAppPage kind="video" />}
              />
              <Route
                path="/plugins"
                element={
                  <LegacyWorkspaceRouteRedirect to="/workspace/agents?surface=chat&tab=plugins" />
                }
              />

              <Route element={<DesktopWorkspaceEntry />}>
                {createWorkspaceRoute()}
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </RetainedShellRoutes>
        </Suspense>
      </ElectronTitleBarProvider>
    </ErrorBoundary>
  );
}
