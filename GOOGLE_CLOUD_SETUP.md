# Google Cloud Speech-to-Text and Translation Setup

This implementation uses Google Cloud Speech-to-Text and Translation APIs for real-time speech recognition and translation in video calls.

## Setup Instructions

### 1. Google Cloud Project Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing project
3. Enable the following APIs:
   - Cloud Speech-to-Text API
   - Cloud Translation API

### 2. Authentication

There are two ways to authenticate with Google Cloud:

#### Option A: API Key (Recommended for this implementation)

1. In Google Cloud Console, go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "API Key"
3. Copy the API key
4. Add the following environment variables to your backend:

```bash
GOOGLE_CLOUD_API_KEY=your_api_key_here
GOOGLE_CLOUD_PROJECT_ID=your_project_id_here
```

#### Option B: Service Account (Alternative)

1. Create a service account in Google Cloud Console
2. Download the JSON key file
3. Set the environment variable:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=path/to/your/service-account-key.json
   ```

### 3. Backend Environment Variables

Add these to your `.env` file in the backend:

```bash
# Google Cloud Configuration
GOOGLE_CLOUD_API_KEY=your_google_cloud_api_key
GOOGLE_CLOUD_PROJECT_ID=your_google_cloud_project_id

# Other existing variables...
PORT=5001
MONGO_URI=your_mongo_uri_here
JWT_SECRET_KEY=your_jwt_secret_here
FRONTEND_URL=https://your-frontend.vercel.app
NODE_ENV=production
```

### 4. Frontend Environment Variables

Make sure your frontend has the correct backend URL:

```bash
VITE_BACKEND_URL=http://localhost:5001  # for development
# or your deployed backend URL for production
```

## Features

### Real-time Speech Recognition
- Uses Google Cloud Speech-to-Text API
- Supports multiple languages including Indian languages
- Automatic language detection based on user profile
- Real-time streaming with low latency

### Translation
- Uses Google Cloud Translation API
- Supports translation between multiple languages
- Shows both original and translated text
- Language selection via dropdown

### Dual Caption Display
- **Original Text**: Shows what the user actually spoke in their language
- **Translated Text**: Shows the translation in the selected target language
- Language indicators showing source → target languages

### Supported Languages

The implementation supports the following languages:
- English (en)
- Telugu (te)
- Hindi (hi)
- Tamil (ta)
- Kannada (kn)
- Malayalam (ml)
- Punjabi (pa)
- Gujarati (gu)
- Marathi (mr)
- Bengali (bn)
- Odia (or)
- Assamese (as)
- Urdu (ur)
- Nepali (ne)
- Sanskrit (sa)
- French (fr)
- Spanish (es)
- German (de)
- Italian (it)
- Portuguese (pt)
- Russian (ru)
- Chinese (zh)
- Japanese (ja)
- Korean (ko)
- Arabic (ar)

## How It Works

1. **User A** speaks in their profile language (e.g., Telugu)
2. The audio is captured and sent to Google Cloud Speech-to-Text
3. The speech is converted to text in the original language
4. If **User B** has selected a different target language (e.g., Hindi), the text is translated
5. Both original and translated text appear in the video call interface

## Error Handling

The implementation includes comprehensive error handling:

- **API Key Errors**: Shows clear message if Google Cloud API key is missing
- **Quota Errors**: Handles API quota limits gracefully
- **Connection Errors**: Automatic reconnection with exponential backoff
- **Speech Recognition Errors**: Retry mechanism for failed recognition
- **Toast Notifications**: User-friendly error messages

## WebSocket Endpoint

The implementation uses WebSocket at `/ws/google-cloud` with the following parameters:
- `token`: JWT authentication token
- `language`: Speaker's profile language
- `target_language`: Target language for translation

## Deployment Notes

### Backend (Render)
- Make sure to add environment variables in Render dashboard
- The WebSocket endpoint will be available at `wss://your-app.onrender.com/ws/google-cloud`

### Frontend (Vercel)
- Add backend URL to environment variables
- The frontend will automatically connect to the correct WebSocket endpoint

## Testing

1. Start the backend server: `npm run dev`
2. Start the frontend: `npm run dev`
3. Join a video call
4. Enable live captions
5. Select your spoken language and target translation language
6. Start speaking - you should see both original and translated text

## Troubleshooting

### Common Issues

1. **"GOOGLE_CLOUD_API_KEY is not set"**
   - Make sure the API key is added to backend environment variables
   - Restart the backend server after adding the key

2. **"Google Cloud quota exceeded"**
   - Check your Google Cloud API quotas
   - Enable billing if necessary
   - Monitor usage in Google Cloud Console

3. **Connection issues**
   - Check that both frontend and backend are running
   - Verify WebSocket URL is correct
   - Check browser console for error messages

4. **No speech recognition**
   - Make sure microphone permissions are granted
   - Check that microphone is working in other applications
   - Verify audio is being captured (check browser console logs)

## Monitoring

Monitor the following:
- Google Cloud API usage and quotas
- Backend logs for WebSocket connections
- Frontend console for client-side errors
- Network tab in browser dev tools for WebSocket messages

## Cost Considerations

Google Cloud APIs are billed based on usage:
- Speech-to-Text: Billed per second of audio processed
- Translation: Billed per character translated
- Monitor usage to avoid unexpected costs
- Set up billing alerts in Google Cloud Console
