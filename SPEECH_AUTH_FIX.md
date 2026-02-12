# Google Cloud Speech-to-Text Authentication Fix

## 🚨 Problem Identified

**Error**: `Recognition error: Could not load default credentials`

**Root Cause**: Google Cloud Speech-to-Text SDK requires Service Account credentials for streaming, but the code was trying to use Application Default Credentials which don't exist on Render.

## ✅ Solution Applied

### 1. Fixed Import Statements
```javascript
// Before (CommonJS import issue)
import speech from '@google-cloud/speech';

// After (Node 22 + ESM compatible)
import speechPkg from '@google-cloud/speech';
const { SpeechClient } = speechPkg;
```

### 2. Enhanced GoogleCloudSTT Constructor
```javascript
class GoogleCloudSTT {
  constructor() {
    console.log('[GoogleCloudSTT] Initializing speech service...');
    
    // Use service account credentials from environment variable
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    
    if (serviceAccountKey) {
      console.log('[GoogleCloudSTT] Using service account credentials from environment');
      try {
        const credentials = JSON.parse(serviceAccountKey);
        this.speechClient = new SpeechClient({
          credentials: credentials,
        });
      } catch (parseError) {
        console.error('[GoogleCloudSTT] Failed to parse service account key:', parseError);
        throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_KEY format. Must be valid JSON.');
      }
    } else {
      console.log('[GoogleCloudSTT] No service account key found, trying default credentials');
      // Fallback to default credentials (for local development)
      this.speechClient = new SpeechClient();
    }
  }
}
```

### 3. Enhanced Opponent Language Fetching
```javascript
// Enhanced WebSocket connection to fetch user profile if nativeLanguage missing
if (!speaker?.nativeLanguage && speaker?._id) {
  try {
    const fullUser = await User.findById(speaker._id).select('nativeLanguage fullName');
    if (fullUser?.nativeLanguage) {
      speakerLanguageRaw = fullUser.nativeLanguage;
      console.log('[GoogleCloudProxy] Fetched nativeLanguage from profile:', speakerLanguageRaw);
    }
  } catch (profileError) {
    console.error('[GoogleCloudProxy] Error fetching user profile:', profileError);
  }
}
```

## 🔧 Environment Variables Required

### Render Environment Variables
```env
# For Translation (API Key works)
GOOGLE_CLOUD_API_KEY=your_google_cloud_api_key
GOOGLE_CLOUD_PROJECT_ID=your_project_id

# For Speech-to-Text (Service Account REQUIRED)
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"your-project-id","private_key":"-----BEGIN PRIVATE KEY-----\n...","client_email":"service-account@your-project.iam.gserviceaccount.com","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs"}
```

## 🚀 Expected Results After Fix

### ✅ Backend Logs Should Show:
```
[GoogleCloudSTT] Initializing speech service...
[GoogleCloudSTT] Using service account credentials from environment
[GoogleCloudProxy] Client connected
[GoogleCloudProxy] Fetched nativeLanguage from profile: hindi
[GoogleCloudProxy] Notified peer about new user: { from: 'Shiva', to: 'Shreekar', language: 'hindi' }
```

### ✅ Frontend Should Show:
- **Languages dropdown loads** with 195+ languages
- **Opponent language displays** when they join call
- **Real-time captions work** without authentication errors
- **Translation works** between different languages
- **No more "Could not load default credentials" errors**

### ✅ WebSocket Connection Should:
- Establish successfully
- Stay connected (no more 1006 errors)
- Send/receive audio data properly
- Display opponent's language information

## 🎯 Testing Checklist

- [ ] Backend starts without authentication errors
- [ ] Speech-to-Text initializes with service account
- [ ] Languages API returns 195+ languages
- [ ] WebSocket connections stay alive
- [ ] Opponent language displays when joining call
- [ ] Real-time captions appear
- [ ] Translation works between languages

## 🔍 Debugging Tips

### If Still Getting Authentication Errors:
1. **Verify Service Account JSON**: Ensure it's properly formatted and minified
2. **Check Environment Variable**: Make sure `GOOGLE_SERVICE_ACCOUNT_KEY` is set correctly in Render
3. **Verify Service Account Permissions**: Ensure it has `Speech-to-Text Admin` role
4. **Check Project ID**: Ensure it matches your Google Cloud project

### If Opponent Language Still Not Showing:
1. **Check User Profiles**: Verify users have `nativeLanguage` field set in MongoDB
2. **Check WebSocket Messages**: Look for "peer" type messages in browser console
3. **Verify Room Logic**: Ensure both users are in the same callId room

## 📋 Files Modified

1. **`backend/src/lib/googleCloud.js`**:
   - Fixed SpeechClient import for Node 22 + ESM
   - Enhanced constructor to use service account credentials
   - Added proper error handling for JSON parsing

2. **`backend/src/server.js`**:
   - Enhanced user profile fetching for missing nativeLanguage
   - Improved peer notification logging
   - Better error handling for profile fetching

## 🚨 Important Notes

- **Service Account Required**: Speech-to-Text streaming requires service account, API key won't work
- **JSON Format**: Service account key must be valid JSON string in environment variable
- **Permissions**: Service account needs `Speech-to-Text Admin` and `Cloud Translation User` roles
- **Translation vs Speech**: Translation can use API key, but Speech requires service account
