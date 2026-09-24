' Runs one of the Radiance POS PowerShell tools with no console window at all.
'
' The shortcuts used to point straight at powershell.exe with -WindowStyle
' Hidden. That switch is applied by PowerShell itself, after the host has
' already been given a console — so every launch flashed a black window on the
' counter screen, and when the script then failed before it could put a dialog
' up, the flash was the entire visible result of clicking the icon.
'
' WScript.Shell's Run creates the process with the window hidden from the
' start, so nothing is ever drawn.
'
'   wscript.exe launch.vbs <script-name.ps1> [arguments...]

Option Explicit

Dim shell, fso, here, script, command, i

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

If WScript.Arguments.Count < 1 Then
    MsgBox "launch.vbs needs the name of the tool to run.", vbCritical, "Radiance POS"
    WScript.Quit 2
End If

here = fso.GetParentFolderName(WScript.ScriptFullName)
script = fso.BuildPath(here, WScript.Arguments(0))

If Not fso.FileExists(script) Then
    MsgBox "Radiance POS is missing " & WScript.Arguments(0) & "." & vbCrLf & vbCrLf & _
           "Repair the installation from Settings, or reinstall.", vbCritical, "Radiance POS"
    WScript.Quit 3
End If

command = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & script & """"
For i = 1 To WScript.Arguments.Count - 1
    command = command & " """ & WScript.Arguments(i) & """"
Next

' 0 = hidden window, True = wait, so Inno's waituntilterminated still works.
WScript.Quit shell.Run(command, 0, True)
