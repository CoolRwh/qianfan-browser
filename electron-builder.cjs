module.exports = {
  appId: 'com.qianfan.browser',
  productName: '千帆浏览器',
  directories: { output: 'dist', buildResources: 'build' },
  electronDist: 'node_modules/electron/dist',
  asar: true,
  npmRebuild: false,
  files: ['src/**/*', 'build/icon.png', 'package.json', '!**/config.yml', '!**/.env', '!**/.env.*'],
  win: {
    executableName: 'QianfanBrowser', icon: 'build/icon.ico',
    target: [{ target: 'nsis', arch: ['x64'] }, { target: 'portable', arch: ['x64'] }]
  },
  nsis: {
    artifactName: 'QianfanBrowser-Setup-${version}-${arch}.${ext}',
    oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true, createStartMenuShortcut: true,
    shortcutName: '千帆浏览器', uninstallDisplayName: '千帆浏览器',
    deleteAppDataOnUninstall: false, runAfterFinish: false,
    installerLanguages: ['zh_CN', 'en_US'], language: '2052'
  },
  portable: { artifactName: 'QianfanBrowser-Portable-${version}-${arch}.${ext}' },
  publish: null
};
