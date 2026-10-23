@echo off
setlocal DisableDelayedExpansion
if not defined DSH_UNCENSORED_HOME set "DSH_UNCENSORED_HOME=%USERPROFILE%\.dsh-uncensored"
set "DSH_HOME=%DSH_UNCENSORED_HOME%"
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0..\..\..\..\DeepSeek Harness Uncensored.exe" --expose-internals "%~dp0..\..\..\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js" %*
exit /b %errorlevel%
