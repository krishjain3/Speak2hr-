@echo off
SETLOCAL EnableDelayedExpansion

echo Starting Speak2HR Java Spring Boot setup and run script...

:: Check for Java
where java >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Java not found. Please install Java 17+ and add it to your PATH.
    pause
    exit /b
)

:: Check for Node.js
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm (Node.js) not found. Please install Node.js 16+ and add it to your PATH.
    pause
    exit /b
)

:: Set JAVA_HOME if default JDK present
if not defined JAVA_HOME (
    if exist "C:\Program Files\Java\jdk-21" (
        set "JAVA_HOME=C:\Program Files\Java\jdk-21"
    ) else if exist "C:\Program Files\Java\jdk-17" (
        set "JAVA_HOME=C:\Program Files\Java\jdk-17"
    )
)

:: Setup Frontend
echo.
echo === Setting up Frontend ===
cd frontend
if not exist node_modules (
    echo Installing Node dependencies (this may take a while)...
    call npm install
)

:: Check for .env in Frontend
if not exist .env (
    if exist .env.example (
        echo Copying .env.example to .env ...
        copy .env.example .env
    )
)
cd ..

:: Start both servers
echo.
echo === Starting Servers ===
echo The Java Spring Boot Backend will start at http://localhost:8000
echo The React Frontend will start at http://localhost:3000
echo.

start cmd /k "mvnw.cmd spring-boot:run"
start cmd /k "cd frontend && npm start"

echo Servers are starting in separate windows.
echo Frontend: http://localhost:3000
echo Backend Health: http://localhost:8000/health
echo.
pause
