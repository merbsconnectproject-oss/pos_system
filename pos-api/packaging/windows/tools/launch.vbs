' Runs one of the Radiance POS PowerShell tools.
'
'   wscript launch.vbs [/elevate] [/show] <script-name.ps1> [arguments...]
'
'   /elevate  relaunch through UAC, so setup never depends on somebody
'             remembering to right-click and choose "Run as administrator"
'   /show     leave the console visible — used for setup, where an error the
'             operator cannot see is worse than a window they did not want
'
' The shortcuts used to point straight at powershell.exe with -WindowStyle
' Hidden. PowerShell applies that switch after the host already owns a console,
' so every launch flashed a black window; and when the script then failed, the
' flash was the entire visible result of clicking the icon. Nothing below is
' allowed to end without saying why.

Option Explicit

Dim shell, fso, app, args, i, arg
Dim elevate, visible, scriptName, extra, scriptPath, style, code

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

elevate = False
visible = False
scriptName = ""
extra = ""

Set args = WScript.Arguments
For i = 0 To args.Count - 1
    arg = args(i)
    If scriptName = "" And LCase(arg) = "/elevate" Then
        elevate = True
    ElseIf scriptName = "" And LCase(arg) = "/show" Then
        visible = True
    ElseIf scriptName = "" Then
        scriptName = arg
    Else
        extra = extra & " """ & arg & """"
    End If
Next

If scriptName = "" Then
    MsgBox "launch.vbs needs the name of the tool to run.", vbCritical, "Radiance POS"
    WScript.Quit 2
End If

app = fso.GetParentFolderName(WScript.ScriptFullName)
scriptPath = fso.BuildPath(app, scriptName)

If Not fso.FileExists(scriptPath) Then
    MsgBox "Radiance POS is missing " & scriptName & "." & vbCrLf & vbCrLf & _
           "This installation is incomplete. Reinstall Radiance POS.", _
           vbCritical, "Radiance POS"
    WScript.Quit 3
End If

' -NonInteractive is deliberately absent: the setup wizard is a WinForms dialog,
' and a host told it may not interact has no business showing one.
Dim psArgs
psArgs = "-NoProfile -ExecutionPolicy Bypass -File """ & scriptPath & """" & extra

If elevate Then
    ' ShellExecute with "runas" raises the UAC prompt itself. Run() cannot, so a
    ' tool needing administrator rights could only ever fail and say so.
    If visible Then style = 1 Else style = 0
    On Error Resume Next
    CreateObject("Shell.Application").ShellExecute _
        "powershell.exe", psArgs, app, "runas", style
    If Err.Number <> 0 Then
        ' The only ordinary cause is the operator declining the prompt.
        MsgBox "Radiance POS needs administrator permission to continue." & vbCrLf & vbCrLf & _
               "Click Yes on the Windows permission prompt, or sign in to an " & _
               "administrator account and try again.", vbExclamation, "Radiance POS"
        WScript.Quit 4
    End If
    On Error Goto 0
    WScript.Quit 0
End If

If visible Then style = 1 Else style = 0
' Run takes a single command line, so the host is named here; ShellExecute above
' takes it as a separate argument.
code = shell.Run("powershell.exe " & psArgs, style, True)

' 64 is the agreed code for "the operator has already been shown a dialog", and
' every tool here uses it. Any other non-zero code is a death before the tool's
' own error handling could run — a blocked execution policy, a host that would
' not start, a script that never began — which is exactly the case that used to
' leave the counter with an icon that did nothing at all.
If code <> 0 And code <> 64 Then
    MsgBox "Radiance POS could not finish " & scriptName & "." & vbCrLf & vbCrLf & _
           "Exit code: " & code & vbCrLf & vbCrLf & _
           "Open 'Radiance POS Diagnostics' from the Start menu, or look in" & vbCrLf & _
           "ProgramData\GiftedLabs\Radiance POS\logs.", vbCritical, "Radiance POS"
End If

WScript.Quit code
