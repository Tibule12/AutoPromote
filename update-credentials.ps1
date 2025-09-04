# Update the .env file with new Firebase credentials
# To run:
# 1. Generate new service account key from Firebase Console
# 2. Run: powershell -ExecutionPolicy Bypass -File .\update-credentials.ps1
# 3. Follow the prompts to update your credentials

# Function to help select a service account JSON file using GUI
function Select-ServiceAccountFile {
    Add-Type -AssemblyName System.Windows.Forms
    $fileDialog = New-Object System.Windows.Forms.OpenFileDialog
    $fileDialog.Title = "Select Firebase Service Account JSON File"
    $fileDialog.Filter = "JSON Files (*.json)|*.json|All Files (*.*)|*.*"
    $fileDialog.ShowDialog() | Out-Null
    return $fileDialog.FileName
}

# Check if .env file exists
if (-not (Test-Path -Path ".env")) {
    Write-Error "No .env file found in the current directory."
    Write-Host "Would you like to create a new .env file? (y/n)" -ForegroundColor Yellow
    $createEnv = Read-Host
    
    if ($createEnv -eq "y") {
        # Create a new .env file from .env.example if it exists
        if (Test-Path -Path ".env.example") {
            Copy-Item -Path ".env.example" -Destination ".env"
            Write-Host "Created new .env file from .env.example" -ForegroundColor Green
        } else {
            # Create a basic .env file
            @"
# Firebase Admin SDK Configuration
FIREBASE_SERVICE_ACCOUNT=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Firebase Client Configuration
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_DATABASE_URL=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=

# Server Configuration
PORT=5000
FRONTEND_URL=http://localhost:3000
"@ | Set-Content -Path ".env"
            Write-Host "Created new basic .env file" -ForegroundColor Green
        }
    } else {
        exit 1
    }
}

# Prompt for new credentials
Write-Host "Firebase Credential Update Script" -ForegroundColor Green
Write-Host "===============================" -ForegroundColor Green
Write-Host ""
Write-Host "This script will update your Firebase credentials in the .env file." -ForegroundColor Yellow
Write-Host "You should have already generated new credentials in the Firebase Console." -ForegroundColor Yellow
Write-Host ""

# Create a backup of the .env file
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = ".env.backup-$timestamp"
Copy-Item -Path ".env" -Destination $backupPath
Write-Host "Created backup of .env file at $backupPath" -ForegroundColor Cyan
Write-Host ""

# Ask if user wants to use a service account JSON file
Write-Host "Do you want to select a service account JSON file? (Recommended) (y/n)" -ForegroundColor Cyan
$useJsonFile = Read-Host

if ($useJsonFile -eq "y") {
    Write-Host "Please select your Firebase service account JSON file..." -ForegroundColor Yellow
    $jsonFilePath = Select-ServiceAccountFile
    
    if ([string]::IsNullOrEmpty($jsonFilePath) -or -not (Test-Path $jsonFilePath)) {
        Write-Host "No file selected or file does not exist." -ForegroundColor Red
        Write-Host "Would you like to enter credentials manually instead? (y/n)" -ForegroundColor Yellow
        $manualEntry = Read-Host
        
        if ($manualEntry -ne "y") {
            exit 1
        }
        $useJsonFile = "n"
    } else {
        try {
            # Read and validate the JSON file
            $jsonContent = Get-Content -Path $jsonFilePath -Raw
            $jsonObject = $jsonContent | ConvertFrom-Json
            
            # Check if it's a valid service account file
            if (-not $jsonObject.project_id -or -not $jsonObject.private_key -or -not $jsonObject.client_email) {
                Write-Host "The selected file does not appear to be a valid Firebase service account JSON file." -ForegroundColor Red
                $useJsonFile = "n"
            } else {
                Write-Host "Valid service account JSON file detected for project: $($jsonObject.project_id)" -ForegroundColor Green
                
                # Update .env file with service account JSON
                $envContent = Get-Content -Path ".env" -Raw
                
                # Format JSON for .env file (remove newlines)
                $formattedJson = $jsonContent -replace "`r`n", "" -replace "`n", ""
                
                # Replace or add service account JSON
                if ($envContent -match "FIREBASE_SERVICE_ACCOUNT=") {
                    $envContent = $envContent -replace "(?m)^FIREBASE_SERVICE_ACCOUNT=.*$", "FIREBASE_SERVICE_ACCOUNT=$formattedJson"
                } else {
                    $envContent += "`nFIREBASE_SERVICE_ACCOUNT=$formattedJson"
                }
                
                # Update individual fields too
                if ($envContent -match "FIREBASE_PROJECT_ID=") {
                    $envContent = $envContent -replace "(?m)^FIREBASE_PROJECT_ID=.*$", "FIREBASE_PROJECT_ID=$($jsonObject.project_id)"
                } else {
                    $envContent += "`nFIREBASE_PROJECT_ID=$($jsonObject.project_id)"
                }
                
                if ($envContent -match "FIREBASE_CLIENT_EMAIL=") {
                    $envContent = $envContent -replace "(?m)^FIREBASE_CLIENT_EMAIL=.*$", "FIREBASE_CLIENT_EMAIL=$($jsonObject.client_email)"
                } else {
                    $envContent += "`nFIREBASE_CLIENT_EMAIL=$($jsonObject.client_email)"
                }
                
                # Format private key for .env file
                $privateKey = $jsonObject.private_key -replace "`r`n", "\n" -replace "`n", "\n"
                
                if ($envContent -match "FIREBASE_PRIVATE_KEY=") {
                    $envContent = $envContent -replace "(?m)^FIREBASE_PRIVATE_KEY=.*$", "FIREBASE_PRIVATE_KEY=$privateKey"
                } else {
                    $envContent += "`nFIREBASE_PRIVATE_KEY=$privateKey"
                }
                
                # Write updated content back to .env
                Set-Content -Path ".env" -Value $envContent
                
                Write-Host "Firebase service account JSON and individual fields updated successfully!" -ForegroundColor Green
            }
        } catch {
            Write-Host "Error reading or parsing the JSON file: $_" -ForegroundColor Red
            $useJsonFile = "n"
        }
    }
}

# If not using JSON file, ask for individual credentials
if ($useJsonFile -ne "y") {
    Write-Host "Please enter your Firebase credentials manually:" -ForegroundColor Yellow
    Write-Host "Note: You can find these in your Firebase project settings." -ForegroundColor Yellow
    Write-Host ""
    
    $projectId = Read-Host "Enter the Firebase project ID"
    $clientEmail = Read-Host "Enter the Firebase client email"
    $privateKey = Read-Host "Enter the Firebase private key (with \n for newlines)"
    
    # Validate inputs
    if ([string]::IsNullOrEmpty($projectId) -or [string]::IsNullOrEmpty($clientEmail) -or [string]::IsNullOrEmpty($privateKey)) {
        Write-Host "All credential fields are required. Using values from backup file." -ForegroundColor Red
        Copy-Item -Path $backupPath -Destination ".env" -Force
        exit 1
    }
    
    # Update .env file with individual credentials
    $envContent = Get-Content -Path ".env" -Raw
    
    # Replace or add project ID
    if ($envContent -match "FIREBASE_PROJECT_ID=") {
        $envContent = $envContent -replace "(?m)^FIREBASE_PROJECT_ID=.*$", "FIREBASE_PROJECT_ID=$projectId"
    } else {
        $envContent += "`nFIREBASE_PROJECT_ID=$projectId"
    }
    
    # Replace or add client email
    if ($envContent -match "FIREBASE_CLIENT_EMAIL=") {
        $envContent = $envContent -replace "(?m)^FIREBASE_CLIENT_EMAIL=.*$", "FIREBASE_CLIENT_EMAIL=$clientEmail"
    } else {
        $envContent += "`nFIREBASE_CLIENT_EMAIL=$clientEmail"
    }
    
    # Replace or add private key
    if ($envContent -match "FIREBASE_PRIVATE_KEY=") {
        $envContent = $envContent -replace "(?m)^FIREBASE_PRIVATE_KEY=.*$", "FIREBASE_PRIVATE_KEY=$privateKey"
    } else {
        $envContent += "`nFIREBASE_PRIVATE_KEY=$privateKey"
    }
    
    # Write updated content back to .env
    Set-Content -Path ".env" -Value $envContent
    
    Write-Host "Individual Firebase credentials updated successfully!" -ForegroundColor Green
}

# Update other Firebase configuration values
Write-Host ""
Write-Host "Would you like to update other Firebase configuration values? (y/n)" -ForegroundColor Cyan
$updateOtherConfigs = Read-Host

if ($updateOtherConfigs -eq "y") {
    Write-Host "Enter the following Firebase configuration values (press Enter to skip):" -ForegroundColor Yellow
    
    $apiKey = Read-Host "Firebase API Key"
    $authDomain = Read-Host "Firebase Auth Domain"
    $databaseURL = Read-Host "Firebase Database URL (optional)"
    $storageBucket = Read-Host "Firebase Storage Bucket"
    $messagingSenderId = Read-Host "Firebase Messaging Sender ID (optional)"
    $appId = Read-Host "Firebase App ID"
    
    $envContent = Get-Content -Path ".env" -Raw
    
    # Update values if provided
    if (-not [string]::IsNullOrEmpty($apiKey)) {
        if ($envContent -match "FIREBASE_API_KEY=") {
            $envContent = $envContent -replace "(?m)^FIREBASE_API_KEY=.*$", "FIREBASE_API_KEY=$apiKey"
        } else {
            $envContent += "`nFIREBASE_API_KEY=$apiKey"
        }
        
        # Also update REACT_APP version if it exists
        if ($envContent -match "REACT_APP_FIREBASE_API_KEY=") {
            $envContent = $envContent -replace "(?m)^REACT_APP_FIREBASE_API_KEY=.*$", "REACT_APP_FIREBASE_API_KEY=$apiKey"
        }
    }
    
    if (-not [string]::IsNullOrEmpty($authDomain)) {
        if ($envContent -match "FIREBASE_AUTH_DOMAIN=") {
            $envContent = $envContent -replace "(?m)^FIREBASE_AUTH_DOMAIN=.*$", "FIREBASE_AUTH_DOMAIN=$authDomain"
        } else {
            $envContent += "`nFIREBASE_AUTH_DOMAIN=$authDomain"
        }
        
        # Also update REACT_APP version if it exists
        if ($envContent -match "REACT_APP_FIREBASE_AUTH_DOMAIN=") {
            $envContent = $envContent -replace "(?m)^REACT_APP_FIREBASE_AUTH_DOMAIN=.*$", "REACT_APP_FIREBASE_AUTH_DOMAIN=$authDomain"
        }
    }
    
    if (-not [string]::IsNullOrEmpty($databaseURL)) {
        if ($envContent -match "FIREBASE_DATABASE_URL=") {
            $envContent = $envContent -replace "(?m)^FIREBASE_DATABASE_URL=.*$", "FIREBASE_DATABASE_URL=$databaseURL"
        } else {
            $envContent += "`nFIREBASE_DATABASE_URL=$databaseURL"
        }
    }
    
    if (-not [string]::IsNullOrEmpty($storageBucket)) {
        if ($envContent -match "FIREBASE_STORAGE_BUCKET=") {
            $envContent = $envContent -replace "(?m)^FIREBASE_STORAGE_BUCKET=.*$", "FIREBASE_STORAGE_BUCKET=$storageBucket"
        } else {
            $envContent += "`nFIREBASE_STORAGE_BUCKET=$storageBucket"
        }
        
        # Also update REACT_APP version if it exists
        if ($envContent -match "REACT_APP_FIREBASE_STORAGE_BUCKET=") {
            $envContent = $envContent -replace "(?m)^REACT_APP_FIREBASE_STORAGE_BUCKET=.*$", "REACT_APP_FIREBASE_STORAGE_BUCKET=$storageBucket"
        }
    }
    
    if (-not [string]::IsNullOrEmpty($messagingSenderId)) {
        if ($envContent -match "FIREBASE_MESSAGING_SENDER_ID=") {
            $envContent = $envContent -replace "(?m)^FIREBASE_MESSAGING_SENDER_ID=.*$", "FIREBASE_MESSAGING_SENDER_ID=$messagingSenderId"
        } else {
            $envContent += "`nFIREBASE_MESSAGING_SENDER_ID=$messagingSenderId"
        }
        
        # Also update REACT_APP version if it exists
        if ($envContent -match "REACT_APP_FIREBASE_MESSAGING_SENDER_ID=") {
            $envContent = $envContent -replace "(?m)^REACT_APP_FIREBASE_MESSAGING_SENDER_ID=.*$", "REACT_APP_FIREBASE_MESSAGING_SENDER_ID=$messagingSenderId"
        }
    }
    
    if (-not [string]::IsNullOrEmpty($appId)) {
        if ($envContent -match "FIREBASE_APP_ID=") {
            $envContent = $envContent -replace "(?m)^FIREBASE_APP_ID=.*$", "FIREBASE_APP_ID=$appId"
        } else {
            $envContent += "`nFIREBASE_APP_ID=$appId"
        }
        
        # Also update REACT_APP version if it exists
        if ($envContent -match "REACT_APP_FIREBASE_APP_ID=") {
            $envContent = $envContent -replace "(?m)^REACT_APP_FIREBASE_APP_ID=.*$", "REACT_APP_FIREBASE_APP_ID=$appId"
        }
    }
    
    # Write updated content back to .env
    Set-Content -Path ".env" -Value $envContent
    
    Write-Host "Additional Firebase configuration values updated successfully!" -ForegroundColor Green
}

# Test the connection
Write-Host ""
Write-Host "Would you like to test the Firebase connection with the new credentials? (y/n)" -ForegroundColor Cyan
$testConnection = Read-Host

if ($testConnection -eq "y") {
    Write-Host "Running Firebase diagnostic tests..." -ForegroundColor Cyan
    
    try {
        # First try the comprehensive diagnostics if available
        if (Test-Path -Path "firebase-diagnostics.js") {
            Write-Host "Running comprehensive Firebase diagnostics..." -ForegroundColor Yellow
            node firebase-diagnostics.js
        } else {
            # Fall back to basic connection tests
            Write-Host "Running basic Firebase connection tests..." -ForegroundColor Yellow
            
            if (Test-Path -Path "test-firebase-connection.js") {
                node test-firebase-connection.js
            }
            
            if (Test-Path -Path "test-firebase-auth.js") {
                node test-firebase-auth.js
            }
        }
    } catch {
        Write-Host "Failed to test Firebase connection. Error: $_" -ForegroundColor Red
        Write-Host "Check that you have Node.js installed and the required dependencies." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Credential update process completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Restart your server to apply the new credentials" -ForegroundColor White
Write-Host "2. If tests show the connection is successful, your authentication should now work" -ForegroundColor White
Write-Host "3. If you continue to have issues, check the TROUBLESHOOTING_401.md file" -ForegroundColor White
Write-Host ""
Write-Host "Remember: A backup of your original .env file was created at $backupPath" -ForegroundColor Yellow
