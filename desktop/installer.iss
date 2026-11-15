#define MyAppName "NAVDECK Desktop"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "NAVDECK"
#define MyAppExeName "NavdeckDesktop.exe"

[Setup]
AppId={{B8304B37-8B52-40E2-B67B-8CDA2DAE48E9}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\NAVDECK Desktop
DefaultGroupName=NAVDECK Desktop
DisableProgramGroupPage=yes
OutputDir=..\desktop-installer
OutputBaseFilename=NAVDECK-Desktop-Setup-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
SetupIconFile=NavdeckDesktop\navdeck.ico
PrivilegesRequired=admin
CloseApplications=yes
RestartApplications=yes

[Files]
Source: "..\desktop-output\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\NAVDECK Desktop"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\NAVDECK Desktop"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch NAVDECK Desktop"; Flags: nowait postinstall skipifsilent
