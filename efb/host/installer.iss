#define MyAppName "NAVDECK EFB"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "NAVDECK"
#define MyAppExeName "NavdeckEFB.exe"

[Setup]
SourceDir=..\..
AppId=NAVDECK.EFB
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\NAVDECK EFB
DisableProgramGroupPage=yes
OutputDir=efb-installer
OutputBaseFilename=NAVDECK-EFB-Setup-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
SetupIconFile=efb\host\navdeck-efb.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
Source: "efb-output\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch NAVDECK EFB"; Flags: nowait postinstall skipifsilent
