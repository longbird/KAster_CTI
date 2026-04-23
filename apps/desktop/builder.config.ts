const builderConfig = {
  appId: 'com.kaster.cti.desktop',
  productName: 'KAster Agent',
  directories: {
    output: 'release',
    buildResources: 'build',
  },
  files: ['out/**/*', 'package.json'],
  extraResources: [
    {
      from: 'build/icon.png',
      to: 'icon.png',
    },
  ],
  extraMetadata: {
    main: 'out/main/index.js',
  },
  asar: true,
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
      {
        target: 'portable',
        arch: ['x64'],
      },
    ],
    icon: 'build/icon.ico',
    artifactName: '${productName}-${version}-${arch}.${ext}',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: true,
    deleteAppDataOnUninstall: false,
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
  },
  portable: {
    artifactName: '${productName}-${version}-portable.${ext}',
  },
  publish: null,
};

export default builderConfig;
