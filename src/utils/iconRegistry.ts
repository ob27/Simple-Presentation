import * as AntIcons from '@ant-design/icons';

// Curated subset of @ant-design/icons relevant to diagramming — excludes
// pure app-chrome icons (spinners, carets, sort/align/menu-fold, table-edit
// icons) and third-party brand logos. Already an existing dependency, so
// this needs no new package — @ant-design/icons ships ~830 icons total.
export const CURATED_ICON_CATEGORIES: { category: string; icons: string[] }[] = [
  {
    category: 'Arrows & flow',
    icons: [
      'ArrowUpOutlined', 'ArrowDownOutlined', 'ArrowLeftOutlined', 'ArrowRightOutlined', 'ArrowsAltOutlined',
      'SwapOutlined', 'SwapLeftOutlined', 'SwapRightOutlined', 'RetweetOutlined', 'RollbackOutlined',
      'EnterOutlined', 'ExportOutlined', 'ImportOutlined', 'LoginOutlined', 'LogoutOutlined',
      'ForkOutlined', 'BranchesOutlined', 'NodeIndexOutlined', 'NodeExpandOutlined', 'NodeCollapseOutlined',
      'SubnodeOutlined', 'SisternodeOutlined', 'PartitionOutlined', 'ApartmentOutlined',
    ],
  },
  {
    category: 'Network & infra',
    icons: [
      'CloudOutlined', 'CloudServerOutlined', 'CloudUploadOutlined', 'CloudDownloadOutlined', 'CloudSyncOutlined',
      'ClusterOutlined', 'DatabaseOutlined', 'DeploymentUnitOutlined', 'GatewayOutlined', 'ApiOutlined',
      'HddOutlined', 'DesktopOutlined', 'LaptopOutlined', 'TabletOutlined', 'MobileOutlined',
      'PrinterOutlined', 'WifiOutlined', 'UsbOutlined', 'BarcodeOutlined', 'QrcodeOutlined',
      'ScanOutlined', 'RobotOutlined', 'AppstoreOutlined', 'BlockOutlined', 'BuildOutlined',
      'ToolOutlined', 'ControlOutlined', 'SlidersOutlined', 'DashboardOutlined', 'RadarChartOutlined',
      'CompassOutlined',
    ],
  },
  {
    category: 'People & identity',
    icons: [
      'UserOutlined', 'UsergroupAddOutlined', 'UsergroupDeleteOutlined', 'UserAddOutlined', 'UserDeleteOutlined',
      'UserSwitchOutlined', 'TeamOutlined', 'IdcardOutlined', 'ContactsOutlined', 'SolutionOutlined',
      'ManOutlined', 'WomanOutlined', 'SmileOutlined', 'CustomerServiceOutlined',
    ],
  },
  {
    category: 'Documents & files',
    icons: [
      'FileOutlined', 'FileTextOutlined', 'FileAddOutlined', 'FileDoneOutlined', 'FileExcelOutlined',
      'FileWordOutlined', 'FilePdfOutlined', 'FilePptOutlined', 'FileImageOutlined', 'FileZipOutlined',
      'FileMarkdownOutlined', 'FileUnknownOutlined', 'FileExclamationOutlined', 'FileProtectOutlined', 'FileSearchOutlined',
      'FileSyncOutlined', 'FolderOutlined', 'FolderOpenOutlined', 'FolderAddOutlined', 'FolderViewOutlined',
      'SnippetsOutlined', 'CopyOutlined', 'ProfileOutlined', 'ProjectOutlined', 'ContainerOutlined',
      'ReadOutlined', 'BookOutlined', 'AccountBookOutlined', 'AuditOutlined', 'DiffOutlined',
      'PaperClipOutlined', 'TagOutlined', 'TagsOutlined', 'InboxOutlined',
    ],
  },
  {
    category: 'Communication',
    icons: [
      'MailOutlined', 'MessageOutlined', 'CommentOutlined', 'PhoneOutlined', 'SendOutlined',
      'NotificationOutlined', 'BellOutlined', 'SoundOutlined', 'AudioOutlined', 'AudioMutedOutlined',
      'GlobalOutlined', 'ShareAltOutlined', 'LinkOutlined',
    ],
  },
  {
    category: 'Security',
    icons: [
      'LockOutlined', 'UnlockOutlined', 'SafetyOutlined', 'SafetyCertificateOutlined', 'SecurityScanOutlined',
      'KeyOutlined', 'PropertySafetyOutlined', 'AlertOutlined', 'WarningOutlined', 'ExclamationCircleOutlined',
      'InfoCircleOutlined', 'BugOutlined',
    ],
  },
  {
    category: 'Media',
    icons: [
      'PictureOutlined', 'CameraOutlined', 'VideoCameraOutlined', 'VideoCameraAddOutlined', 'PlayCircleOutlined',
      'PauseCircleOutlined', 'PlaySquareOutlined', 'StopOutlined', 'FastForwardOutlined', 'FastBackwardOutlined',
      'StepForwardOutlined', 'StepBackwardOutlined', 'ForwardOutlined', 'BackwardOutlined', 'GifOutlined',
    ],
  },
  {
    category: 'Weather & nature',
    icons: ['SunOutlined', 'MoonOutlined', 'ThunderboltOutlined', 'FireOutlined', 'EnvironmentOutlined'],
  },
  {
    category: 'Business & objects',
    icons: [
      'HomeOutlined', 'ShopOutlined', 'BankOutlined', 'ShoppingCartOutlined', 'ShoppingOutlined',
      'CreditCardOutlined', 'WalletOutlined', 'DollarOutlined', 'EuroOutlined', 'PoundOutlined',
      'MoneyCollectOutlined', 'GiftOutlined', 'TrophyOutlined', 'CrownOutlined', 'StarOutlined',
      'HeartOutlined', 'FlagOutlined', 'PushpinOutlined', 'AimOutlined', 'RocketOutlined',
      'CarOutlined', 'TruckOutlined', 'MedicineBoxOutlined', 'ExperimentOutlined', 'BulbOutlined',
      'CoffeeOutlined', 'InsuranceOutlined', 'FundOutlined', 'LineChartOutlined', 'BarChartOutlined',
      'PieChartOutlined', 'AreaChartOutlined', 'DotChartOutlined', 'HeatMapOutlined', 'FunnelPlotOutlined',
      'StockOutlined',
    ],
  },
  {
    category: 'Borders & layout',
    icons: [
      'BorderOutlined', 'BorderInnerOutlined', 'BorderOuterOutlined', 'BorderTopOutlined', 'BorderBottomOutlined',
      'BorderLeftOutlined', 'BorderRightOutlined', 'BorderHorizontalOutlined', 'BorderVerticleOutlined',
      'RadiusUprightOutlined', 'RadiusUpleftOutlined', 'RadiusBottomrightOutlined', 'RadiusBottomleftOutlined',
    ],
  },
];

export const CURATED_ICON_NAMES: string[] = CURATED_ICON_CATEGORIES.flatMap(c => c.icons);

type AntIconComponent = React.ComponentType<{ style?: React.CSSProperties }>;

export function getAntdIconComponent(name: string): AntIconComponent | undefined {
  return (AntIcons as unknown as Record<string, AntIconComponent>)[name];
}

export function iconDisplayName(name: string): string {
  return name.replace(/Outlined$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}
