# Backend APIs

## Goal

Keep provider secrets and external AI calls outside the Chrome extension.

The backend should remain deliberately small for the hackathon.

## Endpoints

```text
POST /reason
POST /speech/transcribe
POST /speech/synthesize
```

## `/reason`

Input:

```json
{
  "userUtterance": "Mujhe PF ka paisa nikalna hai",
  "session": {
    "goal": "PF withdrawal",
    "recentActions": []
  },
  "page": {
    "title": "Member Dashboard",
    "elements": [
      {
        "id": "el_17",
        "role": "button",
        "label": "Online Services",
        "visible": true,
        "disabled": false
      }
    ]
  }
}
```

Output must match the strict `GuideAction` schema.

## `/speech/transcribe`

Accept recorded audio and forward it to Sarvam STT.

Return a provider-neutral result:

```json
{
  "transcript": "Mujhe PF ka paisa nikalna hai",
  "language": "hi-IN"
}
```

## `/speech/synthesize`

Input:

```json
{
  "text": "Online Services par click kariye.",
  "language": "hi-IN"
}
```

Return playable audio.

## Security

- provider keys from server environment variables
- validate payload sizes
- never log sensitive input values
- CORS restricted to extension/demo origins where practical
- no arbitrary prompt/tool execution endpoint

## Deployment

Use the simplest deployment compatible with:

- HTTPS
- low latency
- environment secrets
- binary audio requests/responses

No database is needed for MVP.

## Definition of Done

The extension can call reasoning and voice services without exposing any third-party API key in its distributed bundle.
