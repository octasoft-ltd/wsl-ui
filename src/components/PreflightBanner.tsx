import { open } from "@tauri-apps/plugin-shell";
import { useTranslation } from "react-i18next";
import { usePreflightStore } from "../store/preflightStore";
import { NotificationBanner } from "./NotificationBanner";
import { Button } from "./ui/Button";

/**
 * PreflightBanner - Displays WSL preflight check status
 *
 * Shows a warning/error banner when WSL is not properly installed or configured.
 * Includes a retry button and help link based on the specific error.
 */
export function PreflightBanner() {
  const { t } = useTranslation("statusbar");
  const { status, hasChecked, isReady, isChecking, title, message, helpUrl, checkPreflight } =
    usePreflightStore();

  // Don't show anything if:
  // - We haven't checked yet
  // - WSL is ready
  if (!hasChecked || isReady) {
    return null;
  }

  // Determine notification type based on status
  const getNotificationType = () => {
    if (!status) return "warning";

    switch (status.status) {
      case "notInstalled":
      case "featureDisabled":
      case "virtualizationDisabled":
        return "error";
      case "kernelUpdateRequired":
        return "warning";
      case "unknown":
      default:
        return "error";
    }
  };

  const handleHelpClick = () => {
    if (helpUrl) {
      open(helpUrl);
    }
  };

  return (
    <NotificationBanner
      type={getNotificationType()}
      title={title}
      message={message}
      testId="preflight-banner"
    >
      <div className="flex flex-wrap gap-3 mt-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => checkPreflight()}
          loading={isChecking}
        >
          {t('preflight.retry')}
        </Button>
        {helpUrl && (
          <Button variant="link" size="sm" onClick={handleHelpClick}>
            {t('common:button.learnMore')}
          </Button>
        )}
      </div>
    </NotificationBanner>
  );
}
