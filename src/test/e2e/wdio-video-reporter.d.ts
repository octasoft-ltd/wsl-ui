// v6.2.0 ships declarations but does not expose them through its exports map.
// The config only consumes the standard WebdriverIO reporter constructor.
declare module "wdio-video-reporter" {
  import type { Reporters } from "@wdio/types";
  const VideoReporter: Reporters.ReporterClass;
  export default VideoReporter;
}
