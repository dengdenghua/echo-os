import { Navigate, useLocation } from "react-router-dom";

/** Browser links enter the existing desktop instead of replacing its windows. */
export default function DesktopBrowserEntry() {
  const location = useLocation();
  const query = new URLSearchParams(location.search).get("q")?.trim();
  const params = new URLSearchParams({ app: "browser" });
  if (query) params.set("browserQuery", query);
  return <Navigate to={`/desktop?${params}`} state={location.state} replace />;
}
