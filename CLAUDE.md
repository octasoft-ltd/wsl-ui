* When we encounter errors which would be useful for a user of the application, record it in @docs\\TROUBLESHOOTING.md
* Origin header issues in e2e tests are normally because tauri needs to be rebuilt with --debug flag to create debug build. Rebuild, check date of build to confirm success. Also ensure tauri driver and edge driver are terminated as processes often linger. Command for debug builds "npm run tauri:build:debug"
* When running individual e2e tests, arguments are not passed correctly via npm + cross-env - Instead use npm target "npm test:e2e:spec  path/to/spec/file.spec.ts"
