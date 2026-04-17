@echo off
chcp 65001 >nul
echo ========================================
echo   勤怠管理システム GitHubプッシュ＆デプロイ
echo ========================================
echo.
set /p commit_msg="コミットメッセージを入力してください（空欄の場合は 'Auto deploy' になります）: "
if "%commit_msg%"=="" set commit_msg=Auto deploy

echo.
echo GitHubへ変更をプッシュしています...
call git add .
call git commit -m "%commit_msg%"
call git push

if %errorlevel% neq 0 (
    echo.
    echo [エラー] プッシュに失敗しました。
    pause
    exit /b 1
)

echo.
echo ========================================
echo   プッシュ完了！
echo   Cloudflare上で自動ビルドとデプロイが開始されます。
echo ========================================
echo.
pause
