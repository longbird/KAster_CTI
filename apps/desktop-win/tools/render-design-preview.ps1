param([string]$OutputDirectory)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName System.Drawing
$bin=Join-Path $PSScriptRoot '../src/KAster.Desktop.App/bin/Release/net8.0-windows'
foreach($name in @('KAster.Desktop.Core','KAster.Desktop.Softphone','KAster.Desktop.App')){
 [void][Reflection.Assembly]::LoadFrom([IO.Path]::GetFullPath((Join-Path $bin "$name.dll")))
}
# Render only views. Never instantiate MainWindow or run application startup/network clients.
$app=[Windows.Application]::new()
foreach($name in @('Palette.Light','Icons','Tokens')){
 $app.Resources.MergedDictionaries.Add([Windows.Application]::LoadComponent([Uri]::new("/KAster.Desktop.App;component/Themes/$name.xaml",[UriKind]::Relative)))
}
[void][IO.Directory]::CreateDirectory($OutputDirectory)
$command=[KAster.Desktop.App.ViewModels.RelayCommand]::new([Action]{})
function New-Fixture{
 [pscustomobject]@{
  LoginId='agent1001';Extension='1001';AgentName='상담원';RememberMe=$true;AutoSignIn=$false;UseSoftphone=$false;ErrorMessage='';IsResuming=$false
  SignInCommand=$command;OpenSettingsCommand=$command;SignOutCommand=$command
  IsConnected=$true;IsAvailable=$true;ToggleAvailabilityCommand=$command;NoticeMessage=''
  WindowMode=[KAster.Desktop.App.Services.WindowMode]::Talking
  CalledLine='고객 상담';PhoneNumber='010-0000-1234';CustomerName='예시 고객';CallDurationText='02:34'
  MemoText=('서비스 이용 방법 문의'+[Environment]::NewLine+'안내 후 문자 발송 요청')
  IsMuted=$false;CanHold=$true;IsOnHold=$false;HoldButtonText='보류';ToggleHoldCommand=$command;ToggleMuteCommand=$command;HangupCommand=$command;AnswerCommand=$command
  Directory=[pscustomobject]@{OpenCommand=$command};Queues=[pscustomobject]@{OpenCommand=$command}
  Announcements=[pscustomobject]@{OpenCommand=$command;EntryText='공지';HasUnread=$true}
  History=[pscustomobject]@{OpenHistoryCommand=$command};Update=[pscustomobject]@{HasUpdate=$false;IsRequired=$false}
  Dial=[pscustomobject]@{IsDialing=$false;DialingNumber='010-0000-1234';ShowsCallerIdPicker=$false;CallerIds=@('02-0000-1000');SelectedCallerId='02-0000-1000';DialNumber='';DialCommand=$command;IsOutboundCall=$false}
  DeskPhone=[pscustomobject]@{IsPhoneRegistered=$true;PhoneStatusText='전화기 연결됨';ShowsDeskPhoneSetup=$false;SipServerAddress='pbx.example.test';SipUsername='1001';SipDomain='pbx.example.test';SipTransport='UDP';SipPasswordDisplay='••••••••';IsSipPasswordVisible=$false;ToggleSipPasswordCommand=$command;RecheckDeskPhoneCommand=$command}
  Waiting=[pscustomobject]@{HasWaitingCalls=$false;ShowsWaitingAsList=$true;ShowsWaitingAsTile=$false;WaitingCalls=@();WaitingCallsHiddenText='';SetWaitingLayoutCommand=$command;PickupCommand=$command}
  Keypad=[pscustomobject]@{IsKeypadOpen=$false;ShowsKeypad=$true;EnteredDigits='12';SendDigitCommand=$command;ToggleKeypadCommand=$command}
  Transfer=[pscustomobject]@{StartTransferCommand=$command};Customer=[pscustomobject]@{HasCustomerInfo=$false;OpenCommand=$command}
 }
}
function Render-View($name,$fixture,$width,$height,$file){
 $type=[Type]::GetType("KAster.Desktop.App.Views.$name, KAster.Desktop.App",$true)
 $view=[Activator]::CreateInstance($type)
 $view.DataContext=$fixture;$view.FontFamily=$app.Resources['FontUi']
 $view.SetResourceReference([Windows.Controls.Control]::ForegroundProperty,'BrushText')
 $view.UseLayoutRounding=$true;$view.Width=$width;$view.Height=$height
 $view.Measure([Windows.Size]::new($width,$height));$view.Arrange([Windows.Rect]::new(0,0,$width,$height));$view.UpdateLayout()
 [void]$view.Dispatcher.Invoke([Action]{},[Windows.Threading.DispatcherPriority]::Render)
 $bitmap=[Windows.Media.Imaging.RenderTargetBitmap]::new($width,$height,96,96,[Windows.Media.PixelFormats]::Pbgra32)
 $bitmap.Render($view)
 $encoder=[Windows.Media.Imaging.PngBitmapEncoder]::new();$encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
 $stream=[IO.File]::Create((Join-Path $OutputDirectory "$file.png"))
 try{$encoder.Save($stream)}finally{$stream.Dispose()}
 Write-Output "$file ($width x $height)"
}
foreach($theme in @('Light','Dark')){
 $app.Resources.MergedDictionaries[0]=[Windows.Application]::LoadComponent([Uri]::new("/KAster.Desktop.App;component/Themes/Palette.$theme.xaml",[UriKind]::Relative))
 foreach($size in @('normal','minimum')){
  $w=if($size -eq 'normal'){424}else{404};$h=if($size -eq 'normal'){521}else{481}
  Render-View 'LoginView' (New-Fixture) $w $h "login-$theme-$size"
  Render-View 'IdleView' (New-Fixture) $w $h "idle-$theme-$size"
  $f=New-Fixture;$f.DeskPhone.IsPhoneRegistered=$false;$f.DeskPhone.ShowsDeskPhoneSetup=$true;$f.DeskPhone.PhoneStatusText='전화기 연결 안 됨'
  Render-View 'IdleView' $f $w $h "setup-$theme-$size"
  $f=New-Fixture;$f.Dial.IsDialing=$true
  Render-View 'IdleView' $f $w $h "dialing-$theme-$size"
  $f=New-Fixture;$f.Waiting.HasWaitingCalls=$true;$f.Waiting.WaitingCalls=@(
   [pscustomobject]@{Title='010-0000-2001';Subtitle='고객 상담 · 대기 12초';PhoneNumber='010-0000-2001'},
   [pscustomobject]@{Title='010-0000-2002';Subtitle='고객 상담 · 대기 24초';PhoneNumber='010-0000-2002'},
   [pscustomobject]@{Title='010-0000-2003';Subtitle='고객 상담 · 대기 36초';PhoneNumber='010-0000-2003'})
  $f.Dial.ShowsCallerIdPicker=$true;$f.Update.HasUpdate=$true;$f.Update.IsRequired=$true
  Render-View 'IdleView' $f $w $h "waiting-$theme-$size"
  $tw=if($size -eq 'normal'){444}else{404};$th=if($size -eq 'normal'){581}else{501}
  Render-View 'TalkingView' (New-Fixture) $tw $th "talking-$theme-$size"
  $f=New-Fixture;$f.Keypad.IsKeypadOpen=$true;$f.Customer.HasCustomerInfo=$true
  Render-View 'TalkingView' $f $tw $th "keypad-$theme-$size"
  $rh=if($size -eq 'normal'){381}else{341}
  $rw=if($size -eq 'normal'){424}else{384}
  Render-View 'RingingView' (New-Fixture) $rw $rh "ringing-$theme-$size"
 }
}
Write-Output "Output: $OutputDirectory"
