import { Navigate } from "react-router";

import { routes } from "@web/utils/routes";

export function PasswordResetPage() {
  return <Navigate to={routes.account.login} replace />;
}
